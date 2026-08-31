/**
 * Looking one word up while reading.
 *
 * The awkward part is that a passage contains surface forms while the vocab
 * store demands dictionary forms — `storage/vocabDraft.ts` will not save a noun
 * without its determiner and plural, and nothing here tries to derive either.
 * So a tapped "Regenbögen" has to become "der Regenbogen, Regenbögen" before it
 * can be stored, and only the model can do that.
 *
 * Which is why the walk below tries every free source before spending a call:
 *
 *   1. the words this passage already defined, in memory
 *   2. the store, keyed on the tapped form as typed
 *   3. the model — and then the store again, on the dictionary form it returned,
 *      because a learner who already has "Regenbogen" should not be offered it
 *      as a new word just because they tapped the plural
 *
 * No React and no counters. Resolving a word writes nothing at all, and adding
 * one is bookkeeping — neither is evidence of anything, so neither touches
 * exposure or mastery. Nothing here reaches the vocabulary store until the
 * learner asks for it by name, and the caller decides when the exposure happens.
 */

import {
  buildWordLookupPrompt,
  generateText,
  parseWordLookup,
} from '../../inference';
import {
  findVocabByTerm,
  formatVocabDisplay,
  normalizeTerm,
  toVocabDraft,
  upsertVocabDrafts,
  type PartOfSpeech,
  type RejectedVocabItem,
  type VocabDraft,
  type VocabEntry,
} from '../../storage';

export interface LookupTarget {
  /** Exactly what was tapped or selected, inflected as it appeared. */
  surface: string;
  /** The sentence it came from. This is what disambiguates it. */
  sentence: string;
}

/** Which of the three sources answered, for the panel to be honest about. */
export type LookupSource = 'passage' | 'stored' | 'model';

interface LookupBase {
  target: LookupTarget;
  source: LookupSource;
  /** What the tapped form was, when the engine worked it out. */
  surfaceRole: string | null;
}

/** Already in the vocabulary store, so it carries real mastery. */
export interface KnownLookup extends LookupBase {
  kind: 'known';
  entry: VocabEntry;
}

/** Understood and storable — the learner can add it, and nothing has yet. */
export interface NewLookup extends LookupBase {
  kind: 'new';
  draft: VocabDraft;
}

/**
 * Understood but not storable, which in practice means a noun that arrived
 * without its plural. The meaning is still worth showing: the learner asked
 * what a word meant, and "we cannot file it" is no reason not to answer.
 */
export interface UnusableLookup extends LookupBase {
  kind: 'unusable';
  term: string;
  definition: string;
  rejected: RejectedVocabItem;
}

export type LookupResolution = KnownLookup | NewLookup | UnusableLookup;

/**
 * A word the surrounding text has already had described for it — the reading
 * mode's flagged vocabulary. `entry` is set only if the learner already holds
 * the word; a flagged word they have never saved is still just a suggestion.
 */
export interface FlaggedWord {
  draft: VocabDraft;
  entry: VocabEntry | null;
}

export interface ResolveLookupOptions {
  /** Words the caller already has a description for, checked before any I/O. */
  flagged?: readonly FlaggedWord[];
}

export async function resolveLookup(
  target: LookupTarget,
  options: ResolveLookupOptions = {},
): Promise<LookupResolution> {
  const surface = target.surface.trim();
  if (surface === '') {
    throw new Error('There is nothing selected to look up.');
  }

  const normalized = normalizeTerm(surface);

  const flagged = options.flagged?.find(
    (candidate) => normalizeTerm(candidate.draft.term) === normalized,
  );
  if (flagged) {
    // Described already, so this costs nothing — but being described is not
    // being owned, and an unowned word is offered rather than claimed.
    return flagged.entry
      ? { kind: 'known', target, source: 'passage', surfaceRole: null, entry: flagged.entry }
      : { kind: 'new', target, source: 'passage', surfaceRole: null, draft: flagged.draft };
  }

  const stored = await findVocabByTerm(surface);
  if (stored) {
    return { kind: 'known', target, source: 'stored', surfaceRole: null, entry: stored };
  }

  const lookup = parseWordLookup(
    await generateText(buildWordLookupPrompt({ surface, sentence: target.sentence })),
  );

  const byDictionaryForm = await findVocabByTerm(lookup.term);
  if (byDictionaryForm) {
    return {
      kind: 'known',
      target,
      source: 'model',
      surfaceRole: lookup.surfaceRole,
      entry: byDictionaryForm,
    };
  }

  const draft = toVocabDraft(lookup);
  if ('reason' in draft) {
    return {
      kind: 'unusable',
      target,
      source: 'model',
      surfaceRole: lookup.surfaceRole,
      term: lookup.term,
      definition: lookup.definition,
      rejected: draft,
    };
  }

  return { kind: 'new', target, source: 'model', surfaceRole: lookup.surfaceRole, draft };
}

/**
 * Saves a resolved word. Validation already happened in `resolveLookup`, so
 * this cannot be reached with a noun missing its plural.
 */
export async function addLookupToVocab(draft: VocabDraft): Promise<VocabEntry> {
  const [result] = await upsertVocabDrafts([draft]);
  return result.entry;
}

export interface LookupDisplay {
  /** `der Bahnhof, -"e` for a noun, the bare term otherwise. */
  form: string;
  definition: string;
  partOfSpeech: PartOfSpeech;
}

/** One shape for the panel to render, whichever source answered. */
export function lookupDisplay(resolution: LookupResolution): LookupDisplay {
  if (resolution.kind === 'known') {
    return {
      form: formatVocabDisplay(resolution.entry),
      definition: resolution.entry.definition,
      partOfSpeech: resolution.entry.partOfSpeech,
    };
  }

  if (resolution.kind === 'unusable') {
    return { form: resolution.term, definition: resolution.definition, partOfSpeech: 'other' };
  }

  const { draft } = resolution;
  return {
    form: formatVocabDisplay(draft),
    definition: draft.definition,
    partOfSpeech: draft.partOfSpeech,
  };
}
