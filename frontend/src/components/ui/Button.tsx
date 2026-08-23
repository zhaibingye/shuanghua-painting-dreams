import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  icon?: ReactNode
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  icon,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--ds-radius-input)] font-medium transition-[background,color,border-color,opacity,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-bg-base)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        variant === 'primary' &&
          'border border-transparent bg-[var(--ds-brand-primary)] text-white hover:bg-[var(--ds-brand-hover)]',
        variant === 'secondary' &&
          'border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]',
        variant === 'ghost' &&
          'border border-transparent bg-transparent text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]',
        variant === 'danger' &&
          'border border-transparent bg-[var(--ds-error-subtle)] text-[var(--ds-error)] hover:bg-[var(--ds-error-hover)]',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-sm',
        size === 'icon' && 'size-9 rounded-full p-0',
        className,
      )}
      type={props.type ?? 'button'}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
