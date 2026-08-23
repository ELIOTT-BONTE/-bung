/**
 * Every prompt in the app lives here so all three modes share one inference
 * path. Prompts are plain text in, plain text out — structure is recovered by
 * `parse.ts`, never by trusting the model to emit a specific object type.
 *
 * Two conventions make prompts machine-readable without a template engine:
 *   - the first line is `### TASK: <intent>`, which lets a backend route
 *     (the mock backend uses this) and makes logs readable
 *   - inputs are wrapped in `--- SECTION ---` blocks, so a backend or test can
 *     recover the exact inputs with `readSection`
 */

export const PROMPT_INTENT = {
  passage: 'comprehension.passage',
  questionsAndVocab: 'comprehension.questions_and_vocab',
  answerEvaluation: 'comprehension.answer_evaluation',
  correctionCheck: 'journaling.correction_check',
  correction: 'journaling.correction',
  journalVocab: 'journaling.vocab_extraction',
  sentenceEvaluation: 'vocab.sentence_evaluation',
} as const;

export type PromptIntent = (typeof PROMPT_INTENT)[keyof typeof PROMPT_INTENT];

export const GERMAN_TUTOR_SYSTEM_PROMPT =
  'You are a precise, encouraging German tutor for an adult learner. ' +
  'You never invent German that a native speaker would not write. ' +
  'When asked for JSON you reply with JSON only and no commentary.';

/**
 * Shared instruction block for any call that extracts vocabulary. The
 * determiner and plural of a noun must come out of the same call that
 * identifies the noun — they are never derived later from the bare word.
 */
const NOUN_FIELDS_RULE = [
  'Vocabulary rules:',
  '- "partOfSpeech" is one of: noun, verb, adjective, adverb, phrase, other.',
  '- For every noun you MUST include "determiner" ("der", "die" or "das") and',
  '  "pluralForm" (the full plural, e.g. "Bahnhöfe"). Never omit or guess-blank them.',
  '- "term" for a noun is the bare singular, capitalised, without its article.',
  '- For anything that is not a noun set "determiner" and "pluralForm" to "".',
  '- "definition" is a short English translation or gloss.',
].join('\n');

function section(name: string, body: string): string {
  return `--- ${name} ---\n${body.trim()}\n--- END ${name} ---`;
}

function build(intent: PromptIntent, lines: readonly string[]): string {
  return [`### TASK: ${intent}`, '', ...lines].join('\n');
}

export function readPromptIntent(prompt: string): PromptIntent | null {
  const match = /^### TASK: (.+)$/m.exec(prompt);
  if (!match) return null;
  const intent = match[1].trim();
  const known = Object.values(PROMPT_INTENT) as string[];
  return known.includes(intent) ? (intent as PromptIntent) : null;
}

/** Recovers the body of a `--- NAME ---` block from a built prompt. */
export function readSection(prompt: string, name: string): string {
  const pattern = new RegExp(`--- ${name} ---\\n([\\s\\S]*?)\\n--- END ${name} ---`);
  const match = pattern.exec(prompt);
  return match ? match[1].trim() : '';
}

export interface PassagePromptInput {
  theme: string;
  /** Terms already in the learner's store; the passage should lean on these. */
  knownTerms: readonly string[];
  newWordBudget: number;
  approximateWords?: number;
}

export function buildPassagePrompt(input: PassagePromptInput): string {
  const { theme, knownTerms, newWordBudget, approximateWords = 120 } = input;
  return build(PROMPT_INTENT.passage, [
    `Write a short German reading passage of roughly ${approximateWords} words on the theme below.`,
    'Requirements:',
    '- Natural, contemporary German at around A2-B1 level.',
    '- Reuse as many of the learner\'s known words as reads naturally.',
    `- Introduce at most ${newWordBudget} words the learner has not seen yet.`,
    '- Three to five short paragraphs or a single tight one; no title, no translation.',
    '- Reply with the German passage only. No English, no notes, no markdown.',
    '',
    section('THEME', theme),
    '',
    section(
      'KNOWN WORDS',
      knownTerms.length > 0 ? knownTerms.join(', ') : '(none yet — this is the learner\'s first passage)',
    ),
  ]);
}

export interface QuestionsAndVocabPromptInput {
  passage: string;
  questionCount: number;
  vocabCount: number;
}

