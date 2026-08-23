import { cn } from '../ui';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'border-ink-700/60 from-ink-800 to-ink-900 text-ember-300 font-reading',
        'inline-flex size-10 items-center justify-center rounded-xl border bg-gradient-to-br text-xl',
        className,
      )}
    >
      Ü
    </span>
  );
}
