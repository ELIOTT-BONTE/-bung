import type { DiffSegment } from '../diff/types';
import { cn } from './cn';

const SEGMENT_STYLES: Record<DiffSegment['op'], string> = {
  equal: 'text-ink-200',
  insert: 'bg-sage-500/15 text-sage-300 rounded-[3px] px-[2px] decoration-sage-500/60 underline decoration-2',
  delete: 'bg-clay-500/12 text-clay-300/90 rounded-[3px] px-[2px] line-through decoration-clay-500/60',
};

const SEGMENT_LABELS: Record<DiffSegment['op'], string | undefined> = {
  equal: undefined,
  insert: 'added',
  delete: 'removed',
};

export interface DiffTextProps {
  segments: readonly DiffSegment[];
  className?: string;
}

export function DiffText({ segments, className }: DiffTextProps) {
  return (
    <p className={cn('font-reading text-[1.05rem] leading-[1.8] whitespace-pre-wrap', className)}>
      {segments.map((segment, index) => (
        <span
          key={index}
          className={SEGMENT_STYLES[segment.op]}
          data-diff={segment.op}
          aria-label={SEGMENT_LABELS[segment.op]}
        >
          {segment.text}
        </span>
      ))}
    </p>
  );
}

export function DiffLegend({ className }: { className?: string }) {
  return (
    <div className={cn('text-ink-500 flex items-center gap-4 text-xs', className)}>
      <span className="flex items-center gap-1.5">
        <span className="bg-sage-500/25 border-sage-500/50 size-3 rounded border" />
        added by the correction
      </span>
      <span className="flex items-center gap-1.5">
        <span className="bg-clay-500/20 border-clay-500/50 size-3 rounded border" />
        removed from your text
      </span>
    </div>
  );
}
