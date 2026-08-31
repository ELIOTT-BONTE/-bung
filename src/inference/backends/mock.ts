/**
 * Mock (dev) backend.
 *
 * Returns deterministic canned German so every mode can be walked end to end
 * before real model loading exists. It reads the `### TASK:` intent and the
 * `--- SECTION ---` blocks that `prompts.ts` writes, which means it exercises
 * the same prompt/parse boundary a real model will use.
 */

import {
  MOCK_CORRECTION_REPLACEMENTS,
  MOCK_PASSAGES,
  MOCK_QUESTION_TEMPLATES,
  MOCK_WORD_BANK,
  type MockWord,
} from '../mockData';
import { PROMPT_INTENT, readPromptIntent, readSection } from '../prompts';
import type {
  BackendStatus,
  InferenceOptions,
  LoadOptions,
  LocalInferenceBackend,
} from '../types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Letter-boundary match rather than `\b`, which misbehaves around umlauts
 * ("üben" has no ASCII word boundary at its start).
 */
function termRegExp(term: string, flags = 'iu'): RegExp {
  return new RegExp(`(?<!\\p{L})${escapeRegExp(term)}(?!\\p{L})`, flags);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Generation aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Generation aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function findWords(text: string): MockWord[] {
  const found: { word: MockWord; at: number }[] = [];

  for (const word of MOCK_WORD_BANK) {
    const forms = [word.term, word.pluralForm].filter((form): form is string => Boolean(form));
    let earliest = -1;
    for (const form of forms) {
      const match = termRegExp(form, 'iud').exec(text);
      if (match && (earliest === -1 || match.index < earliest)) earliest = match.index;
    }
    if (earliest !== -1) found.push({ word, at: earliest });
  }

  return found.sort((a, b) => a.at - b.at).map((entry) => entry.word);
}

function displayForm(word: MockWord): string {
  return word.determiner ? `${word.determiner} ${word.term}` : word.term;
}

function pickPassage(theme: string): string {
  const normalized = theme.toLowerCase();
  const keywordMatch = MOCK_PASSAGES.find((passage) =>
    passage.themeKeywords.some((keyword) => normalized.includes(keyword)),
  );
  if (keywordMatch) return keywordMatch.text;
  return MOCK_PASSAGES[hashString(normalized) % MOCK_PASSAGES.length].text;
}

function buildQuestions(passage: string, count: number): string[] {
  const nouns = findWords(passage).filter((word) => word.partOfSpeech === 'noun');
  const questions: string[] = [];

  for (let i = 0; questions.length < count && i < MOCK_QUESTION_TEMPLATES.length; i += 1) {
    const noun = nouns[i % Math.max(nouns.length, 1)];
    const subject = noun ? `"${displayForm(noun)}"` : 'das Hauptthema';
    questions.push(MOCK_QUESTION_TEMPLATES[i](subject));
  }

  return questions;
}

function vocabJson(words: readonly MockWord[], extra?: (word: MockWord) => Record<string, unknown>): string {
  const vocab = words.map((word) => ({
    term: word.term,
    partOfSpeech: word.partOfSpeech,
    determiner: word.determiner,
    pluralForm: word.pluralForm,
    definition: word.definition,
    ...(extra ? extra(word) : {}),
  }));
  return JSON.stringify({ vocab }, null, 2);
}

interface ParsedAnswer {
  index: number;
  question: string;
  answer: string;
}

function parseQuestionAnswerBlock(block: string): ParsedAnswer[] {
  const answers: ParsedAnswer[] = [];
  const pattern = /\[(\d+)\] Q: ([\s\S]*?)\n\s+A: ([\s\S]*?)(?=\n\[\d+\] Q: |$)/g;
  let match = pattern.exec(block);
  while (match) {
    answers.push({
      index: Number.parseInt(match[1], 10),
      question: match[2].trim(),
      answer: match[3].trim(),
    });
    match = pattern.exec(block);
  }
  return answers;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Said out loud in every correction the mock tier produces.
 *
 * `mockCorrect` is a handful of regexes, and its output is indistinguishable
 * from a real model's — an entry needing seven fixes comes back with a full
 * stop appended and nothing else, which reads as "your German was fine". A
 * fixture must never be mistaken for a correction, so it says what it is.
 */
export const MOCK_CORRECTION_DISCLAIMER =
  'Checked by the offline mock engine, which only fixes noun capitalisation, a few set ' +
  'phrases, commas before weil/dass/obwohl and a missing full stop. It cannot judge ' +
  'grammar — configure a hosted provider or a local model for a real correction.';

/** Stand-in corrector: applies a handful of common learner fixes. */
export function mockCorrect(text: string): string {
  let corrected = text.replace(/[ \t]{2,}/g, ' ').trim();

  for (const [pattern, replacement] of MOCK_CORRECTION_REPLACEMENTS) {
    corrected = corrected.replace(pattern, replacement);
  }

  // German nouns are always capitalised; the word bank tells us which tokens
  // are nouns, so this stays safe without any part-of-speech tagging.
  for (const word of MOCK_WORD_BANK) {
    if (word.partOfSpeech !== 'noun') continue;
    for (const form of [word.term, word.pluralForm]) {
      if (!form) continue;
      const lower = form.toLowerCase();
      if (lower === form) continue;
      corrected = corrected.replace(termRegExp(lower, 'gu'), form);
    }
  }

  // Missing comma before a subordinating conjunction.
  corrected = corrected.replace(
    /(\p{L})\s+(weil|dass|obwohl|damit|wenn|während)\s/gu,
    '$1, $2 ',
  );

  if (corrected.length > 0 && !/[.!?…]$/.test(corrected)) corrected += '.';

  return corrected;
}

function generateForPrompt(prompt: string): string {
  const intent = readPromptIntent(prompt);

  switch (intent) {
    case PROMPT_INTENT.passage:
      return pickPassage(readSection(prompt, 'THEME'));

    case PROMPT_INTENT.questionsAndVocab: {
      const passage = readSection(prompt, 'PASSAGE');
      const questionCount = Number.parseInt(/(\d+) open comprehension questions/.exec(prompt)?.[1] ?? '3', 10);
      const vocabCount = Number.parseInt(/up to (\d+) key vocabulary/.exec(prompt)?.[1] ?? '6', 10);
      const words = findWords(passage).slice(0, vocabCount);
      const questions = buildQuestions(passage, questionCount);
      return JSON.stringify(
        {
          questions,
          vocab: JSON.parse(vocabJson(words)).vocab,
        },
        null,
        2,
      );
    }

    case PROMPT_INTENT.answerEvaluation: {
      const tracked = readSection(prompt, 'TRACKED TERMS')
        .split(',')
        .map((term) => term.trim())
        .filter((term) => term !== '' && term !== '(none)');
      const parsed = parseQuestionAnswerBlock(readSection(prompt, 'QUESTIONS AND ANSWERS'));

      const results = parsed.map(({ index, answer }) => {
        // A real evaluator judges meaning; the mock uses effort as a proxy so
        // that thin answers still exercise the failure path.
        const correct = wordCount(answer) >= 6 && answer !== '(no answer)';
        const demonstratedTerms = correct
          ? tracked.filter((term) => termRegExp(term).test(answer))
          : [];
        return {
          questionIndex: index,
          correct,
          feedback: correct
            ? 'Clear answer that stays close to the passage. Watch your case endings.'
            : 'Too thin to judge — give at least a full sentence referring back to the text.',
          demonstratedTerms,
        };
      });

      return JSON.stringify({ results }, null, 2);
    }

    case PROMPT_INTENT.correction: {
      const entry = readSection(prompt, 'ENTRY');
      const corrected = mockCorrect(entry);
      return JSON.stringify({
        corrected,
        summary:
          corrected === entry.trim()
            ? `${MOCK_CORRECTION_DISCLAIMER} It found nothing to change.`
            : MOCK_CORRECTION_DISCLAIMER,
      });
    }

    case PROMPT_INTENT.journalVocab: {
      const original = readSection(prompt, 'ORIGINAL');
      const corrected = readSection(prompt, 'CORRECTED');
      const maxItems = Number.parseInt(/up to (\d+) content words/.exec(prompt)?.[1] ?? '6', 10);
      const words = findWords(original).slice(0, maxItems);

      return vocabJson(words, (word) => {
        // If the learner's exact surface form survived the correction, they
        // used it correctly; otherwise the correction touched it.
        const usedCorrectly =
          corrected === '' ||
          corrected.startsWith('(no correction') ||
          termRegExp(word.term, 'u').test(original);
        return {
          usedCorrectly,
          note: usedCorrectly ? null : 'The correction adjusted how this word was written.',
        };
      });
    }

    case PROMPT_INTENT.sentenceEvaluation: {
      const term = /^TERM: (.+)$/m.exec(prompt)?.[1]?.trim() ?? '';
      const sentence = readSection(prompt, 'SENTENCE');
      // Match on a stem with no closing boundary, so an inflected form
      // ("Tische", "gehe") still counts as using the word.
      const stem = term.slice(0, Math.max(4, term.length - 2));
      const usesTerm =
        term !== '' && new RegExp(`(?<!\\p{L})${escapeRegExp(stem)}`, 'iu').test(sentence);
      const longEnough = wordCount(sentence) >= 4;
      const correct = usesTerm && longEnough;

      return JSON.stringify({
        correct,
        grade: correct ? 4 : usesTerm ? 2 : 1,
        feedback: correct
          ? `Good — "${term}" is used with the right meaning. Mind the verb position.`
          : usesTerm
            ? 'The word is there but the sentence is too short to show you can use it.'
            : `Your sentence does not use "${term}".`,
      });
    }

    default:
      return `[mock backend] No canned response is defined for this prompt.\n\n${prompt.slice(0, 200)}`;
  }
}

class MockBackend implements LocalInferenceBackend {
  readonly tier = 'mock' as const;
  readonly hosted = false;
  readonly label = 'Mock (dev)';
  readonly description =
    'Canned offline German responses. No download, no model — for trying out every mode end to end.';
  readonly model = {
    id: 'canned-fixtures',
    approximateDownloadMb: null,
    approximateVramMb: null,
  };
  readonly fallbackModel = null;

  private status: BackendStatus = 'unloaded';

  getStatus(): BackendStatus {
    return this.status;
  }

  getLoadedModelId(): string | null {
    return this.status === 'ready' ? this.model.id : null;
  }

  /** Nothing to download, so the fixtures are always "cached". */
  async isCached(): Promise<boolean> {
    return true;
  }

  async load(options?: LoadOptions): Promise<void> {
    this.status = 'loading';
    options?.onProgress?.({ fraction: 0.5, label: 'Preparing canned responses' });
    await delay(120);
    options?.onProgress?.({ fraction: 1, label: 'Ready' });
    this.status = 'ready';
  }

  async generate(prompt: string, options?: InferenceOptions): Promise<string> {
    if (this.status !== 'ready') await this.load();
    // A little latency so loading states are visible while developing.
    await delay(160 + (hashString(prompt) % 240), options?.signal);
    return generateForPrompt(prompt);
  }

  async unload(): Promise<void> {
    this.status = 'unloaded';
  }
}

export const mockBackend: LocalInferenceBackend = new MockBackend();
