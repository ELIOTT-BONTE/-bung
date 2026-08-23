import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'border-ink-700/70 bg-ink-850/70 text-ink-300',
  accent: 'border-ember-500/40 bg-ember-500/12 text-ember-200',
  success: 'border-sage-500/40 bg-sage-500/12 text-sage-300',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  danger: 'border-clay-500/40 bg-clay-500/12 text-clay-300',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ALERT_TONES: Record<Tone, string> = {
  neutral: 'border-ink-800 bg-ink-900/60 text-ink-300',
  accent: 'border-ember-500/30 bg-ember-500/8 text-ember-100',
  success: 'border-sage-500/30 bg-sage-500/8 text-sage-300',
  warn: 'border-amber-500/30 bg-amber-500/8 text-amber-100',
  danger: 'border-clay-500/30 bg-clay-500/8 text-clay-200',
};

export interface AlertProps {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
}

export function Alert({ children, tone = 'neutral', title, className }: AlertProps) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm leading-relaxed', ALERT_TONES[tone], className)}>
      {title && <p className="mb-1 font-medium">{title}</p>}
      {children}
    </div>
  );
}

export interface ProgressBarProps {
  /** 0..1, or null for an indeterminate bar. */
  fraction: number | null;
  label?: string;
  className?: string;
}

export function ProgressBar({ fraction, label, className }: ProgressBarProps) {
  const percent = fraction === null ? null : Math.round(Math.max(0, Math.min(1, fraction)) * 100);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || percent !== null) && (
        <div className="text-ink-400 flex items-center justify-between text-xs">
          {label && <span>{label}</span>}
          {percent !== null && <span className="tabular-nums">{percent}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="bg-ink-850 h-1.5 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'bg-ember-500 h-full rounded-full transition-[width] duration-300',
            percent === null && 'w-1/3 animate-pulse',
          )}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Working"
      className={cn(
        'border-ink-700 border-t-ember-400 inline-block size-4 animate-spin rounded-full border-2',
        className,
      )}
    />
  );
}

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-ink-800/70 flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-ink-200 font-medium">{title}</p>
      {description && <p className="text-ink-500 max-w-md text-sm leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}

export function StatTile({ label, value, hint, tone = 'neutral' }: StatTileProps) {
  return (
    <div className="border-ink-800/70 bg-ink-900/40 rounded-xl border px-4 py-3">
      <p className="text-ink-500 text-xs tracking-wide uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'accent' ? 'text-ember-300' : 'text-ink-100',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-ink-500 mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
