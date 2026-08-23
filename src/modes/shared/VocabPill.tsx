import { formatVocabDisplay, masteryLabelFor, type VocabEntry } from './vocabView';
import { cn } from '../../ui';

export interface VocabPillProps {
  entry: VocabEntry;
  /** Highlights words that earned a mastery event, as opposed to mere exposure. */
  highlighted?: boolean;
  className?: string;
}

export function VocabPill({ entry, highlighted = false, className }: VocabPillProps) {
  return (
    <span
      title={`${entry.definition || 'no definition yet'} · ${masteryLabelFor(entry)}`}
      className={cn(
        'inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1 text-sm',
        highlighted
          ? 'border-sage-500/40 bg-sage-500/10 text-sage-300'
          : 'border-ink-800 bg-ink-900/50 text-ink-300',
        className,
      )}
    >
      <span className="font-reading">{formatVocabDisplay(entry)}</span>
      {entry.definition && <span className="text-ink-600 text-xs">{entry.definition}</span>}
    </span>
  );
}
