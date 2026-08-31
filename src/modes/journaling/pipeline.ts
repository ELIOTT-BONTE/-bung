/**
 * Journaling orchestration.
 *
 * Two things worth being explicit about:
 *
 * 1. The diff is computed here, client-side, from the original text and the
 *    corrected text. The model is only ever asked for prose; it is never asked
 *    to describe its own edits, so a chatty or malformed answer can never
 *    corrupt the highlighting.
 *
 * 2. Journaling is production, not exposure, so no exposure counter moves. A
 *    word the learner used correctly logs a passing mastery event; a word the
 *    correction had to fix logs a failing one, which schedules it sooner
 *    instead of pretending the correction was already internalised.
 *
 * 3. Only words already in the learner's vocabulary are graded. Everything else
 *    the entry turned up is offered, not filed — writing a word is not a request
 *    to start studying it, and grading a word that is not on the list would mean
 *    silently putting it there. So an entry can end up recording nothing, which
 *    is the correct outcome for a learner who has not picked any words yet.
 */

import { computeWordDiff, hasChanges, type DiffSegment } from '../../diff';
import {
  buildCorrectionPrompt,
  buildJournalVocabPrompt,
  generateText,
  generateTextDetailed,
  parseCorrection,
  parseJournalVocab,
} from '../../inference';
import {
  attachCorrection,
  createJournalEntry,
  findVocabByTerm,
  normalizeTerm,
  recordMasteryAttempt,
  toVocabDrafts,
  type JournalEntry,
  type MasteryAttemptResult,
  type RejectedVocabItem,
  type ReviewGrade,
  type VocabDraft,
  type VocabEntry,
} from '../../storage';

export const VOCAB_EXTRACTION_LIMIT = 6;

/** Correct unaided usage in the learner's own writing. */
const CORRECT_USAGE_GRADE: ReviewGrade = 4;
/** Used, but the correction had to change it. Comes back soon. */
const CORRECTED_USAGE_GRADE: ReviewGrade = 2;

export interface JournalUsage {
  /** How the word would be saved, if the learner decides they want it. */
  draft: VocabDraft;
  /**
   * Their existing entry, or null for a word they do not track. A word they do
   * not track cannot be graded — there is nothing to grade — so it is offered
   * rather than recorded.
   */
  entry: VocabEntry | null;
  usedCorrectly: boolean;
  note: string | null;
}

/** A usage of a word the learner holds, which is what can carry a grade. */
type TrackedUsage = JournalUsage & { entry: VocabEntry };

export interface JournalReview {
  entry: JournalEntry;
  diff: DiffSegment[];
  correctedText: string | null;
  correctionSummary: string | null;
  /** Label of the engine that answered, so a bad correction is attributable. */
  correctionEngine: string;
  usage: JournalUsage[];
  rejected: RejectedVocabItem[];
  masteryResults: MasteryAttemptResult[];
}

export type ProgressStage = 'saving' | 'correcting' | 'extracting' | 'recording';

export const STAGE_LABELS: Record<ProgressStage, string> = {
  saving: 'Saving your entry…',
  correcting: 'Checking your German…',
  extracting: 'Picking out the words you used…',
  recording: 'Logging what you produced…',
};

export interface SubmitOptions {
  onStage?: (stage: ProgressStage) => void;
}

export async function submitJournalEntry(
  originalText: string,
  options: SubmitOptions = {},
): Promise<JournalReview> {
  const report = (stage: ProgressStage) => options.onStage?.(stage);
  const text = originalText.trim();

  report('saving');
  const entry = await createJournalEntry({ originalText: text });

  // One call, not two. A separate "does this need correcting?" round trip could
  // veto the rewrite before it was ever requested, and its verdict defaulted to
  // "no" whenever the reply was malformed — a parse slip read as perfect German.
  report('correcting');
  const answer = await generateTextDetailed(buildCorrectionPrompt(text));
  const correction = parseCorrection(answer.text);

  // Trust the diff, not the summary: if the rewrite came back identical, there
  // was nothing to correct whatever the model said about it.
  const correctedText = correction.correctedText === text ? null : correction.correctedText;

  const diff = computeWordDiff(text, correctedText ?? text);

  report('extracting');
  const extracted = parseJournalVocab(
    await generateText(
      buildJournalVocabPrompt({
        originalText: text,
        correctedText,
        maxItems: VOCAB_EXTRACTION_LIMIT,
      }),
    ),
  );

  const usedCorrectlyByTerm = new Map(
    extracted.map((item) => [normalizeTerm(item.term), item.usedCorrectly !== false]),
  );
  const noteByTerm = new Map(extracted.map((item) => [normalizeTerm(item.term), item.note]));

  const { drafts, rejected } = toVocabDrafts(extracted);

  // Nothing is stored here. Using a word is not the same as asking to study it,
  // and an entry that quietly filed six words would be deciding for the learner
  // what their vocabulary list contains.
  const usage: JournalUsage[] = await Promise.all(
    drafts.map(async (draft) => {
      const key = normalizeTerm(draft.term);
      return {
        draft,
        entry: (await findVocabByTerm(draft.term)) ?? null,
        usedCorrectly: usedCorrectlyByTerm.get(key) ?? true,
        note: noteByTerm.get(key) ?? null,
      };
    }),
  );

  const tracked: TrackedUsage[] = usage.flatMap((item) =>
    item.entry ? [{ ...item, entry: item.entry }] : [],
  );

  const reviewed = await attachCorrection(entry.id, {
    correctedText,
    correctionSummary: correction.summary === '' ? null : correction.summary,
    correctionEngine: answer.label,
    diff,
    vocabIds: tracked.map((item) => item.entry.id),
  });

  report('recording');
  const masteryResults: MasteryAttemptResult[] = [];
  for (const item of tracked) {
    masteryResults.push(
      await recordMasteryAttempt({
        vocabId: item.entry.id,
        exerciseType: 'journal-usage',
        grade: item.usedCorrectly ? CORRECT_USAGE_GRADE : CORRECTED_USAGE_GRADE,
        correct: item.usedCorrectly,
        sourceMode: 'journaling',
        sourceId: reviewed.id,
      }),
    );
  }

  // Re-read the entries so the caller shows post-review mastery levels.
  const masteryById = new Map(masteryResults.map((result) => [result.entry.id, result.entry]));

  return {
    entry: reviewed,
    diff,
    correctedText,
    correctionSummary: reviewed.correctionSummary,
    correctionEngine: answer.label,
    usage: usage.map((item) =>
      item.entry ? { ...item, entry: masteryById.get(item.entry.id) ?? item.entry } : item,
    ),
    rejected,
    masteryResults,
  };
}

/**
 * The engine's own words win, including when it changed nothing. "This reads
 * naturally" is a claim about the learner's German, and an engine that cannot
 * judge grammar — or one that just declined to — must not get to make it.
 */
export function summarizeCorrection(review: JournalReview): string {
  if (review.correctionSummary !== null) return review.correctionSummary;
  return hasChanges(review.diff)
    ? 'A few things were adjusted.'
    : 'No corrections needed — this reads naturally.';
}
