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
    <label className="grid gap-2 text-sm text-[var(--ds-text-primary)]">
      <span className="flex items-center justify-between gap-3">
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
        'h-10 w-full rounded-[var(--ds-radius-input)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] px-3 text-sm text-[var(--ds-text-primary)] outline-none transition placeholder:text-[var(--ds-text-tertiary)] focus:border-[var(--ds-brand-primary)] focus:ring-2 focus:ring-[var(--ds-brand-ring)] disabled:cursor-not-allowed disabled:opacity-55',
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
        'min-h-24 w-full resize-y rounded-[var(--ds-radius-input)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] px-3 py-3 text-sm leading-6 text-[var(--ds-text-primary)] outline-none transition placeholder:text-[var(--ds-text-tertiary)] focus:border-[var(--ds-brand-primary)] focus:ring-2 focus:ring-[var(--ds-brand-ring)]',
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
        'h-10 w-full rounded-[var(--ds-radius-input)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] px-3 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-[var(--ds-brand-primary)] focus:ring-2 focus:ring-[var(--ds-brand-ring)]',
        className,
      )}
      {...props}
    />
  )
}
