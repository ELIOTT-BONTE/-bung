/**
 * Validation gate between loose model output and the vocab store.
 *
 * The hard rule it enforces: a noun is only saved if the determiner and the
 * plural form arrived with it. Nothing downstream tries to guess a gender from
 * a bare word, so a noun missing either field is reported back to the caller
 * instead of being silently stored half-complete.
 */

import { DETERMINERS, type Determiner, type PartOfSpeech, type VocabDraft } from './types';

/** Anything with vaguely the right field names; values are untrusted. */
export interface LooseVocabItem {
  term?: unknown;
  partOfSpeech?: unknown;
  determiner?: unknown;
  pluralForm?: unknown;
  definition?: unknown;
  notes?: unknown;
}

export interface RejectedVocabItem {
  term: string;
  reason: string;
}

export interface DraftValidation {
  drafts: VocabDraft[];
  rejected: RejectedVocabItem[];
}

const PART_OF_SPEECH_ALIASES: Record<string, PartOfSpeech> = {
  noun: 'noun',
  nouns: 'noun',
  nomen: 'noun',
  substantiv: 'noun',
  verb: 'verb',
  verbs: 'verb',
  adjective: 'adjective',
  adjektiv: 'adjective',
  adj: 'adjective',
  adverb: 'adverb',
  adverbium: 'adverb',
  phrase: 'phrase',
  expression: 'phrase',
  idiom: 'phrase',
};

const LEADING_ARTICLE = /^(der|die|das)\s+/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readPartOfSpeech(value: unknown): PartOfSpeech {
  return PART_OF_SPEECH_ALIASES[text(value).toLowerCase()] ?? 'other';
}

function readDeterminer(value: unknown): Determiner | null {
  const candidate = text(value).toLowerCase();
  return (DETERMINERS as readonly string[]).includes(candidate) ? (candidate as Determiner) : null;
}

/** Plurals sometimes arrive with their article ("die Bahnhöfe"); drop it. */
function readPluralForm(value: unknown): string {
  return text(value).replace(LEADING_ARTICLE, '').trim();
}

export function toVocabDraft(item: LooseVocabItem): VocabDraft | RejectedVocabItem {
  const rawTerm = text(item.term);
  if (rawTerm === '') {
    return { term: '(empty)', reason: 'No term was returned' };
  }

  const articleMatch = LEADING_ARTICLE.exec(rawTerm);
  const term = rawTerm.replace(LEADING_ARTICLE, '').trim();
  const definition = text(item.definition);
  const notes = text(item.notes) || null;

  // An article glued to the term is itself evidence that this is a noun.
  const partOfSpeech = articleMatch ? 'noun' : readPartOfSpeech(item.partOfSpeech);

  if (partOfSpeech !== 'noun') {
    return { partOfSpeech, term, definition, determiner: null, pluralForm: null, notes };
  }

  const determiner = readDeterminer(item.determiner) ?? readDeterminer(articleMatch?.[1]);
  const pluralForm = readPluralForm(item.pluralForm);

  if (!determiner) {
    return { term, reason: 'Noun arrived without a determiner (der/die/das)' };
  }
  if (pluralForm === '') {
    return { term, reason: 'Noun arrived without a plural form' };
  }

  return { partOfSpeech: 'noun', term, definition, determiner, pluralForm, notes };
}

function isRejection(value: VocabDraft | RejectedVocabItem): value is RejectedVocabItem {
  return 'reason' in value;
}

export function toVocabDrafts(items: readonly LooseVocabItem[]): DraftValidation {
  const drafts: VocabDraft[] = [];
  const rejected: RejectedVocabItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const result = toVocabDraft(item);
    if (isRejection(result)) {
      rejected.push(result);
      continue;
    }
    const key = result.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(result);
  }

  return { drafts, rejected };
}
