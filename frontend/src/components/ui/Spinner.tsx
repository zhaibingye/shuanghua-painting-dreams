import { LoaderCircle } from 'lucide-react'

export function Spinner({ label = '处理中' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--ds-text-secondary)]">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  )
}
