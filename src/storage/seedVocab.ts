/**
 * Optional starter vocabulary.
 *
 * The store ships empty; this list is only inserted when the learner presses
 * "Load starter vocabulary" in Settings. It exists so vocabulary training has
 * something due on a fresh install without pretending the learner has already
 * studied anything: every word arrives at mastery 0 with an empty review log.
 */

import { upsertVocabDrafts } from './vocabRepo';
import type { VocabDraft } from './types';

export const STARTER_VOCAB: readonly VocabDraft[] = [
  { partOfSpeech: 'noun', term: 'Haus', definition: 'house', determiner: 'das', pluralForm: 'Häuser' },
  { partOfSpeech: 'noun', term: 'Tag', definition: 'day', determiner: 'der', pluralForm: 'Tage' },
  { partOfSpeech: 'noun', term: 'Jahr', definition: 'year', determiner: 'das', pluralForm: 'Jahre' },
  { partOfSpeech: 'noun', term: 'Mensch', definition: 'person, human', determiner: 'der', pluralForm: 'Menschen' },
  { partOfSpeech: 'noun', term: 'Kind', definition: 'child', determiner: 'das', pluralForm: 'Kinder' },
  { partOfSpeech: 'noun', term: 'Frau', definition: 'woman, wife', determiner: 'die', pluralForm: 'Frauen' },
  { partOfSpeech: 'noun', term: 'Mann', definition: 'man, husband', determiner: 'der', pluralForm: 'Männer' },
  { partOfSpeech: 'noun', term: 'Hand', definition: 'hand', determiner: 'die', pluralForm: 'Hände' },
  { partOfSpeech: 'noun', term: 'Auge', definition: 'eye', determiner: 'das', pluralForm: 'Augen' },
  { partOfSpeech: 'noun', term: 'Straße', definition: 'street, road', determiner: 'die', pluralForm: 'Straßen' },
  { partOfSpeech: 'noun', term: 'Schule', definition: 'school', determiner: 'die', pluralForm: 'Schulen' },
  { partOfSpeech: 'noun', term: 'Wasser', definition: 'water', determiner: 'das', pluralForm: 'Wasser' },
  { partOfSpeech: 'noun', term: 'Geld', definition: 'money', determiner: 'das', pluralForm: 'Gelder' },
  { partOfSpeech: 'noun', term: 'Tisch', definition: 'table', determiner: 'der', pluralForm: 'Tische' },
  { partOfSpeech: 'noun', term: 'Stuhl', definition: 'chair', determiner: 'der', pluralForm: 'Stühle' },
  { partOfSpeech: 'noun', term: 'Tür', definition: 'door', determiner: 'die', pluralForm: 'Türen' },
  { partOfSpeech: 'noun', term: 'Zimmer', definition: 'room', determiner: 'das', pluralForm: 'Zimmer' },
  { partOfSpeech: 'noun', term: 'Auto', definition: 'car', determiner: 'das', pluralForm: 'Autos' },
  { partOfSpeech: 'noun', term: 'Woche', definition: 'week', determiner: 'die', pluralForm: 'Wochen' },
  { partOfSpeech: 'noun', term: 'Buch', definition: 'book', determiner: 'das', pluralForm: 'Bücher' },
  { partOfSpeech: 'verb', term: 'sein', definition: 'to be' },
  { partOfSpeech: 'verb', term: 'haben', definition: 'to have' },
  { partOfSpeech: 'verb', term: 'machen', definition: 'to do, to make' },
  { partOfSpeech: 'verb', term: 'gehen', definition: 'to go, to walk' },
  { partOfSpeech: 'verb', term: 'sehen', definition: 'to see' },
  { partOfSpeech: 'verb', term: 'sprechen', definition: 'to speak' },
  { partOfSpeech: 'verb', term: 'lernen', definition: 'to learn, to study' },
  { partOfSpeech: 'verb', term: 'arbeiten', definition: 'to work' },
  { partOfSpeech: 'adjective', term: 'gut', definition: 'good' },
  { partOfSpeech: 'adjective', term: 'neu', definition: 'new' },
  { partOfSpeech: 'adjective', term: 'schnell', definition: 'fast, quick' },
  { partOfSpeech: 'adjective', term: 'wichtig', definition: 'important' },
];

export interface SeedResult {
  inserted: number;
  alreadyPresent: number;
}

export async function loadStarterVocab(now: number = Date.now()): Promise<SeedResult> {
  const results = await upsertVocabDrafts(STARTER_VOCAB, { now });
  const inserted = results.filter((result) => result.created).length;
  return { inserted, alreadyPresent: results.length - inserted };
}
