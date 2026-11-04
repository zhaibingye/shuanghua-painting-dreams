import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

import { cn } from '../../lib/cn'

type FieldShellProps = {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

export function FieldShell({ label, hint, error, children }: FieldShellProps) {
  return (
    <label className="ds-field grid min-w-0 gap-2 text-sm text-[var(--ds-text-primary)]">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{label}</span>
        {hint ? <span className="text-xs text-[var(--ds-text-caption)]">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="text-xs text-[var(--ds-error)]">{error}</span> : null}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'ds-control h-10 min-w-0 w-full rounded-[var(--ds-radius-input)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] px-3 text-sm text-[var(--ds-text-primary)] outline-none transition placeholder:text-[var(--ds-text-tertiary)] focus:border-[var(--ds-brand-primary)] focus:ring-2 focus:ring-[var(--ds-brand-ring)] disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'ds-control min-h-24 min-w-0 w-full resize-y rounded-[var(--ds-radius-input)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] px-3 py-3 text-sm leading-6 text-[var(--ds-text-primary)] outline-none transition placeholder:text-[var(--ds-text-tertiary)] focus:border-[var(--ds-brand-primary)] focus:ring-2 focus:ring-[var(--ds-brand-ring)]',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'ds-control h-10 min-w-0 w-full rounded-[var(--ds-radius-input)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] px-3 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-[var(--ds-brand-primary)] focus:ring-2 focus:ring-[var(--ds-brand-ring)]',
        className,
      )}
      {...props}
    />
  )
}
