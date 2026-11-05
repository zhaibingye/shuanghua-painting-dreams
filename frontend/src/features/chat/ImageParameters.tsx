import { imageOptionFields } from '../../api/image-options'
import { FieldShell, Input, Select } from '../../components/ui/Field'
import type { ImageApiFormat } from '../../storage/settings'
import { OpenAIImageSizeField } from './OpenAIImageSizeField'
import { OPENAI_IMAGE_MODELS, openAIImageCapabilities } from './openai-image-options'

export function ImageParameters({ format, modelId, options, onOption }: {
  format: ImageApiFormat
  modelId: string
  options: Record<string, unknown>
  onOption: (key: string, value: unknown) => void
}) {
  const fields = imageOptionFields(format)
  const openAI = format === 'openaiImage' || format === 'openaiResponsesImage'
  const selectedImageModel = options.imageModel ?? fields.imageModel?.default
  const imageModel = format === 'openaiResponsesImage' && typeof selectedImageModel === 'string'
    ? selectedImageModel : modelId
  const capabilities = openAIImageCapabilities(imageModel)
  const outputFormat = typeof options.outputFormat === 'string' ? options.outputFormat : String(fields.outputFormat?.default ?? 'png')
  const nonStreaming = ['svg', 'gif'].includes(outputFormat)
  return <div className="grid gap-4">
    {Object.entries(fields).map(([key, field]) => {
      if (key === 'outputCompression' && !['jpeg', 'webp'].includes(outputFormat)) return null
      if (key === 'complexity' && !capabilities.complexity) return null
      if (key === 'svgModel' && outputFormat !== 'svg') return null
      if (key === 'svgReasoningEffort' && (outputFormat !== 'svg' || !options.svgModel)) return null
      if (['frameCount', 'frameDurationMs'].includes(key) && outputFormat !== 'gif') return null
      if (key === 'partialImages' && nonStreaming) return null
      if (key === 'maxImages' && options.sequentialImageGeneration !== 'auto') return null
      const value = options[key] ?? field.default
      const inputValue = typeof value === 'string' || typeof value === 'number' ? value : ''
      if (openAI && key === 'size' && outputFormat !== 'gif') return <OpenAIImageSizeField key={key} size={String(inputValue)} modelId={imageModel} onChange={(size) => onOption(key, size)} />
      const values = openAI && key === 'quality' ? capabilities.qualities
        : openAI && key === 'outputFormat' ? capabilities.outputFormats.filter((value) => field.enum?.includes(value))
        : openAI && key === 'inputFidelity' ? capabilities.inputFidelities : field.enum
      if (field.type === 'boolean') return <label key={key} className="grid gap-2 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-3 text-sm">
        <span className="flex items-center justify-between gap-3"><span>{field.title}</span><input aria-label={field.title} className="size-4 accent-[var(--ds-brand-primary)]" type="checkbox" checked={value === true} onChange={(event) => onOption(key, event.target.checked)} /></span>
        {field.description ? <span className="text-xs text-[var(--ds-text-secondary)]">{field.description}</span> : null}
      </label>
      return <FieldShell key={key} label={field.title}>
        {values ? <Select aria-label={field.title} value={inputValue} onChange={(event) => onOption(key, event.target.value)}>
          {[...new Set([String(inputValue), ...values])].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select> : <>
          <Input aria-label={field.title} type={field.type === 'integer' ? 'number' : 'text'} value={inputValue} min={field.minimum} max={key === 'count' && outputFormat === 'svg' ? 1 : field.maximum} maxLength={field.maxLength} step={field.type === 'integer' ? 1 : undefined} list={key === 'imageModel' ? 'image-tool-models' : undefined}
            onChange={(event) => onOption(key, field.type === 'integer' ? Number(event.target.value) : event.target.value)} />
          {key === 'imageModel' ? <datalist id="image-tool-models">{OPENAI_IMAGE_MODELS.map((model) => <option key={model} value={model} />)}</datalist> : null}
        </>}
        {field.description ? <span className="text-xs text-[var(--ds-text-secondary)]">{field.description}</span> : null}
      </FieldShell>
    })}
  </div>
}
