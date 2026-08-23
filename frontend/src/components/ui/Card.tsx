import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--ds-radius-modal)] border border-[var(--ds-border-light)] bg-[var(--ds-bg-layer-1)] shadow-[var(--ds-shadow-card)]',
        className,
      )}
      {...props}
    />
  )
}
