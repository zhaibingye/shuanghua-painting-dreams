import { CircleStop, Paintbrush, Send, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Button } from '../../components/ui/Button'
import type { StoredConversation } from '../../storage/db'
import { AttachmentTray } from './AttachmentTray'
import type { DraftImage } from './image-turn'
import type { VideoDraft } from './video-turn'

export function ChatComposer({
  conversation,
  prompt,
  images,
  videoDraft,
  busy,
  maskReady,
  canOpenMask,
  onPrompt,
  onImages,
  onSubmit,
  onStop,
  onParameters,
  onOpenMask,
}: {
  conversation: StoredConversation
  prompt: string
  images: DraftImage[]
  videoDraft: VideoDraft
  busy: boolean
  maskReady: boolean
  canOpenMask: boolean
  onPrompt: (value: string) => void
  onImages: (images: DraftImage[]) => void
  onSubmit: () => void
  onStop: () => void
  onParameters: () => void
  onOpenMask: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const maxImages = imageLimit(conversation, videoDraft)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
  }, [prompt])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--ds-bg-base)] via-[var(--ds-bg-base)] via-75% to-transparent px-3 pb-5 pt-12 sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-[var(--ds-chat-max-width)]">
        <div className="rounded-[var(--ds-radius-card)] border border-[var(--ds-border-default)] bg-[var(--ds-bg-input)] p-2 shadow-[var(--ds-shadow-card)]">
          {maxImages > 0 ? (
            <div className="px-2 pt-1">
              <AttachmentTray images={images} maxImages={maxImages} disabled={busy} onChange={onImages} />
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            aria-label="消息"
            className="block max-h-60 min-h-[54px] w-full resize-none overflow-y-auto border-0 bg-transparent px-3 py-3 text-base leading-[25px] text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-tertiary)]"
            value={prompt}
            disabled={busy}
            placeholder={placeholder(conversation, videoDraft)}
            onChange={(event) => onPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (!busy) onSubmit()
              }
            }}
          />
          <div className="flex items-center gap-1 px-1 pb-1">
            <Button size="sm" variant="ghost" className="rounded-full" icon={<SlidersHorizontal className="size-4" />} onClick={onParameters}>本轮参数</Button>
            {conversation.apiFormat === 'openaiImage' ? (
              <Button size="sm" variant={maskReady ? 'secondary' : 'ghost'} className="rounded-full" icon={<Paintbrush className="size-4" />} disabled={!canOpenMask || busy} onClick={onOpenMask}>{maskReady ? '遮罩已就绪' : '绘制遮罩'}</Button>
            ) : null}
            <span className="ml-auto hidden text-xs text-[var(--ds-text-caption)] sm:inline">Enter 发送 · Shift+Enter 换行</span>
            {busy ? (
              <Button size="icon" variant="danger" className="ml-2" icon={<CircleStop className="size-4" />} aria-label="停止生成" onClick={onStop} />
            ) : (
              <Button size="icon" className="ml-2" icon={<Send className="size-4" />} aria-label="发送消息" onClick={onSubmit} />
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--ds-text-caption)]">生成内容由第三方模型提供，请核对重要信息。</p>
      </div>
    </div>
  )
}

function imageLimit(conversation: StoredConversation, draft: VideoDraft): number {
  if (conversation.mediaKind === 'video') {
    if (conversation.apiFormat !== 'xaiVideo' || draft.operation === 'extension') return 0
    if (draft.xaiMode === 'firstFrameToVideo') return 1
    return draft.xaiMode === 'referenceToVideo' ? 8 : 0
  }
  if (conversation.apiFormat === 'googleGeminiImage') return 14
  if (conversation.apiFormat === 'openaiResponsesImage') return 16
  if (conversation.apiFormat === 'openaiImage') {
    return conversation.activeImageAssetId ? 15 : 16
  }
  return conversation.activeImageAssetId ? 2 : 3
}

function placeholder(conversation: StoredConversation, draft: VideoDraft): string {
  if (conversation.mediaKind === 'image') {
    if (conversation.activeImageAssetId && ['openaiImage', 'xaiImage'].includes(conversation.apiFormat)) {
      return '描述如何修改最新图片…'
    }
    return '描述你想生成或编辑的画面…'
  }
  return draft.operation === 'extension' ? '描述视频接下来发生什么…' : '描述镜头、动作、场景和声音…'
}
