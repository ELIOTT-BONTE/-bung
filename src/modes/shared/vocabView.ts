import { masteryLabel } from '../../srs';
import { formatVocabDisplay, type VocabEntry } from '../../storage';

export { formatVocabDisplay };
export type { VocabEntry };

export function masteryLabelFor(entry: VocabEntry): string {
  return `mastery ${entry.masteryLevel}/5 · ${masteryLabel(entry.masteryLevel)}`;
}

export function exposureLabelFor(entry: VocabEntry): string {
  const times = entry.exposureCount === 1 ? 'once' : `${entry.exposureCount} times`;
  return `seen ${times}`;
}
