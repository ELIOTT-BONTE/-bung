import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from './cn';

const CONTROL_BASE =
  'w-full rounded-lg border border-ink-800 bg-ink-950/70 px-3.5 py-2.5 text-ink-100 ' +
  'placeholder:text-ink-600 transition-colors duration-150 ' +
  'hover:border-ink-700 focus:border-ember-500/70 focus:outline-none disabled:opacity-50';

interface FieldWrapperProps {
  label?: string;
  hint?: ReactNode;
  invalid?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

function FieldWrapper({
  label,
  hint,
  invalid = false,
  htmlFor,
  children,
  className,
}: FieldWrapperProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-ink-300 text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p className={cn('text-xs leading-relaxed', invalid ? 'text-clay-300' : 'text-ink-500')}>
          {hint}
        </p>
      )}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  /** Reads the hint as a rejection rather than guidance, and says so to AT. */
  invalid?: boolean;
  wrapperClassName?: string;
}

export function TextInput({
  label,
  hint,
  invalid = false,
  wrapperClassName,
  className,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <FieldWrapper
      label={label}
      hint={hint}
      invalid={invalid}
      htmlFor={id}
      className={wrapperClassName}
    >
      <input
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL_BASE, invalid && 'border-clay-500/60', className)}
        {...props}
      />
    </FieldWrapper>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  wrapperClassName?: string;
  /** Renders in the reading serif, for German the learner writes or reads. */
  reading?: boolean;
}

export function TextArea({
  label,
  hint,
  wrapperClassName,
  className,
  reading = false,
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <FieldWrapper label={label} hint={hint} htmlFor={id} className={wrapperClassName}>
      <textarea
        id={id}
        className={cn(
          CONTROL_BASE,
          'resize-y leading-relaxed',
          reading && 'font-reading text-[1.05rem]',
          className,
        )}
        {...props}
      />
    </FieldWrapper>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onSelect: () => void;
}

export function Chip({ label, selected = false, onSelect }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors duration-150',
        selected
          ? 'border-ember-500/60 bg-ember-500/12 text-ember-200'
          : 'border-ink-800 text-ink-400 hover:border-ink-700 hover:text-ink-200',
      )}
    >
      {label}
    </button>
  );
}
