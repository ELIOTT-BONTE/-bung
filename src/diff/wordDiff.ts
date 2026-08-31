/**
 * Word- and phrase-level diffing.
 *
 * `diff-match-patch` compares characters, which produces unreadable output for
 * a language learner ("Bahnhof" vs "Bahnhöfe" becomes a one-letter smear). The
 * standard fix, and the one used here, is to tokenise the two texts, map every
 * distinct token to a single private-use character, diff those strings, then
 * expand the result back into tokens.
 *
 * The diff is always computed here, client-side, from the plain original and
 * corrected text. No model is ever asked to describe its own edits.
 */

import DiffMatchPatch from 'diff-match-patch';
import { countWords, tokenizeWords } from '../text';
import type { DiffSegment, DiffStats } from './types';

/** Unicode private use area: 6400 slots, plenty for a journal entry. */
const PRIVATE_USE_START = 0xe000;
const MAX_DISTINCT_TOKENS = 0xf8ff - PRIVATE_USE_START + 1;

/** Kept as a named re-export: word lookup needs the same split. */
export { tokenizeWords as tokenize };

interface Encoded {
  a: string;
  b: string;
  tokens: string[];
}

function encode(original: string, corrected: string): Encoded | null {
  const tokens: string[] = [];
  const indexByToken = new Map<string, number>();

  const encodeOne = (text: string): string | null => {
    let out = '';
    for (const token of tokenizeWords(text)) {
      let index = indexByToken.get(token);
      if (index === undefined) {
        if (tokens.length >= MAX_DISTINCT_TOKENS) return null;
        index = tokens.length;
        tokens.push(token);
        indexByToken.set(token, index);
      }
      out += String.fromCharCode(PRIVATE_USE_START + index);
    }
    return out;
  };

  const a = encodeOne(original);
  if (a === null) return null;
  const b = encodeOne(corrected);
  if (b === null) return null;

  return { a, b, tokens };
}

function decode(encodedText: string, tokens: readonly string[]): string {
  let out = '';
  for (const char of encodedText) {
    out += tokens[char.charCodeAt(0) - PRIVATE_USE_START] ?? '';
  }
  return out;
}

function opFor(dmpOp: number): DiffSegment['op'] {
  if (dmpOp === DiffMatchPatch.DIFF_INSERT) return 'insert';
  if (dmpOp === DiffMatchPatch.DIFF_DELETE) return 'delete';
  return 'equal';
}

/** Collapses runs of the same op so the renderer gets phrases, not tokens. */
function mergeSegments(segments: readonly DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const segment of segments) {
    if (segment.text === '') continue;
    const last = merged[merged.length - 1];
    if (last && last.op === segment.op) last.text += segment.text;
    else merged.push({ ...segment });
  }
  return merged;
}

export function computeWordDiff(original: string, corrected: string): DiffSegment[] {
  if (original === corrected) {
    return original === '' ? [] : [{ op: 'equal', text: original }];
  }

  const dmp = new DiffMatchPatch();
  const encoded = encode(original, corrected);

  if (!encoded) {
    // Pathologically varied input: fall back to a character diff rather than
    // failing. Still readable, just noisier.
    const charDiffs = dmp.diff_main(original, corrected);
    dmp.diff_cleanupSemantic(charDiffs);
    return mergeSegments(charDiffs.map(([op, text]) => ({ op: opFor(op), text })));
  }

  const diffs = dmp.diff_main(encoded.a, encoded.b, false);
  // Token boundaries are character boundaries in the encoded strings, so the
  // standard cleanup pass stays token-aligned here.
  dmp.diff_cleanupSemantic(diffs);

  return mergeSegments(
    diffs.map(([op, text]) => ({ op: opFor(op), text: decode(text, encoded.tokens) })),
  );
}

export function diffStats(segments: readonly DiffSegment[]): DiffStats {
  let insertedWords = 0;
  let deletedWords = 0;
  let unchangedWords = 0;
  let changed = false;

  for (const segment of segments) {
    const words = countWords(segment.text);
    if (segment.op === 'insert') {
      insertedWords += words;
      changed = true;
    } else if (segment.op === 'delete') {
      deletedWords += words;
      changed = true;
    } else {
      unchangedWords += words;
    }
  }

  return { insertedWords, deletedWords, unchangedWords, changed };
}

export function hasChanges(segments: readonly DiffSegment[]): boolean {
  return segments.some((segment) => segment.op !== 'equal');
}

/** Rebuilds the original text from a stored diff. Useful as a sanity check. */
export function originalFromDiff(segments: readonly DiffSegment[]): string {
  return segments
    .filter((segment) => segment.op !== 'insert')
    .map((segment) => segment.text)
    .join('');
}

/** Rebuilds the corrected text from a stored diff. */
export function correctedFromDiff(segments: readonly DiffSegment[]): string {
  return segments
    .filter((segment) => segment.op !== 'delete')
    .map((segment) => segment.text)
    .join('');
}
