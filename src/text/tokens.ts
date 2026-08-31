/**
 * Tokenising German text.
 *
 * This started out inside the diff layer, because comparing "Bahnhof" with
 * "Bahnhöfe" character by character produces an unreadable smear and the fix is
 * to diff whole words. It lives here now because word lookup needs exactly the
 * same split for a completely different reason: to know what the learner tapped.
 *
 * No React, no diff, no inference — just text.
 */

/**
 * Words (including umlauts, apostrophes and hyphens) and numbers become one
 * token each; every whitespace run becomes one token; each remaining character
 * stands alone, so an inserted comma shows up as a comma and not as a rewrite
 * of the word beside it.
 */
const TOKEN_PATTERN = /\p{L}[\p{L}\p{N}'’\-]*|\p{N}+|\s+|[^\s]/gu;

const WORD_PATTERN = /\p{L}[\p{L}\p{N}'’\-]*|\p{N}+/gu;

export function tokenizeWords(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

/** True for the tokens a learner can actually look up. */
export function isWordToken(token: string): boolean {
  return /^\p{L}/u.test(token);
}

export function countWords(text: string): number {
  return (text.match(WORD_PATTERN) ?? []).length;
}

/** Ends a sentence. Kept separate from `isWordToken` so both stay obvious. */
function isSentenceEnd(token: string): boolean {
  return token === '.' || token === '!' || token === '?' || token === '…';
}

/**
 * The sentence containing a token range, rebuilt from the tokens themselves.
 *
 * Working outward in token indices rather than character offsets means the
 * caller can hand over whatever the DOM told it was clicked without having to
 * map anything back into the original string.
 *
 * Abbreviations ("z. B.") will end a sentence early here. That is acceptable:
 * this is context for a lookup, and a slightly short sentence still tells a
 * model whether "Bank" is a bench or a bank.
 */
export function sentenceAround(
  tokens: readonly string[],
  fromIndex: number,
  toIndex: number = fromIndex,
): string {
  let start = Math.max(0, Math.min(fromIndex, toIndex));
  let end = Math.min(tokens.length - 1, Math.max(fromIndex, toIndex));

  while (start > 0 && !isSentenceEnd(tokens[start - 1])) start -= 1;
  while (end < tokens.length - 1 && !isSentenceEnd(tokens[end])) end += 1;

  return tokens
    .slice(start, end + 1)
    .join('')
    .trim();
}
