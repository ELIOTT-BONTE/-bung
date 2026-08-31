/**
 * Per-intent decoding settings.
 *
 * "Be creative" and "be exact" are properties of the task, not of the caller,
 * so they are declared next to the prompts rather than passed down from every
 * mode pipeline — the same reasoning that puts schema lookup in `generateText`.
 *
 * This exists because one shared `temperature: 0.7` was applied to every call
 * including the journal correction, where sampling variety is not a feature:
 * a rewrite has one right answer and any deviation from it is a new mistake
 * presented to the learner as a fix.
 */

import { PROMPT_INTENT, readPromptIntent, type PromptIntent } from './prompts';
import type { InferenceOptions } from './types';

/** Applies to any prompt with no entry of its own. */
export const DEFAULT_SAMPLING = {
  temperature: 0.7,
  maxTokens: 640,
  reasoningEffort: 'low',
} as const satisfies Pick<InferenceOptions, 'temperature' | 'maxTokens' | 'reasoningEffort'>;

type Sampling = Pick<InferenceOptions, 'temperature' | 'maxTokens' | 'reasoningEffort'>;

export const SAMPLING_BY_INTENT: Partial<Record<PromptIntent, Sampling>> = {
  // A passage is the one place invention is the point.
  [PROMPT_INTENT.passage]: { temperature: 0.8 },

  // Grammar has one right answer, and getting there needs actual reasoning:
  // spotting a wrong article means holding the noun's gender in mind, not
  // picking the likeliest next token. The token budget covers the rewrite plus
  // the JSON envelope for a long entry.
  [PROMPT_INTENT.correction]: {
    temperature: 0.1,
    maxTokens: 1400,
    reasoningEffort: 'medium',
  },

  // Extraction and marking are lookups, not judgement calls.
  [PROMPT_INTENT.questionsAndVocab]: { temperature: 0.4 },
  [PROMPT_INTENT.journalVocab]: { temperature: 0.2 },
  [PROMPT_INTENT.answerEvaluation]: { temperature: 0.2 },
  [PROMPT_INTENT.sentenceEvaluation]: { temperature: 0.2 },
};

/** The decoding settings a built prompt should be answered with. */
export function samplingForPrompt(prompt: string): Sampling {
  const intent = readPromptIntent(prompt);
  return { ...DEFAULT_SAMPLING, ...(intent ? SAMPLING_BY_INTENT[intent] : undefined) };
}
