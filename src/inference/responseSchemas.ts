/**
 * One JSON Schema per structured prompt, used to constrain generation.
 *
 * Both engines accept a JSON Schema and compile it to a token-level grammar
 * themselves — WebLLM through XGrammar, wllama through llama.cpp — so a schema
 * defined here is the single source of truth for both tiers.
 *
 * Two rules keep these schemas portable across those two compilers:
 *   - no nulls. Optional strings are plain strings and the caller sends `""`,
 *     which `asNullableString` already reads as absent. A `["string","null"]`
 *     union is not reliably supported by both converters, and a schema the
 *     engine rejects costs us constrained output entirely.
 *   - no nesting beyond an array of flat objects, which is all these replies
 *     need and all a 1.5B model handles well.
 *
 * These constrain shape, not truth: `schemas.ts` still parses defensively, and
 * the one long-form prose prompt (passage) has no schema at all.
 */

import { PROMPT_INTENT, readPromptIntent, type PromptIntent } from './prompts';
import type { JsonSchema, ResponseSchema } from './types';

const SHORT_TEXT: JsonSchema = { type: 'string' };

/**
 * Shared vocabulary item fields. `determiner` and `pluralForm` are required
 * rather than optional so a noun cannot come back without them — the whole
 * point of extracting them in the same call that finds the noun.
 */
const VOCAB_PROPERTIES: Record<string, JsonSchema> = {
  term: { type: 'string', description: 'Bare dictionary form, capitalised for nouns' },
  partOfSpeech: {
    type: 'string',
    enum: ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other'],
  },
  determiner: {
    type: 'string',
    enum: ['der', 'die', 'das', ''],
    description: 'Article for nouns, empty string otherwise',
  },
  pluralForm: {
    type: 'string',
    description: 'Full plural for nouns, empty string otherwise',
  },
  definition: { type: 'string', description: 'Short English gloss' },
};

const VOCAB_REQUIRED = ['term', 'partOfSpeech', 'determiner', 'pluralForm', 'definition'] as const;

const questionsAndVocabSchema: ResponseSchema = {
  name: 'questions_and_vocab',
  schema: {
    type: 'object',
    properties: {
      questions: { type: 'array', items: { type: 'string' } },
      vocab: {
        type: 'array',
        items: {
          type: 'object',
          properties: VOCAB_PROPERTIES,
          required: VOCAB_REQUIRED,
          additionalProperties: false,
        },
      },
    },
    required: ['questions', 'vocab'],
    additionalProperties: false,
  },
};

const answerEvaluationSchema: ResponseSchema = {
  name: 'answer_evaluation',
  schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            questionIndex: { type: 'integer', minimum: 0 },
            correct: { type: 'boolean' },
            feedback: SHORT_TEXT,
            demonstratedTerms: { type: 'array', items: { type: 'string' } },
          },
          required: ['questionIndex', 'correct', 'feedback', 'demonstratedTerms'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  },
};

/**
 * The rewrite is German prose, but it is schema-constrained anyway: pairing it
 * with the summary in one object is what removes the separate "does this need
 * correcting?" call, and a grammar is the only thing that stops a model from
 * answering a rewrite request with an apology.
 */
const correctionSchema: ResponseSchema = {
  name: 'correction',
  schema: {
    type: 'object',
    properties: {
      corrected: {
        type: 'string',
        description: 'The complete corrected German text, with no commentary',
      },
      summary: SHORT_TEXT,
    },
    required: ['corrected', 'summary'],
    additionalProperties: false,
  },
};

const journalVocabSchema: ResponseSchema = {
  name: 'journal_vocab',
  schema: {
    type: 'object',
    properties: {
      vocab: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ...VOCAB_PROPERTIES,
            usedCorrectly: { type: 'boolean' },
            note: { type: 'string', description: 'Optional English note, empty string if none' },
          },
          required: [...VOCAB_REQUIRED, 'usedCorrectly', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['vocab'],
    additionalProperties: false,
  },
};

/**
 * One word, not a list. The vocabulary fields are the shared ones, so a looked
 * up noun is held to exactly the same determiner-and-plural contract as one
 * extracted from a passage or a journal entry.
 */
const wordLookupSchema: ResponseSchema = {
  name: 'word_lookup',
  schema: {
    type: 'object',
    properties: {
      ...VOCAB_PROPERTIES,
      surfaceRole: {
        type: 'string',
        description: 'What the tapped form is, e.g. "dative plural of der Regenbogen"',
      },
    },
    required: [...VOCAB_REQUIRED, 'surfaceRole'],
    additionalProperties: false,
  },
};

const sentenceEvaluationSchema: ResponseSchema = {
  name: 'sentence_evaluation',
  schema: {
    type: 'object',
    properties: {
      correct: { type: 'boolean' },
      grade: { type: 'integer', minimum: 0, maximum: 5 },
      feedback: SHORT_TEXT,
    },
    required: ['correct', 'grade', 'feedback'],
    additionalProperties: false,
  },
};

/**
 * Looked up by `generateText` from the prompt's `### TASK:` line, so no mode
 * pipeline has to know that constrained generation exists.
 *
 * `passage` is absent on purpose: it is long-form prose with nothing to pair it
 * with, so wrapping it in JSON would only give the model a way to fail.
 */
export const SCHEMA_BY_INTENT: Partial<Record<PromptIntent, ResponseSchema>> = {
  [PROMPT_INTENT.questionsAndVocab]: questionsAndVocabSchema,
  [PROMPT_INTENT.answerEvaluation]: answerEvaluationSchema,
  [PROMPT_INTENT.correction]: correctionSchema,
  [PROMPT_INTENT.journalVocab]: journalVocabSchema,
  [PROMPT_INTENT.sentenceEvaluation]: sentenceEvaluationSchema,
  [PROMPT_INTENT.wordLookup]: wordLookupSchema,
};

/** The schema a built prompt should be answered with, if it wants JSON. */
export function schemaForPrompt(prompt: string): ResponseSchema | undefined {
  const intent = readPromptIntent(prompt);
  return intent ? SCHEMA_BY_INTENT[intent] : undefined;
}
