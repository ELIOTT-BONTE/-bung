import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Card({ className, ...props }: CardProps) {
  return <div className={cn('surface p-6', className)} {...props} />;
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-ember-400/90 mb-1.5 text-xs font-medium tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        )}
        <h2 className="text-ink-100 text-balance-title text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>
        {description && <p className="text-ink-400 mt-2 text-sm leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
