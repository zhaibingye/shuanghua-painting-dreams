import * as Dialog from '@radix-ui/react-dialog'
import { SlidersHorizontal, X } from 'lucide-react'

import { defaultOptions, optionFields } from '../../api/options'
import { Button } from '../../components/ui/Button'
import { FieldShell, Input, Select, Textarea } from '../../components/ui/Field'
import type { StoredConversation } from '../../storage/db'
import { isImageFormat } from '../../storage/settings'
import { ImageParameters } from './ImageParameters'
import { byteDanceVideoDefaults, resolveByteDanceVideoCapabilities, xaiVideoResolutions } from './model-capabilities'
import type { VideoDraft } from './video-turn'

export function ParametersDialog({
  open,
  conversation,
  options,
  videoDraft,
  onOpenChange,
  onOption,
  onVideoDraft,
}: {
  open: boolean
  conversation: StoredConversation
  options: Record<string, unknown>
  videoDraft: VideoDraft
  onOpenChange: (open: boolean) => void
  onOption: (key: string, value: unknown) => void
  onVideoDraft: (patch: Partial<VideoDraft>) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--ds-bg-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="ds-parameters">
          <header className="flex h-16 items-center justify-between border-b border-[var(--ds-border-light)] px-5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-[var(--ds-brand-text)]" />
              <Dialog.Title className="font-semibold">本轮参数</Dialog.Title>
              <Dialog.Description className="sr-only">调整当前创作的生成参数和参考素材。</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" icon={<X className="size-4" />} aria-label="关闭参数面板" />
            </Dialog.Close>
          </header>
          <div className="parameters-body ds-scroll">
            <div className="mb-5 rounded-xl bg-[var(--ds-bg-hover)] p-3 text-xs text-[var(--ds-text-secondary)]">
              <p className="font-medium text-[var(--ds-text-primary)]">{conversation.modelId}</p>
              <p className="mt-1 break-all">{conversation.baseUrl}</p>
              <p className="mt-2">修改后会用于本轮，并保存为该格式的默认参数。</p>
            </div>
            {isImageFormat(conversation.apiFormat) ? (
              <ImageParameters
                format={conversation.apiFormat}
                modelId={conversation.modelId}
                options={options}
                onOption={onOption}
              />
            ) : (
              <VideoParameters
                format={conversation.apiFormat}
                modelId={conversation.modelId}
                options={options}
                draft={videoDraft}
                onOption={onOption}
                onDraft={onVideoDraft}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function VideoParameters({
  format,
  modelId,
  options,
  draft,
  onOption,
  onDraft,
}: {
  format: StoredConversation['apiFormat']
  modelId: string
  options: Record<string, unknown>
  draft: VideoDraft
  onOption: (key: string, value: unknown) => void
  onDraft: (patch: Partial<VideoDraft>) => void
}) {
  if (draft.operation === 'extension') {
    const duration = optionFields('xaiVideoExtension').duration
    return (
      <ParameterGrid>
        <FieldShell label="源视频 URL">
          <Input value={draft.extensionVideoUrl} onChange={(event) => onDraft({ extensionVideoUrl: event.target.value })} />
        </FieldShell>
        <NumberField label="续写时长（秒）" value={(options.extensionDuration as number | undefined) ?? defaultOptions('xaiVideoExtension').duration} min={duration.minimum} max={duration.maximum} onChange={(value) => onOption('extensionDuration', value)} />
        <Button variant="secondary" onClick={() => onDraft({ operation: 'generation', parentTaskId: null, extensionVideoUrl: '' })}>退出续写模式</Button>
      </ParameterGrid>
    )
  }

  if (format === 'byteDanceVideo') {
    const byteCapabilities = resolveByteDanceVideoCapabilities(modelId)
    const { durationMin, durationMax, resolutions } = byteCapabilities
    const values = { ...byteDanceVideoDefaults(modelId), ...options }
    const fields = optionFields('byteDanceVideo')
    const duration = values.duration
    const automaticDuration = duration === -1
    const frameMode = draft.byteMode === 'firstFrameToVideo' || draft.byteMode === 'firstLastFrameToVideo'
    const adaptiveOnly = frameMode && byteCapabilities.frameAspectRatios !== undefined
    return (
      <ParameterGrid>
        <SelectField label="生成模式" value={draft.byteMode} values={['textToVideo', 'firstFrameToVideo', 'firstLastFrameToVideo', 'referenceToVideo']} labels={['文生视频', '首帧生视频', '首尾帧生视频', '参考素材生视频']} onChange={(value) => onDraft({ byteMode: value as VideoDraft['byteMode'] })} />
        {(draft.byteMode === 'firstFrameToVideo' || draft.byteMode === 'firstLastFrameToVideo') ? <FieldShell label="首帧公网 URL"><Input value={draft.firstFrameUrl} onChange={(event) => onDraft({ firstFrameUrl: event.target.value })} /></FieldShell> : null}
        {draft.byteMode === 'firstLastFrameToVideo' ? <FieldShell label="尾帧公网 URL"><Input value={draft.lastFrameUrl} onChange={(event) => onDraft({ lastFrameUrl: event.target.value })} /></FieldShell> : null}
        {draft.byteMode === 'referenceToVideo' ? <>
          <FieldShell label="参考图片 URL" hint="每行一个"><Textarea rows={3} value={draft.referenceImageUrls} onChange={(event) => onDraft({ referenceImageUrls: event.target.value })} /></FieldShell>
          <FieldShell label="参考视频 URL"><Input value={draft.referenceVideoUrl} onChange={(event) => onDraft({ referenceVideoUrl: event.target.value })} /></FieldShell>
          <FieldShell label="参考音频 URL"><Input value={draft.referenceAudioUrl} onChange={(event) => onDraft({ referenceAudioUrl: event.target.value })} /></FieldShell>
        </> : null}
        <NumberField label="时长（秒）" value={automaticDuration ? durationMin : duration} min={durationMin} max={durationMax} disabled={automaticDuration} onChange={(value) => onOption('duration', value)} />
        {byteCapabilities.automaticDuration ? <CheckField label="自动决定时长" checked={automaticDuration} onChange={(value) => onOption('duration', value ? -1 : durationMin)} /> : null}
        <SelectField label="分辨率" value={values.resolution} values={resolutions} onChange={(value) => onOption('resolution', value)} />
        <SelectField label="画面比例" value={adaptiveOnly ? 'adaptive' : values.aspectRatio} values={adaptiveOnly ? ['adaptive'] : fields.aspectRatio.enum} onChange={(value) => onOption('aspectRatio', value)} />
        {byteCapabilities.generateAudio ? <CheckField label="生成同步音频" checked={values.generateAudio} onChange={(value) => onOption('generateAudio', value)} /> : null}
        <CheckField label="添加水印" checked={values.watermark} onChange={(value) => onOption('watermark', value)} />
        <CheckField label="返回尾帧" checked={values.returnLastFrame} onChange={(value) => onOption('returnLastFrame', value)} />
        {byteCapabilities.seed ? <NumberField label="Seed" value={values.seed} min={fields.seed.minimum} max={fields.seed.maximum} onChange={(value) => onOption('seed', value)} /> : null}
        {byteCapabilities.cameraFixed ? <CheckField label="固定机位" checked={values.cameraFixed} onChange={(value) => onOption('cameraFixed', value)} /> : null}
        {byteCapabilities.webSearch ? <CheckField label="Web Search" checked={values.webSearch} onChange={(value) => onOption('webSearch', value)} /> : null}
        {byteCapabilities.serviceTierParameter ? <SelectField label="服务等级" value={values.serviceTier} values={byteCapabilities.serviceTiers} onChange={(value) => onOption('serviceTier', value)} /> : null}
      </ParameterGrid>
    )
  }

  const values = { ...defaultOptions('xaiVideo'), ...options }
  const fields = optionFields('xaiVideo')
  const resolutions = xaiVideoResolutions(modelId)
  const referenceResolutions = draft.xaiMode === 'referenceToVideo' ? resolutions.filter((value) => value !== '1080p') : resolutions
  return (
    <ParameterGrid>
      <SelectField label="生成模式" value={draft.xaiMode} values={['textToVideo', 'firstFrameToVideo', 'referenceToVideo']} labels={['文生视频', '首帧生视频', '多参考生视频']} onChange={(value) => onDraft({ xaiMode: value as VideoDraft['xaiMode'] })} />
      {draft.xaiMode === 'referenceToVideo' ? <FieldShell label="参考音色" hint="逗号分隔，最多 3 个"><Input value={draft.voiceIds} onChange={(event) => onDraft({ voiceIds: event.target.value })} placeholder="eve, ara" /></FieldShell> : null}
      <NumberField label="时长（秒）" value={values.duration} min={fields.duration.minimum} max={fields.duration.maximum} onChange={(value) => onOption('duration', value)} />
      <SelectField label="分辨率" value={values.resolution} values={referenceResolutions} onChange={(value) => onOption('resolution', value)} />
      <SelectField label="画面比例" value={values.aspectRatio} values={fields.aspectRatio.enum} onChange={(value) => onOption('aspectRatio', value)} />
    </ParameterGrid>
  )
}

function ParameterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4">{children}</div>
}

function SelectField({ label, value, values, labels, onChange }: { label: string; value: string; values: readonly string[]; labels?: string[]; onChange: (value: string) => void }) {
  return <FieldShell label={label}><Select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item, index) => <option key={item} value={item}>{labels?.[index] ?? item}</option>)}</Select></FieldShell>
}

function NumberField({ label, value, min, max, disabled = false, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <FieldShell label={label}><Input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></FieldShell>
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-3 text-sm"><span>{label}</span><input className="size-4 accent-[var(--ds-brand-primary)]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>
}
