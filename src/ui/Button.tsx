import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ember-500 text-ink-950 font-medium hover:bg-ember-400 active:bg-ember-600 shadow-sm shadow-ember-600/20',
  secondary:
    'border border-ink-700/80 bg-ink-850/60 text-ink-100 hover:border-ink-600 hover:bg-ink-800/70',
  ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-850/70',
  danger: 'border border-clay-500/40 text-clay-300 hover:bg-clay-500/10 hover:border-clay-500/70',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
