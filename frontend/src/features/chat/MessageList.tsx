import { ArrowUpRight, Check, Copy, Download, GitBranchPlus, ImageIcon, Pencil, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useObjectUrl } from '../../hooks/use-object-url'
import { useVideoTask } from '../../hooks/use-history'
import {
  taskForMessage,
  useImageTaskStore,
  type RuntimePartialImage,
} from '../image-tasks/image-task-store'
import {
  getAssets,
  type StoredConversation,
  type StoredMediaAsset,
  type StoredMessage,
  type StoredVideoTask,
} from '../../storage/db'
import { copyText } from '../../utils/clipboard'
import { downloadBlob, imageFilename } from '../../utils/download'

export function MessageList({
  conversation,
  messages,
  onSetActiveImage,
  onMaskImage,
  onContinueVideo,
}: {
  conversation: StoredConversation
  messages: StoredMessage[]
  onSetActiveImage: (asset: StoredMediaAsset) => void
  onMaskImage: (asset: StoredMediaAsset) => void
  onContinueVideo: (task: StoredVideoTask) => void
}) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto grid min-h-[min(50dvh,28rem)] w-full max-w-[var(--ds-chat-max-width)] place-items-center px-6 text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--ds-brand-subtle)] text-[var(--ds-brand-text)]">
            {conversation.mediaKind === 'image' ? <ImageIcon className="size-6" /> : <Sparkles className="size-6" />}
          </span>
          <h2 className="mt-5 text-xl font-semibold">开始这段{conversation.mediaKind === 'image' ? '图片' : '视频'}对话</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ds-text-secondary)]">
            {conversation.mediaKind === 'image'
              ? '描述你想创作的画面，也可以附加参考图。后续消息会按照当前 API 格式延续编辑。'
              : '同一对话中的每轮视频任务彼此独立；需要续写时请从已完成的视频显式发起。'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-[var(--ds-chat-max-width)] message-list gap-7 px-4 py-6 sm:px-7 sm:py-8">
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} message={message} />
        ) : conversation.mediaKind === 'image' ? (
          <ImageAssistantMessage
            key={message.id}
            conversation={conversation}
            message={message}
            onSetActiveImage={onSetActiveImage}
            onMaskImage={onMaskImage}
          />
        ) : (
          <VideoAssistantMessage key={message.id} message={message} onContinue={onContinueVideo} />
        ),
      )}
    </div>
  )
}

function UserMessage({ message }: { message: StoredMessage }) {
  const assets = useAssets(message.attachmentAssetIds)
  return (
    <article className="ml-auto max-w-[88%]">
      {assets.length > 0 ? (
        <div className="mb-2 flex justify-end gap-2 overflow-x-auto">
          {assets.map((asset) => <AssetThumbnail key={asset.id} asset={asset} />)}
        </div>
      ) : null}
      <div className="rounded-[18px] rounded-br-md bg-[var(--ds-bg-bubble)] px-4 py-2.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[15px] leading-6 text-[var(--ds-text-primary)]">
        {message.text || <span className="text-[var(--ds-text-tertiary)]">仅提供素材</span>}
      </div>
    </article>
  )
}

