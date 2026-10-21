import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { FieldShell, Input, Select } from '../../components/ui/Field'
import {
  experimentalImageSize,
  OPENAI_ASPECT_RATIOS,
  OPENAI_RESOLUTION_TIERS,
  OPENAI_STANDARD_SIZES,
  openAIImageCapabilities,
  openAIImageAspectRatio,
  openAIImagePreset,
  openAIImageSizeError,
  type OpenAIAspectRatio,
} from './openai-image-options'

export function OpenAIImageSizeField({ size, modelId, onChange }: {
  size: string
  modelId: string
  onChange: (size: string) => void
}) {
  const [ratio, setRatio] = useState<OpenAIAspectRatio>(() => openAIImageAspectRatio(size))
  const custom = openAIImageCapabilities(modelId).customImageSize
  return (
    <div className="grid gap-3 rounded-xl border border-[var(--ds-border-default)] p-3">
      {custom ? <>
        <FieldShell label="快捷比例">
          <Select value={ratio} onChange={(event) => setRatio(event.target.value as OpenAIAspectRatio)}>
            {OPENAI_ASPECT_RATIOS.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </FieldShell>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="分辨率快捷选项">
          {OPENAI_RESOLUTION_TIERS.map((tier) => {
            const pixels = openAIImagePreset(ratio, tier)
            return <Button key={tier} variant={size === pixels ? 'primary' : 'secondary'} className="h-auto min-w-0 py-2" aria-pressed={size === pixels} onClick={() => onChange(pixels)}>
              <span className="grid gap-1"><span>{tier}</span><span className="text-[10px] font-normal">{pixels.replace('x', ' × ')}</span></span>
            </Button>
          })}
        </div>
        <p className="text-xs leading-5 text-[var(--ds-text-secondary)]">档位按长边约 1K / 2K / 4K 计算，并按像素上限调整，以上为实际输出尺寸。</p>
      </> : <FieldShell label="标准尺寸">
        <Select value={OPENAI_STANDARD_SIZES.includes(size as typeof OPENAI_STANDARD_SIZES[number]) ? size : 'auto'} onChange={(event) => onChange(event.target.value)}>
          {OPENAI_STANDARD_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
      </FieldShell>}
      <FieldShell label="尺寸" hint="auto 或 WIDTHxHEIGHT" error={openAIImageSizeError(size, modelId)}>
        <Input value={size} onChange={(event) => onChange(event.target.value)} />
      </FieldShell>
      <Button variant="ghost" size="sm" onClick={() => onChange('auto')}>自动尺寸</Button>
      {experimentalImageSize(size) ? <p className="text-xs text-[var(--ds-text-secondary)]">当前尺寸超过 2560 × 1440 的总像素，属于官方实验性分辨率。</p> : null}
    </div>
  )
}
