import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        tone === 'neutral' &&
          'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)]',
        tone === 'info' &&
          'border-[var(--ds-brand-border)] bg-[var(--ds-brand-subtle)] text-[var(--ds-brand-text)]',
        tone === 'success' &&
          'border-[var(--ds-success-border)] bg-[var(--ds-success-subtle)] text-[var(--ds-success)]',
        tone === 'warning' &&
          'border-[var(--ds-warning-border)] bg-[var(--ds-warning-subtle)] text-[var(--ds-warning)]',
        tone === 'danger' &&
          'border-[var(--ds-error-border)] bg-[var(--ds-error-subtle)] text-[var(--ds-error)]',
      )}
    >
      {children}
    </span>
  )
}
