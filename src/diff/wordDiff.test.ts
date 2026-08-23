import { describe, expect, it } from 'vitest';
import {
  computeWordDiff,
  correctedFromDiff,
  diffStats,
  hasChanges,
  originalFromDiff,
  tokenize,
} from './wordDiff';

describe('tokenize', () => {
  it('keeps umlauted words whole', () => {
    expect(tokenize('Bahnhöfe')).toEqual(['Bahnhöfe']);
  });

  it('splits punctuation from words so a stray comma diffs on its own', () => {
    expect(tokenize('Ich bin müde, weil')).toEqual(['Ich', ' ', 'bin', ' ', 'müde', ',', ' ', 'weil']);
  });
});

describe('computeWordDiff', () => {
  it('returns a single equal segment when nothing changed', () => {
    const segments = computeWordDiff('Ich gehe zum Markt.', 'Ich gehe zum Markt.');
    expect(segments).toEqual([{ op: 'equal', text: 'Ich gehe zum Markt.' }]);
    expect(hasChanges(segments)).toBe(false);
  });

  it('returns nothing for two empty texts', () => {
    expect(computeWordDiff('', '')).toEqual([]);
  });

  it('diffs whole words rather than characters', () => {
    const segments = computeWordDiff('Ich gehe zum Bahnhof.', 'Ich fahre zum Bahnhof.');
    const deleted = segments.filter((segment) => segment.op === 'delete').map((s) => s.text);
    const inserted = segments.filter((segment) => segment.op === 'insert').map((s) => s.text);

    expect(deleted).toEqual(['gehe']);
    expect(inserted).toEqual(['fahre']);
  });

  it('shows a capitalisation fix as one replaced word', () => {
    const segments = computeWordDiff('der bahnhof ist groß', 'der Bahnhof ist groß');
    expect(segments.filter((s) => s.op === 'delete').map((s) => s.text)).toEqual(['bahnhof']);
    expect(segments.filter((s) => s.op === 'insert').map((s) => s.text)).toEqual(['Bahnhof']);
  });

  it('isolates an inserted comma', () => {
    const segments = computeWordDiff('Ich bin müde weil ich arbeite.', 'Ich bin müde, weil ich arbeite.');
    expect(segments.filter((s) => s.op === 'insert').map((s) => s.text)).toEqual([',']);
    expect(segments.filter((s) => s.op === 'delete')).toHaveLength(0);
  });

  it('handles a multi-word phrase replacement', () => {
    const segments = computeWordDiff(
      'Ich habe nach Berlin gegangen.',
      'Ich bin nach Berlin gefahren.',
    );
    expect(hasChanges(segments)).toBe(true);
    expect(correctedFromDiff(segments)).toBe('Ich bin nach Berlin gefahren.');
  });

  it('handles pure insertion and pure deletion', () => {
    expect(computeWordDiff('', 'Guten Morgen.')).toEqual([{ op: 'insert', text: 'Guten Morgen.' }]);
    expect(computeWordDiff('Guten Morgen.', '')).toEqual([{ op: 'delete', text: 'Guten Morgen.' }]);
  });

  it('merges adjacent segments of the same op', () => {
    const segments = computeWordDiff('a b c d', 'a x y d');
    const ops = segments.map((segment) => segment.op);

    expect(segments.every((segment) => segment.text !== '')).toBe(true);
    for (let i = 1; i < ops.length; i += 1) {
      expect(ops[i]).not.toBe(ops[i - 1]);
    }
  });

  it('round-trips both sides of the comparison', () => {
    const original = 'Am freitag fahre ich mit dem zug nach Hamburg';
    const corrected = 'Am Freitag fahre ich mit dem Zug nach Hamburg.';
    const segments = computeWordDiff(original, corrected);

    expect(originalFromDiff(segments)).toBe(original);
    expect(correctedFromDiff(segments)).toBe(corrected);
  });

  it('preserves paragraph breaks', () => {
    const original = 'Erster Satz.\n\nZweiter satz.';
    const corrected = 'Erster Satz.\n\nZweiter Satz.';
    expect(correctedFromDiff(computeWordDiff(original, corrected))).toBe(corrected);
  });
});

describe('diffStats', () => {
  it('counts words on each side and flags whether anything changed', () => {
    const stats = diffStats(computeWordDiff('Ich gehe zum Bahnhof.', 'Ich fahre zum Bahnhof.'));
    expect(stats.insertedWords).toBe(1);
    expect(stats.deletedWords).toBe(1);
    expect(stats.unchangedWords).toBe(3);
    expect(stats.changed).toBe(true);
  });

  it('reports no change for identical text', () => {
    const stats = diffStats(computeWordDiff('Alles gut.', 'Alles gut.'));
    expect(stats.changed).toBe(false);
    expect(stats.unchangedWords).toBe(2);
  });
});
