/**
 * Display helpers for vocabulary. No UI imports — the same string is used by
 * flashcards, prompts and the word list, so it lives next to the data.
 */

import type { Determiner, PartOfSpeech } from './types';

/**
 * Loose about absence on purpose: a stored entry spells it `null` and a draft
 * leaves it off entirely, and both want the same string out of here.
 */
export interface DisplayableVocab {
  term: string;
  partOfSpeech: PartOfSpeech;
  determiner?: Determiner | null;
  pluralForm?: string | null;
}

/**
 * A German noun is never shown bare: the learner has to memorise the article
 * and the plural, so both are always part of the word's identity.
 *
 * `der Tisch, -e` when the plural just adds a suffix, `der Bahnhof, Bahnhöfe`
 * when the stem changes, and the plain term for anything that is not a noun.
 */
export function formatVocabDisplay(vocab: DisplayableVocab): string {
  if (vocab.partOfSpeech !== 'noun' || !vocab.determiner) return vocab.term;

  const head = `${vocab.determiner} ${vocab.term}`;
  if (!vocab.pluralForm) return head;
  if (vocab.pluralForm === vocab.term) return `${head}, -`;
  if (vocab.pluralForm.startsWith(vocab.term)) {
    return `${head}, -${vocab.pluralForm.slice(vocab.term.length)}`;
  }
  return `${head}, ${vocab.pluralForm}`;
}

/** Long form used where there is room for it, e.g. the answer side of a card. */
export function formatVocabFull(vocab: DisplayableVocab): string {
  if (vocab.partOfSpeech !== 'noun' || !vocab.determiner) return vocab.term;
  const plural = vocab.pluralForm ? `, plural: die ${vocab.pluralForm}` : '';
  return `${vocab.determiner} ${vocab.term}${plural}`;
}

export const PART_OF_SPEECH_LABELS: Record<PartOfSpeech, string> = {
  noun: 'noun',
  verb: 'verb',
  adjective: 'adjective',
  adverb: 'adverb',
  phrase: 'phrase',
  other: 'other',
};