export function buildQuestionsAndVocabPrompt(input: QuestionsAndVocabPromptInput): string {
  const { passage, questionCount, vocabCount } = input;
  return build(PROMPT_INTENT.questionsAndVocab, [
    `Read the German passage below. Produce ${questionCount} open comprehension questions`,
    `in German (never yes/no, never multiple choice) and up to ${vocabCount} key vocabulary`,
    'items from the passage that are worth saving for study.',
    '',
    NOUN_FIELDS_RULE,
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"questions":["..."],"vocab":[{"term":"Bahnhof","partOfSpeech":"noun",' +
      '"determiner":"der","pluralForm":"Bahnhöfe","definition":"train station"}]}',
    '',
    section('PASSAGE', passage),
  ]);
}

export interface AnswerEvaluationPromptInput {
  passage: string;
  questions: readonly string[];
  answers: readonly string[];
  /** Terms we want to know the learner demonstrated understanding of. */
  trackedTerms: readonly string[];
}

export function buildAnswerEvaluationPrompt(input: AnswerEvaluationPromptInput): string {
  const { passage, questions, answers, trackedTerms } = input;
  const qa = questions
    .map((question, index) => `[${index}] Q: ${question}\n    A: ${answers[index]?.trim() || '(no answer)'}`)
    .join('\n');

  return build(PROMPT_INTENT.answerEvaluation, [
    'Evaluate the learner\'s free-text answers against the passage.',
    'For each answer decide whether it is correct, give one short sentence of',
    'feedback in English, and list which of the tracked terms the answer shows',
    'the learner actually understood — only include a term if their own wording',
    'demonstrates its meaning, not merely if they copied it from the passage.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"results":[{"questionIndex":0,"correct":true,"feedback":"...",' +
      '"demonstratedTerms":["Bahnhof"]}]}',
    '',
    section('PASSAGE', passage),
    '',
    section('QUESTIONS AND ANSWERS', qa),
    '',
    section('TRACKED TERMS', trackedTerms.length > 0 ? trackedTerms.join(', ') : '(none)'),
  ]);
}

export function buildCorrectionCheckPrompt(text: string): string {
  return build(PROMPT_INTENT.correctionCheck, [
    'Decide whether the learner\'s German journal entry below needs any correction',
    '(grammar, case, word order, spelling, capitalisation of nouns, idiom).',
    'Do not rewrite it here.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"needsCorrection":true,"summary":"one short English sentence on what is off"}',
    '',
    section('ENTRY', text),
  ]);
}

export function buildCorrectionPrompt(text: string): string {
  return build(PROMPT_INTENT.correction, [
    'Rewrite the learner\'s German journal entry below so it is correct and natural.',
    'Keep their voice, their content and their sentence order. Change only what is wrong.',
    'Reply with the corrected German text only — no commentary, no markdown, no quotes.',
    '',
    section('ENTRY', text),
  ]);
}

export interface JournalVocabPromptInput {
  originalText: string;
  correctedText: string | null;
  maxItems: number;
}

export function buildJournalVocabPrompt(input: JournalVocabPromptInput): string {
  const { originalText, correctedText, maxItems } = input;
  return build(PROMPT_INTENT.journalVocab, [
    `List up to ${maxItems} content words the learner actively used in the entry below`,
    'and that are worth tracking as vocabulary. Skip function words and names.',
    'For each item set "usedCorrectly" to true if the learner\'s own form was already',
    'correct, and false if the correction had to change how they used that word.',
    'Set "note" to one short English remark, or "" when there is nothing to add.',
    '',
    NOUN_FIELDS_RULE,
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"vocab":[{"term":"Bahnhof","partOfSpeech":"noun","determiner":"der",' +
      '"pluralForm":"Bahnhöfe","definition":"train station","usedCorrectly":true,' +
      '"note":"optional short English note"}]}',
    '',
    section('ORIGINAL', originalText),
    '',
    section('CORRECTED', correctedText ?? '(no correction was needed)'),
  ]);
}

export interface SentenceEvaluationPromptInput {
  term: string;
  /** Full dictionary form shown to the learner, e.g. `der Bahnhof, Bahnhöfe`. */
  displayForm: string;
  definition: string;
  sentence: string;
}

export function buildSentenceEvaluationPrompt(input: SentenceEvaluationPromptInput): string {
  const { term, displayForm, definition, sentence } = input;
  return build(PROMPT_INTENT.sentenceEvaluation, [
    'The learner was asked to use one German word in a sentence of their own.',
    'Judge whether the sentence is grammatical AND uses the target word with its',
    'correct meaning. Grade on the SuperMemo 0-5 scale: 5 flawless, 4 correct with',
    'a small stylistic nit, 3 understandable with a real error, 2 or below wrong or',
    'the target word misused or missing.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"correct":true,"grade":4,"feedback":"one short English sentence"}',
    '',
    `TERM: ${term}`,
    `DISPLAY FORM: ${displayForm}`,
    `MEANING: ${definition}`,
    '',
    section('SENTENCE', sentence),
  ]);
}
