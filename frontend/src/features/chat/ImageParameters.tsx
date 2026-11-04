import { imageOptionFields } from '../../api/image-options'
import { FieldShell, Input, Select } from '../../components/ui/Field'
import type { ImageApiFormat } from '../../storage/settings'

export function ImageParameters({ format, options, onOption }: {
  format: ImageApiFormat
  options: Record<string, unknown>
  onOption: (key: string, value: unknown) => void
}) {
  return <div className="grid gap-4">
    {Object.entries(imageOptionFields(format)).map(([key, field]) => {
      if (key === 'outputCompression' && options.outputFormat === 'png') return null
      if (key === 'maxImages' && options.sequentialImageGeneration !== 'auto') return null
      const value = options[key] ?? field.default
      const inputValue = typeof value === 'string' || typeof value === 'number' ? value : ''
      if (field.type === 'boolean') return <label key={key} className="grid gap-2 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-3 text-sm">
        <span className="flex items-center justify-between gap-3"><span>{field.title}</span><input aria-label={field.title} className="size-4 accent-[var(--ds-brand-primary)]" type="checkbox" checked={value === true} onChange={(event) => onOption(key, event.target.checked)} /></span>
        {field.description ? <span className="text-xs text-[var(--ds-text-secondary)]">{field.description}</span> : null}
      </label>
      return <FieldShell key={key} label={field.title}>
        {field.enum ? <Select aria-label={field.title} value={inputValue} onChange={(event) => onOption(key, event.target.value)}>
          {field.enum.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select> : <Input aria-label={field.title} type={field.type === 'integer' ? 'number' : 'text'} value={inputValue} min={field.minimum} max={field.maximum} step={field.type === 'integer' ? 1 : undefined}
          onChange={(event) => onOption(key, field.type === 'integer' ? Number(event.target.value) : event.target.value)} />}
        {field.description ? <span className="text-xs text-[var(--ds-text-secondary)]">{field.description}</span> : null}
      </FieldShell>
    })}
  </div>
}
