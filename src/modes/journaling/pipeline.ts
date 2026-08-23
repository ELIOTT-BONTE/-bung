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
 */

import { computeWordDiff, hasChanges, type DiffSegment } from '../../diff';
import {
  buildCorrectionCheckPrompt,
  buildCorrectionPrompt,
  buildJournalVocabPrompt,
  generateText,
  parseCorrection,
  parseCorrectionCheck,
  parseJournalVocab,
} from '../../inference';
import {
  attachCorrection,
  createJournalEntry,
  normalizeTerm,
  recordMasteryAttempt,
  toVocabDrafts,
  upsertVocabDrafts,
  type JournalEntry,
  type MasteryAttemptResult,
  type RejectedVocabItem,
  type ReviewGrade,
  type VocabEntry,
} from '../../storage';

export const VOCAB_EXTRACTION_LIMIT = 6;

/** Correct unaided usage in the learner's own writing. */
const CORRECT_USAGE_GRADE: ReviewGrade = 4;
/** Used, but the correction had to change it. Comes back soon. */
const CORRECTED_USAGE_GRADE: ReviewGrade = 2;

export interface JournalUsage {
  entry: VocabEntry;
  usedCorrectly: boolean;
  note: string | null;
}

export interface JournalReview {
  entry: JournalEntry;
  diff: DiffSegment[];
  correctedText: string | null;
  correctionSummary: string | null;
  usage: JournalUsage[];
  rejected: RejectedVocabItem[];
  masteryResults: MasteryAttemptResult[];
}

export type ProgressStage =
  | 'saving'
  | 'checking'
  | 'correcting'
  | 'extracting'
  | 'recording';

export const STAGE_LABELS: Record<ProgressStage, string> = {
  saving: 'Saving your entry…',
  checking: 'Checking whether anything needs correcting…',
  correcting: 'Writing a corrected version…',
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

  report('checking');
  const check = parseCorrectionCheck(await generateText(buildCorrectionCheckPrompt(text)));

  let correctedText: string | null = null;
  if (check.needsCorrection) {
    report('correcting');
    const corrected = parseCorrection(await generateText(buildCorrectionPrompt(text)));
    // Trust the diff, not the flag: if the "correction" came back identical,
    // there was nothing to correct after all.
    if (corrected !== '' && corrected !== text) correctedText = corrected;
  }

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
  const upserted = await upsertVocabDrafts(drafts);

  const usage: JournalUsage[] = upserted.map((result) => {
    const key = normalizeTerm(result.entry.term);
    return {
      entry: result.entry,
      usedCorrectly: usedCorrectlyByTerm.get(key) ?? true,
      note: noteByTerm.get(key) ?? null,
    };
  });

  const reviewed = await attachCorrection(entry.id, {
    correctedText,
    correctionSummary: check.needsCorrection ? check.summary : null,
    diff,
    vocabIds: usage.map((item) => item.entry.id),
  });

  report('recording');
  const masteryResults: MasteryAttemptResult[] = [];
  for (const item of usage) {
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
    usage: usage.map((item) => ({ ...item, entry: masteryById.get(item.entry.id) ?? item.entry })),
    rejected,
    masteryResults,
  };
}

export function summarizeCorrection(review: JournalReview): string {
  if (!hasChanges(review.diff)) return 'No corrections needed — this reads naturally.';
  return review.correctionSummary ?? 'A few things were adjusted.';
}
