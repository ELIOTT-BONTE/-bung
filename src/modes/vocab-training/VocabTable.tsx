import { daysUntilDue, masteryLabel } from '../../srs';
import { formatVocabDisplay, type VocabEntry } from '../../storage';
import { Badge, cn } from '../../ui';

function dueLabel(entry: VocabEntry, now: number): string {
  const days = daysUntilDue(entry.srs, now);
  if (days <= 0) return 'due now';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function VocabTable({ entries }: { entries: readonly VocabEntry[] }) {
  const now = Date.now();
  const sorted = [...entries].sort((a, b) => a.srs.dueAt - b.srs.dueAt);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-ink-500 border-ink-800/70 border-b text-left text-xs uppercase">
            <th className="py-2 pr-3 font-medium">Word</th>
            <th className="py-2 pr-3 font-medium">Meaning</th>
            <th className="py-2 pr-3 text-right font-medium">Seen</th>
            <th className="py-2 pr-3 text-right font-medium">Reviews</th>
            <th className="py-2 pr-3 font-medium">Mastery</th>
            <th className="py-2 font-medium">Next</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <tr key={entry.id} className="border-ink-800/50 border-b last:border-b-0">
              <td className="text-ink-100 font-reading py-2.5 pr-3 whitespace-nowrap">
                {formatVocabDisplay(entry)}
              </td>
              <td className="text-ink-400 py-2.5 pr-3">{entry.definition || '—'}</td>
              <td className="text-ink-500 py-2.5 pr-3 text-right tabular-nums">
                {entry.exposureCount}
              </td>
              <td className="text-ink-500 py-2.5 pr-3 text-right tabular-nums">
                {entry.masteryEventCount}
              </td>
              <td className="py-2.5 pr-3">
                <Badge
                  tone={entry.masteryLevel >= 4 ? 'success' : entry.masteryLevel >= 1 ? 'accent' : 'neutral'}
                >
                  {entry.masteryLevel}/5 {masteryLabel(entry.masteryLevel)}
                </Badge>
              </td>
              <td
                className={cn(
                  'py-2.5 whitespace-nowrap',
                  entry.srs.dueAt <= now ? 'text-ember-300' : 'text-ink-500',
                )}
              >
                {dueLabel(entry, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
