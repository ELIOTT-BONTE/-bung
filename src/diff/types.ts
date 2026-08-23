/**
 * Diff shapes. Kept in their own module so `storage` can persist a diff
 * without importing the diff implementation (or `diff-match-patch`) at all.
 */

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

export interface DiffStats {
  insertedWords: number;
  deletedWords: number;
  unchangedWords: number;
  /** True when the corrected text differs from the original in any way. */
  changed: boolean;
}
