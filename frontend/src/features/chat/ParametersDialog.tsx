import * as Dialog from '@radix-ui/react-dialog'
import { SlidersHorizontal, X } from 'lucide-react'

import { Button } from '../../components/ui/Button'
import { FieldShell, Input, Select, Textarea } from '../../components/ui/Field'
import type { StoredConversation } from '../../storage/db'
import type { VideoDraft } from './video-turn'
import { OpenAIImageSizeField } from './OpenAIImageSizeField'
import { OPENAI_IMAGE_MODELS, openAIImageCapabilities } from './openai-image-options'

export function ParametersDialog({
  open,
  conversation,
  options,
  videoDraft,
  modelCapabilities,
  openAIImageEditing,
  onOpenChange,
  onOption,
  onVideoDraft,
}: {
  open: boolean
  conversation: StoredConversation
  options: Record<string, unknown>
  videoDraft: VideoDraft
  modelCapabilities: Record<string, unknown> | undefined
  openAIImageEditing: boolean
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
              <p className="mt-2">参数只影响本轮；修改后同时成为该格式的新默认值。</p>
            </div>
            {conversation.mediaKind === 'image' ? (
              <ImageParameters
                format={conversation.apiFormat}
                modelId={conversation.modelId}
                options={options}
                openAIImageEditing={openAIImageEditing}
                onOption={onOption}
              />
            ) : (
              <VideoParameters
                format={conversation.apiFormat}
                options={options}
                draft={videoDraft}
                capabilities={modelCapabilities}
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

function ImageParameters({
  format,
  modelId,
  options,
  openAIImageEditing,
  onOption,
}: {
  format: StoredConversation['apiFormat']
  modelId: string
  options: Record<string, unknown>
  openAIImageEditing: boolean
  onOption: (key: string, value: unknown) => void
}) {
  if (format === 'googleGeminiImage') {
    return (
      <ParameterGrid>
        <SelectField label="宽高比" value={text(options, 'aspectRatio', '1:1')} values={['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']} onChange={(value) => onOption('aspectRatio', value)} />
        <SelectField label="图片大小" value={text(options, 'imageSize', '1K')} values={['512', '1K', '2K', '4K']} onChange={(value) => onOption('imageSize', value)} />
        <SelectField label="输出模态" value={text(options, 'responseModalities', 'IMAGE')} values={['IMAGE', 'TEXT_AND_IMAGE']} onChange={(value) => onOption('responseModalities', value)} />
        <SelectField label="Thinking Level" value={text(options, 'thinkingLevel', 'High')} values={['High', 'Low', 'Off']} onChange={(value) => onOption('thinkingLevel', value)} />
        <CheckField label="返回思考内容" checked={bool(options, 'includeThoughts', false)} onChange={(value) => onOption('includeThoughts', value)} />
      </ParameterGrid>
    )
  }

  if (format === 'xaiImage') {
    return (
      <ParameterGrid>
        <NumberField label="生成数量" value={num(options, 'count', 1)} min={1} max={10} onChange={(value) => onOption('count', value)} />
        <SelectField label="宽高比" value={text(options, 'aspectRatio', '1:1')} values={['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', 'auto']} onChange={(value) => onOption('aspectRatio', value)} />
        <SelectField label="分辨率" value={text(options, 'resolution', '1k')} values={['1k', '2k']} onChange={(value) => onOption('resolution', value)} />
        <SelectField label="质量" value={text(options, 'quality', 'medium')} values={['low', 'medium']} onChange={(value) => onOption('quality', value)} />
      </ParameterGrid>
    )
  }

  const responses = format === 'openaiResponsesImage'
  const imageModel = responses ? text(options, 'imageModel', OPENAI_IMAGE_MODELS[0]) : modelId
  const capabilities = openAIImageCapabilities(imageModel)
  const outputFormat = text(options, 'outputFormat', 'png')
  return (
    <ParameterGrid>
      {!responses ? <NumberField label="生成数量" value={num(options, 'count', 1)} min={1} max={10} onChange={(value) => onOption('count', value)} /> : null}
      {responses ? <SelectField label="图像模型" value={imageModel} values={[...OPENAI_IMAGE_MODELS]} onChange={(value) => onOption('imageModel', value)} /> : null}
      <OpenAIImageSizeField size={text(options, 'size', responses ? 'auto' : '1024x1024')} modelId={imageModel} onChange={(value) => onOption('size', value)} />
      <SelectField label="质量" value={text(options, 'quality', 'auto')} values={capabilities.qualities} onChange={(value) => onOption('quality', value)} />
      <SelectField label="输出格式" value={text(options, 'outputFormat', 'png')} values={['png', 'jpeg', 'webp']} onChange={(value) => onOption('outputFormat', value)} />
      {outputFormat === 'jpeg' || outputFormat === 'webp' ? <NumberField label="输出压缩" value={num(options, 'outputCompression', 100)} min={0} max={100} onChange={(value) => onOption('outputCompression', value)} /> : null}
      <SelectField label="背景" value={text(options, 'background', 'auto')} values={['auto', 'opaque', 'transparent']} onChange={(value) => onOption('background', value)} />
      <SelectField label="Moderation" value={text(options, 'moderation', 'auto')} values={['auto', 'low']} onChange={(value) => onOption('moderation', value)} />
      {(responses || openAIImageEditing) && capabilities.inputFidelities.length > 1 ? <SelectField label="输入保真度" value={text(options, 'inputFidelity', 'auto')} values={capabilities.inputFidelities} onChange={(value) => onOption('inputFidelity', value)} /> : null}
      <FieldShell label="安全标识（可选）" hint="最多 128 字符；请使用用户标识的哈希值">
        <Input value={text(options, 'safetyIdentifier', '')} maxLength={128} onChange={(event) => onOption('safetyIdentifier', event.target.value)} />
      </FieldShell>
      {!responses && openAIImageEditing ? (
        <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-3 text-xs leading-5 text-[var(--ds-text-secondary)]">
          参考图与遮罩编辑使用非流式上游请求，完成后一次性返回最终图片；渐进预览数量仅用于无参考图的文生图。
        </div>
      ) : (
        <NumberField label="渐进预览数量" value={num(options, 'partialImages', 2)} min={0} max={3} onChange={(value) => onOption('partialImages', value)} />
      )}
    </ParameterGrid>
  )
}

function VideoParameters({
  format,
  options,
  draft,
  capabilities,
  onOption,
  onDraft,
}: {
  format: StoredConversation['apiFormat']
  options: Record<string, unknown>
  draft: VideoDraft
  capabilities: Record<string, unknown> | undefined
  onOption: (key: string, value: unknown) => void
  onDraft: (patch: Partial<VideoDraft>) => void
}) {
  if (draft.operation === 'extension') {
    return (
      <ParameterGrid>
        <FieldShell label="源视频 URL">
          <Input value={draft.extensionVideoUrl} onChange={(event) => onDraft({ extensionVideoUrl: event.target.value })} />
        </FieldShell>
        <NumberField label="续写时长（秒）" value={num(options, 'extensionDuration', 6)} min={2} max={10} onChange={(value) => onOption('extensionDuration', value)} />
        <Button variant="secondary" onClick={() => onDraft({ operation: 'generation', parentTaskId: null, extensionVideoUrl: '' })}>退出续写模式</Button>
      </ParameterGrid>
    )
  }

  if (format === 'byteDanceVideo') {
    const durationMin = numberCapability(capabilities, 'durationMin', 2)
    const durationMax = numberCapability(capabilities, 'durationMax', 15)
    const resolutions = stringCapability(capabilities, 'resolutions', ['480p', '720p'])
    const defaultDuration = numberCapability(capabilities, 'defaultDuration', 5)
    const frameMode = draft.byteMode === 'firstFrameToVideo' || draft.byteMode === 'firstLastFrameToVideo'
    const adaptiveOnly = frameMode && capabilities?.frameAspectRatios !== undefined
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
        <NumberField label="时长（秒）" value={num(options, 'duration', defaultDuration) === -1 ? durationMin : num(options, 'duration', defaultDuration)} min={durationMin} max={durationMax} disabled={num(options, 'duration', defaultDuration) === -1} onChange={(value) => onOption('duration', value)} />
        {capabilities?.automaticDuration === true ? <CheckField label="自动决定时长" checked={num(options, 'duration', defaultDuration) === -1} onChange={(value) => onOption('duration', value ? -1 : durationMin)} /> : null}
        <SelectField label="分辨率" value={text(options, 'resolution', '720p')} values={resolutions} onChange={(value) => onOption('resolution', value)} />
        <SelectField label="画面比例" value={adaptiveOnly ? 'adaptive' : text(options, 'aspectRatio', 'adaptive')} values={adaptiveOnly ? ['adaptive'] : ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9']} onChange={(value) => onOption('aspectRatio', value)} />
        {capabilities?.generateAudio === true ? <CheckField label="生成同步音频" checked={bool(options, 'generateAudio', capabilities.defaultGenerateAudio === true)} onChange={(value) => onOption('generateAudio', value)} /> : null}
        <CheckField label="添加水印" checked={bool(options, 'watermark', false)} onChange={(value) => onOption('watermark', value)} />
        <CheckField label="返回尾帧" checked={bool(options, 'returnLastFrame', false)} onChange={(value) => onOption('returnLastFrame', value)} />
        {capabilities?.seed === true ? <NumberField label="Seed" value={num(options, 'seed', -1)} min={-1} max={4294967295} onChange={(value) => onOption('seed', value)} /> : null}
        {capabilities?.cameraFixed === true ? <CheckField label="固定机位" checked={bool(options, 'cameraFixed', false)} onChange={(value) => onOption('cameraFixed', value)} /> : null}
        {capabilities?.webSearch === true ? <CheckField label="Web Search" checked={bool(options, 'webSearch', false)} onChange={(value) => onOption('webSearch', value)} /> : null}
        {capabilities?.serviceTierParameter === true ? <SelectField label="服务等级" value={text(options, 'serviceTier', 'default')} values={stringCapability(capabilities, 'serviceTiers', ['default'])} onChange={(value) => onOption('serviceTier', value)} /> : null}
      </ParameterGrid>
    )
  }

  const resolutions = stringCapability(capabilities, 'resolutions', ['480p', '720p'])
  const referenceResolutions = draft.xaiMode === 'referenceToVideo' ? resolutions.filter((value) => value !== '1080p') : resolutions
  return (
    <ParameterGrid>
      <SelectField label="生成模式" value={draft.xaiMode} values={['textToVideo', 'firstFrameToVideo', 'referenceToVideo']} labels={['文生视频', '首帧生视频', '多参考生视频']} onChange={(value) => onDraft({ xaiMode: value as VideoDraft['xaiMode'] })} />
      {draft.xaiMode === 'referenceToVideo' ? <FieldShell label="参考音色" hint="逗号分隔，最多 3 个"><Input value={draft.voiceIds} onChange={(event) => onDraft({ voiceIds: event.target.value })} placeholder="eve, ara" /></FieldShell> : null}
      <NumberField label="时长（秒）" value={num(options, 'duration', 8)} min={numberCapability(capabilities, 'durationMin', 1)} max={numberCapability(capabilities, 'durationMax', 15)} onChange={(value) => onOption('duration', value)} />
      <SelectField label="分辨率" value={text(options, 'resolution', '720p')} values={referenceResolutions} onChange={(value) => onOption('resolution', value)} />
      <SelectField label="画面比例" value={text(options, 'aspectRatio', '16:9')} values={['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3']} onChange={(value) => onOption('aspectRatio', value)} />
    </ParameterGrid>
  )
}

function ParameterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4">{children}</div>
}

function SelectField({ label, value, values, labels, onChange }: { label: string; value: string; values: string[]; labels?: string[]; onChange: (value: string) => void }) {
  return <FieldShell label={label}><Select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((item, index) => <option key={item} value={item}>{labels?.[index] ?? item}</option>)}</Select></FieldShell>
}

function NumberField({ label, value, min, max, disabled = false, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (value: number) => void }) {
  return <FieldShell label={label}><Input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></FieldShell>
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-3 text-sm"><span>{label}</span><input className="size-4 accent-[var(--ds-brand-primary)]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>
}

function text(options: Record<string, unknown>, key: string, fallback: string): string { return typeof options[key] === 'string' ? options[key] : fallback }
function num(options: Record<string, unknown>, key: string, fallback: number): number { const value = options[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function bool(options: Record<string, unknown>, key: string, fallback: boolean): boolean { return typeof options[key] === 'boolean' ? options[key] : fallback }
function stringCapability(capabilities: Record<string, unknown> | undefined, key: string, fallback: string[]): string[] { const value = capabilities?.[key]; return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback }
function numberCapability(capabilities: Record<string, unknown> | undefined, key: string, fallback: number): number { const value = capabilities?.[key]; return typeof value === 'number' ? value : fallback }
