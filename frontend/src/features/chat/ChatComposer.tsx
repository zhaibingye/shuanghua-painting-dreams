import { CircleStop, Paintbrush, Send, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
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
  canStop,
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
  canStop: boolean
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
  const [attachmentsProcessing, setAttachmentsProcessing] = useState(false)
  const maxImages = imageLimit(conversation, videoDraft)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [prompt])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || typeof ResizeObserver === 'undefined') return
    let width = textarea.clientWidth
    const observer = new ResizeObserver(() => {
      if (width === textarea.clientWidth) return
      width = textarea.clientWidth
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    })
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [])
  const submit = () => {
    if (!busy && !attachmentsProcessing) onSubmit()
  }

  return (
    <div className="chat-composer" aria-label="消息编辑区">
      <div className="composer-inner">
        <div className="composer-card">
          <div className="composer-content ds-scroll">
            {maxImages > 0 ? (
              <div className="px-2 pt-1">
                <AttachmentTray
                  images={images}
                  maxImages={maxImages}
                  disabled={busy}
                  onChange={onImages}
                  onProcessingChange={setAttachmentsProcessing}
                />
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              aria-label="消息"
              className="message-input ds-scroll"
              value={prompt}
              disabled={busy}
              placeholder={placeholder(conversation, videoDraft)}
              onChange={(event) => onPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </div>
          <div className="composer-toolbar">
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              icon={<SlidersHorizontal className="size-4" />}
              onClick={onParameters}
            >
              本轮参数
            </Button>
            {conversation.apiFormat === 'openaiImage' ? (
              <Button
                size="sm"
                variant={maskReady ? 'secondary' : 'ghost'}
                className="rounded-full"
                icon={<Paintbrush className="size-4" />}
                disabled={!canOpenMask || busy}
                onClick={onOpenMask}
              >
                {maskReady ? '遮罩已就绪' : '绘制遮罩'}
              </Button>
            ) : null}
            <span className="ml-auto hidden text-xs text-[var(--ds-text-caption)] sm:inline">
              Enter 发送 · Shift+Enter 换行
            </span>
            <span className="ml-auto shrink-0">
              {busy && canStop ? (
                <Button
                  size="icon"
                  variant="danger"
                  className="ml-2"
                  icon={<CircleStop className="size-4" />}
                  aria-label="停止生成"
                  onClick={onStop}
                />
              ) : busy ? (
                <Button size="sm" variant="secondary" disabled>
                  <Spinner
                    label={conversation.mediaKind === 'video' ? '正在提交视频' : '正在准备图片'}
                  />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="send-button"
                  disabled={
                    attachmentsProcessing || (conversation.mediaKind === 'image' && !prompt.trim())
                  }
                  icon={<Send className="size-4" />}
                  aria-label="发送消息"
                  onClick={submit}
                />
              )}
            </span>
          </div>
        </div>
        <p className="composer-note">生成内容由第三方模型提供，请核对重要信息。</p>
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
    if (
      conversation.activeImageAssetId &&
      ['openaiImage', 'xaiImage'].includes(conversation.apiFormat)
    ) {
      return '描述如何修改最新图片…'
    }
    return '描述你想生成或编辑的画面…'
  }
  return draft.operation === 'extension' ? '描述视频接下来发生什么…' : '描述镜头、动作、场景和声音…'
}
