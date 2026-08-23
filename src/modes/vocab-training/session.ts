/**
 * Vocabulary training orchestration.
 *
 * The queue and the exercise choice come from the pure `srs` layer; this file
 * only moves data between it, storage and inference.
 *
 * Exposure vs mastery here:
 *   - presenting a card (either kind) shows the learner the word, so it counts
 *     as one exposure and nothing else
 *   - the answer they give is what logs a mastery-qualifying event
 */

import {
  buildSentenceEvaluationPrompt,
  generateText,
  parseSentenceEvaluation,
  type SentenceEvaluation,
} from '../../inference';
import { assignExercises, type TrainingExerciseType } from '../../srs';
import {
  formatVocabDisplay,
  getDueVocab,
  recordExposure,
  recordMasteryAttempt,
  type MasteryAttemptResult,
  type ReviewGrade,
  type VocabEntry,
} from '../../storage';

export interface TrainingItem {
  entry: VocabEntry;
  exerciseType: TrainingExerciseType;
}

export async function buildSession(
  limit: number,
  rng: () => number = Math.random,
): Promise<TrainingItem[]> {
  const due = await getDueVocab(Date.now(), limit);
  return assignExercises(due, (entry) => entry.masteryLevel, rng).map((scheduled) => ({
    entry: scheduled.item,
    exerciseType: scheduled.exerciseType,
  }));
}

/** Passive: the learner has now seen this word. Takes no outcome by design. */
export function recordCardShown(vocabId: string): Promise<void> {
  return recordExposure([vocabId], 'vocab-training');
}

export const FLASHCARD_GRADES: readonly { grade: ReviewGrade; label: string; hint: string }[] = [
  { grade: 1, label: 'Again', hint: 'no idea' },
  { grade: 3, label: 'Hard', hint: 'got there slowly' },
  { grade: 4, label: 'Good', hint: 'recalled it' },
  { grade: 5, label: 'Easy', hint: 'instant' },
];

/** Grade 3 and up is a pass, so it is the threshold for "actually recalled". */
export function gradeFlashcard(entry: VocabEntry, grade: ReviewGrade): Promise<MasteryAttemptResult> {
  return recordMasteryAttempt({
    vocabId: entry.id,
    exerciseType: 'flashcard',
    grade,
    correct: grade >= 3,
    sourceMode: 'vocab-training',
  });
}

export interface SentenceReview {
  evaluation: SentenceEvaluation;
  result: MasteryAttemptResult;
}

export async function gradeSentence(entry: VocabEntry, sentence: string): Promise<SentenceReview> {
  const evaluation = parseSentenceEvaluation(
    await generateText(
      buildSentenceEvaluationPrompt({
        term: entry.term,
        displayForm: formatVocabDisplay(entry),
        definition: entry.definition,
        sentence,
      }),
    ),
  );

  const result = await recordMasteryAttempt({
    vocabId: entry.id,
    exerciseType: 'sentence-production',
    grade: evaluation.grade as ReviewGrade,
    correct: evaluation.correct,
    sourceMode: 'vocab-training',
  });

  return { evaluation, result };
}

export interface SessionTally {
  reviewed: number;
  correct: number;
  masteryGained: number;
}

export function tally(results: readonly MasteryAttemptResult[]): SessionTally {
  return {
    reviewed: results.length,
    correct: results.filter((result) => result.passed).length,
    masteryGained: results.filter((result) => result.masteryIncreased).length,
  };
}