function ImageAssistantMessage({
  conversation,
  message,
  onSetActiveImage,
  onMaskImage,
}: {
  conversation: StoredConversation
  message: StoredMessage
  onSetActiveImage: (asset: StoredMediaAsset) => void
  onMaskImage: (asset: StoredMediaAsset) => void
}) {
  const live = useImageTaskStore((state) => taskForMessage(state.tasks, message.id))
  const assets = useAssets(message.outputAssetIds)
  const normalAssets = assets.filter((asset) => !asset.thought)
  const thoughtAssets = assets.filter((asset) => asset.thought)
  const thoughtTexts =
    message.providerState?.type === 'gemini'
      ? message.providerState.parts
          .filter((part) => part.kind === 'text' && part.thought)
          .map((part) => part.kind === 'text' ? part.text : '')
      : []

  return (
    <article className="min-w-0">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ds-text-caption)]">
        <span className="grid size-7 place-items-center rounded-full bg-[var(--ds-brand-subtle)] text-[var(--ds-brand-text)]"><Sparkles className="size-3.5" /></span>
        <span>霜华绘梦</span>
        {message.status === 'streaming' || message.status === 'pending' ? <Spinner label="正在创作" /> : null}
      </div>

      {(thoughtTexts.length > 0 || thoughtAssets.length > 0) ? (
        <details className="mb-4 rounded-xl border-l-2 border-[var(--ds-brand-border)] bg-[var(--ds-bg-hover)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ds-text-secondary)]">查看 Gemini 思考内容</summary>
          <div className="ds-think-content mt-3 whitespace-pre-wrap">{thoughtTexts.join('\n\n')}</div>
          {thoughtAssets.length > 0 ? <div className="mt-3 grid grid-cols-2 gap-2">{thoughtAssets.map((asset) => <ReadonlyImage key={asset.id} asset={asset} />)}</div> : null}
        </details>
      ) : null}

      {live && Object.keys(live.partials).length > 0 ? (
        <div className={`mb-4 grid gap-3 ${Object.keys(live.partials).length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {Object.values(live.partials)
            .sort((left, right) => left.imageIndex - right.imageIndex)
            .map((partial) => (
              <PartialImagePreview key={partial.imageIndex} partial={partial} />
            ))}
        </div>
      ) : null}

      {normalAssets.length > 0 ? (
        <div className={`grid gap-3 ${normalAssets.length > 1 ? 'sm:grid-cols-2' : 'max-w-[38rem]'}`}>
          {normalAssets.map((asset, index) => (
            <ImageResultCard
              key={asset.id}
              asset={asset}
              index={index}
              provider={conversation.apiFormat}
              active={conversation.activeImageAssetId === asset.id}
              canMask={conversation.apiFormat === 'openaiImage'}
              onSetActive={onSetActiveImage}
              onMask={onMaskImage}
            />
          ))}
        </div>
      ) : null}

      {(message.text || live?.text) ? (
        <div className={`ds-markdown whitespace-pre-wrap ${message.status === 'streaming' ? 'ds-stream-cursor' : ''}`}>
          {message.text || live?.text}
        </div>
      ) : null}

      {message.status === 'failed' || message.status === 'interrupted' ? (
        <div className="mt-3 rounded-xl border border-[var(--ds-error-border)] bg-[var(--ds-error-subtle)] px-4 py-3 text-sm text-[var(--ds-error)]">
          {message.error?.message ?? '本轮图片请求失败。'}
        </div>
      ) : null}
      {message.status === 'stopped' ? <p className="mt-3 text-sm text-[var(--ds-text-tertiary)]">已停止生成。</p> : null}
    </article>
  )
}

function PartialImagePreview({ partial }: { partial: RuntimePartialImage }) {
  const url = useObjectUrl(partial.blob)
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]">
      {url ? (
        <img
          src={url}
          alt={`渐进式生成预览 ${partial.imageIndex + 1}`}
          className="max-h-[34rem] w-full object-contain"
        />
      ) : null}
      <div className="flex items-center gap-2 border-t border-[var(--ds-border-light)] px-3 py-2 text-xs text-[var(--ds-text-secondary)]">
        <span className="size-2 animate-pulse rounded-full bg-[var(--ds-brand-primary)]" />
        结果 {partial.imageIndex + 1} · 渐进预览
        {partial.partialImageIndex !== null ? ` ${partial.partialImageIndex + 1}` : ''}
        ，最终图片仍在生成
      </div>
    </div>
  )
}

function ImageResultCard({
  asset,
  index,
  provider,
  active,
  canMask,
  onSetActive,
  onMask,
}: {
  asset: StoredMediaAsset
  index: number
  provider: string
  active: boolean
  canMask: boolean
  onSetActive: (asset: StoredMediaAsset) => void
  onMask: (asset: StoredMediaAsset) => void
}) {
  const url = useObjectUrl(asset.blob)
  return (
    <div className="group overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)]">
      <div className="relative bg-[var(--ds-bg-hover)]">
        {url ? <img src={url} alt={`生成结果 ${index + 1}`} className="max-h-[38rem] w-full object-contain" /> : null}
        {active ? <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-[var(--ds-brand-border)] bg-[var(--ds-bg-layer-1)] px-2.5 py-1 text-xs text-[var(--ds-brand-text)] shadow"><Check className="size-3" />后续编辑基图</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--ds-border-light)] p-2">
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => asset.blob && downloadBlob(asset.blob, imageFilename(provider, asset.mimeType ?? 'image/png', index))}>下载</Button>
        <Button size="sm" variant="ghost" icon={active ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />} onClick={() => onSetActive(asset)}>{active ? '已选中' : '设为基图'}</Button>
        {canMask ? <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => onMask(asset)}>遮罩编辑</Button> : null}
        <Button size="sm" variant="ghost" icon={<ArrowUpRight className="size-3.5" />} disabled={!url} onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}>查看</Button>
      </div>
      {asset.revisedPrompt ? <details className="border-t border-[var(--ds-border-light)] px-3 py-2 text-xs text-[var(--ds-text-secondary)]"><summary className="cursor-pointer">优化后的提示词</summary><p className="mt-2 whitespace-pre-wrap leading-5">{asset.revisedPrompt}</p></details> : null}
    </div>
  )
}

function VideoAssistantMessage({ message, onContinue }: { message: StoredMessage; onContinue: (task: StoredVideoTask) => void }) {
  const task = useVideoTask(message.id)
  if (!task) return <Spinner label="正在建立视频任务" />
  const running = ['submitting', 'queued', 'processing', 'pollingError'].includes(task.status)
  return (
    <article>
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ds-text-caption)]"><span className="grid size-7 place-items-center rounded-full bg-[var(--ds-brand-subtle)] text-[var(--ds-brand-text)]"><Sparkles className="size-3.5" /></span><span>霜华绘梦</span><Badge tone={videoTone(task.status)}>{videoLabel(task.status)}</Badge>{task.progress !== null ? <span>{task.progress}%</span> : null}</div>
      <div className="overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)]">
        {task.videoUrl ? <video className="max-h-[34rem] w-full bg-black" src={task.videoUrl} controls preload="metadata" /> : <div className="grid min-h-52 place-items-center bg-[var(--ds-bg-hover)]">{running ? <div className="text-center"><Spinner label={task.status === 'pollingError' ? '查询暂时失败，正在重试' : '视频生成中'} /><div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-[var(--ds-bg-active)]"><div className="h-full rounded-full bg-[var(--ds-brand-primary)] transition-all" style={{ width: `${task.progress ?? (task.status === 'queued' ? 10 : 38)}%` }} /></div></div> : <span className="text-sm text-[var(--ds-text-tertiary)]">没有可播放的视频结果</span>}</div>}
        <div className="grid gap-3 p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 break-all text-xs text-[var(--ds-text-secondary)]"><span>{task.modelId}</span><span>·</span><span>任务 {task.upstreamTaskId ?? '提交中'}</span></div>
          {task.error ? <p className="rounded-xl bg-[var(--ds-error-subtle)] px-3 py-2 text-sm text-[var(--ds-error)]">{task.error.message}</p> : null}
          {task.videoUrl ? <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => void copyText(task.videoUrl ?? '').then(() => toast.success('视频 URL 已复制'))}>复制 URL</Button><Button size="sm" variant="ghost" icon={<ArrowUpRight className="size-3.5" />} onClick={() => window.open(task.videoUrl ?? '', '_blank', 'noopener,noreferrer')}>打开</Button>{(task.lastFrameUrl || (task.apiFormat === 'xaiVideo' && task.modelId === 'grok-imagine-video')) ? <Button size="sm" variant="ghost" icon={<GitBranchPlus className="size-3.5" />} onClick={() => onContinue(task)}>续写</Button> : null}</div> : null}
        </div>
      </div>
    </article>
  )
}

function AssetThumbnail({ asset }: { asset: StoredMediaAsset }) {
  const blobUrl = useObjectUrl(asset.blob)
  const source = blobUrl ?? asset.url
  return source ? <img src={source} alt={asset.filename ?? '用户附件'} className="size-20 rounded-xl border border-[var(--ds-border-default)] object-cover" /> : null
}

function ReadonlyImage({ asset }: { asset: StoredMediaAsset }) {
  const url = useObjectUrl(asset.blob)
  return url ? <img src={url} alt="思考过程图片" className="max-h-64 w-full rounded-lg object-contain" /> : null
}

function useAssets(ids: string[]): StoredMediaAsset[] {
  const stableIds = useMemo(() => ids.join('|'), [ids])
  const [assets, setAssets] = useState<StoredMediaAsset[]>([])
  useEffect(() => {
    let disposed = false
    void getAssets(stableIds ? stableIds.split('|') : []).then((value) => { if (!disposed) setAssets(value) })
    return () => { disposed = true }
  }, [stableIds])
  return assets
}

function videoLabel(status: StoredVideoTask['status']): string {
  return { submitting: '正在提交', queued: '排队中', processing: '生成中', succeeded: '已完成', failed: '失败', expired: '已过期', cancelled: '已取消', pollingError: '查询重试中' }[status]
}
function videoTone(status: StoredVideoTask['status']): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'succeeded') return 'success'
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'danger'
  if (status === 'pollingError') return 'warning'
  return status === 'queued' ? 'neutral' : 'info'
}
