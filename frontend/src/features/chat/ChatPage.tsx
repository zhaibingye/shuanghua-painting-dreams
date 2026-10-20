import { ArrowDown, Menu, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'

import {
  ApiClientError,
  createVideo,
  extendVideo,
} from '../../api/client'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useChatScroll } from '../../hooks/use-chat-scroll'
import { useConversation, useMessages } from '../../hooks/use-history'
import { useProviderMetadata } from '../../hooks/use-provider-metadata'
import {
  createTurn,
  getAssets,
  updateConversation,
  updateMessage,
  updateVideoTask,
  type StoredMediaAsset,
  type StoredMessage,
  type StoredVideoTask,
} from '../../storage/db'
import { apiFormatLabels, effectiveKey } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'
import {
  cancelImageTask,
  startImageTask,
} from '../image-tasks/image-task-manager'
import {
  taskForConversation,
  useImageTaskStore,
} from '../image-tasks/image-task-store'
import { MaskEditor } from '../mask-editor/MaskEditor'
import { ChatComposer } from './ChatComposer'
import {
  buildImageTurnRequest,
  draftToStoredAsset,
  type DraftImage,
} from './image-turn'
import { MessageList } from './MessageList'
import { clampByteDanceResolution, resolveModelCapabilities } from './model-capabilities'
import { ParametersDialog } from './ParametersDialog'
import {
  buildVideoExtensionRequest,
  buildVideoGenerationRequest,
  defaultVideoDraft,
  validateVideoTurn,
  type VideoDraft,
} from './video-turn'

export function ChatPage({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { conversation, loading } = useConversation(conversationId)
  const { messages } = useMessages(conversationId)
  const settings = useSettingsStore((state) => state.settings)
  const updateFormat = useSettingsStore((state) => state.updateFormat)
  const addRecentVoiceId = useSettingsStore((state) => state.addRecentVoiceId)
  const metadata = useProviderMetadata().data
  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<DraftImage[]>([])
  const imagesRef = useRef(images)
  const conversationIdRef = useRef(conversationId)
  const [turnOptions, setTurnOptions] = useState<Record<string, unknown>>({})
  const [videoDraft, setVideoDraft] = useState<VideoDraft>(defaultVideoDraft)
  const [parametersOpen, setParametersOpen] = useState(false)
  const [imagePreparing, setImagePreparing] = useState(false)
  const imagePreparingRef = useRef(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const videoBusyRef = useRef(false)
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null)
  const [maskSource, setMaskSource] = useState<{
    url: string
    width: number
    height: number
    ownedUrl: boolean
  } | null>(null)
  const activeImageTask = useImageTaskStore((state) =>
    taskForConversation(state.tasks, conversationId ?? ''),
  )

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    conversationIdRef.current = conversationId
    return () => { conversationIdRef.current = undefined }
  }, [conversationId])

  const currentConversationId = conversation?.id
  const currentApiFormat = conversation?.apiFormat
  const currentModelId = conversation?.modelId

  useEffect(() => {
    if (!currentApiFormat) return
    const defaults = {
      ...useSettingsStore.getState().settings.formats[currentApiFormat].defaults,
    }
    if (currentApiFormat === 'byteDanceVideo' && currentModelId) {
      defaults.resolution = clampByteDanceResolution(defaults.resolution, currentModelId)
    }
    setTurnOptions(defaults)
    setPrompt('')
    setVideoDraft({ ...defaultVideoDraft })
    setMaskDataUrl(null)
    setParametersOpen(false)
    setImages((current) => {
      revokeDraftImages(current)
      return []
    })
  }, [currentApiFormat, currentConversationId, currentModelId])

  useEffect(
    () => () => {
      revokeDraftImages(imagesRef.current)
    },
    [],
  )

  useEffect(
    () => () => {
      if (maskSource?.ownedUrl) URL.revokeObjectURL(maskSource.url)
    },
    [maskSource],
  )

  const scrollRevision = useMemo(() => ({
    messages, partials: activeImageTask?.partials, text: activeImageTask?.text,
  }), [messages, activeImageTask?.partials, activeImageTask?.text])
  const { scrollRef, contentRef, atBottom, scrollToBottom } = useChatScroll(
    conversationId, scrollRevision, !loading && Boolean(conversation),
  )

  const capabilities = useMemo(
    () =>
      resolveModelCapabilities({
        apiFormat: conversation?.apiFormat,
        modelId: conversation?.modelId,
        provider: metadata?.providers.find(
          (provider) => provider.apiFormat === conversation?.apiFormat,
        ),
      }),
    [conversation?.apiFormat, conversation?.modelId, metadata?.providers],
  )

  if (loading) {
    return <div className="grid h-full place-items-center"><Spinner label="正在加载对话" /></div>
  }
  if (!conversation) {
    return <div className="grid h-full place-items-center px-6 text-center"><div><h1 className="text-xl font-semibold">对话不存在</h1><p className="mt-2 text-sm text-[var(--ds-text-secondary)]">它可能已被删除，请从侧边栏创建新对话。</p></div></div>
  }

  const key = effectiveKey(settings, conversation.apiFormat)
  const busy =
    conversation.mediaKind === 'image'
      ? imagePreparing || activeImageTask !== null
      : videoBusy
  const setOption = (name: string, value: unknown) => {
    const next = { ...turnOptions, [name]: value }
    setTurnOptions(next)
    updateFormat(conversation.apiFormat, { defaults: next })
  }

  const submit = () => {
    if (busy) return
    if (!key) {
      toast.error('当前 API 格式没有可用的 Key，请先在设置中填写。')
      return
    }
    scrollToBottom()
    if (conversation.mediaKind === 'image') void submitImage(conversation, messages, key)
    else void submitVideo(conversation, key)
  }

  const submitImage = async (
    currentConversation: typeof conversation,
    previousMessages: StoredMessage[],
    apiKey: string,
  ) => {
    const currentPrompt = prompt.trim()
    if (!currentPrompt) {
      toast.error('请填写图片生成或编辑指令。')
      return
    }
    if (maskDataUrl && !hasSingleMaskSource(currentConversation, images)) {
      toast.error('遮罩编辑必须且只能使用一张主编辑图片。')
      return
    }

    if (imagePreparingRef.current || taskForConversation(
      useImageTaskStore.getState().tasks, currentConversation.id,
    )) return
    imagePreparingRef.current = true
    setImagePreparing(true)
    const draftImages = images
    try {
      const request = await buildImageTurnRequest({
        conversation: currentConversation,
        previousMessages,
        prompt: currentPrompt,
        draftImages,
        turnOptions,
        maskDataUrl,
      })
      const now = new Date().toISOString()
      const userMessageId = `msg_${crypto.randomUUID()}`
      const assistantMessageId = `msg_${crypto.randomUUID()}`
      const taskId = `image_${crypto.randomUUID()}`
      const inputAssets = draftImages.map((draft) =>
        draftToStoredAsset({
          draft,
          conversationId: currentConversation.id,
          messageId: userMessageId,
        }),
      )
      const userMessage: StoredMessage = {
        id: userMessageId,
        conversationId: currentConversation.id,
        mediaKind: 'image',
        role: 'user',
        status: 'succeeded',
        text: currentPrompt,
        attachmentAssetIds: inputAssets.map((asset) => asset.id),
        outputAssetIds: [],
        providerState: null,
        optionsSnapshot: turnOptions,
        taskId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      }
      const assistantMessage: StoredMessage = {
        id: assistantMessageId,
        conversationId: currentConversation.id,
        mediaKind: 'image',
        role: 'assistant',
        status: 'pending',
        text: '',
        attachmentAssetIds: [],
        outputAssetIds: [],
        providerState: null,
        optionsSnapshot: turnOptions,
        taskId,
        error: null,
        createdAt: new Date(Date.now() + 1).toISOString(),
        updatedAt: now,
      }
      const nextTitle =
        previousMessages.length === 0 ? titleFromPrompt(currentPrompt) : currentConversation.title
      await createTurn({
        conversation: { ...currentConversation, title: nextTitle, updatedAt: now },
        userMessage,
        assistantMessage,
        inputAssets,
      })

      startImageTask({
        taskId,
        conversationId: currentConversation.id,
        assistantMessageId,
        request,
        apiKey,
      })
      revokeDraftImages(draftImages)
      if (conversationIdRef.current === currentConversation.id) {
        setPrompt('')
        setImages([])
        setMaskDataUrl(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片任务创建失败')
    } finally {
      imagePreparingRef.current = false
      setImagePreparing(false)
    }
  }

  const submitVideo = async (currentConversation: typeof conversation, apiKey: string) => {
    if (videoBusyRef.current) return
    const validation = validateVideoTurn({
      conversation: currentConversation,
      prompt,
      draft: videoDraft,
      images,
    })
    if (validation) {
      toast.error(validation)
      return
    }
    const now = new Date().toISOString()
    const userMessageId = `msg_${crypto.randomUUID()}`
    const assistantMessageId = `msg_${crypto.randomUUID()}`
    const taskId = `video_${crypto.randomUUID()}`
    videoBusyRef.current = true
    setVideoBusy(true)
    try {
      const inputAssets = images.map((draft) =>
        draftToStoredAsset({ draft, conversationId: currentConversation.id, messageId: userMessageId }),
      )
      const request =
        videoDraft.operation === 'extension'
          ? buildVideoExtensionRequest({
              conversation: currentConversation,
              prompt,
              draft: videoDraft,
              turnOptions,
            })
          : buildVideoGenerationRequest({
              conversation: currentConversation,
              prompt,
              draft: videoDraft,
              images,
              turnOptions,
            })
      const userMessage: StoredMessage = {
        id: userMessageId,
        conversationId: currentConversation.id,
        mediaKind: 'video',
        role: 'user',
        status: 'succeeded',
        text: prompt.trim(),
        attachmentAssetIds: inputAssets.map((asset) => asset.id),
        outputAssetIds: [],
        providerState: null,
        optionsSnapshot: turnOptions,
        taskId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      }
      const assistantMessage: StoredMessage = {
        id: assistantMessageId,
        conversationId: currentConversation.id,
        mediaKind: 'video',
        role: 'assistant',
        status: 'pending',
        text: '',
        attachmentAssetIds: [],
        outputAssetIds: [],
        providerState: null,
        optionsSnapshot: turnOptions,
        taskId,
        error: null,
        createdAt: new Date(Date.now() + 1).toISOString(),
        updatedAt: now,
      }
      const task: StoredVideoTask = {
        id: taskId,
        conversationId: currentConversation.id,
        userMessageId,
        assistantMessageId,
        apiFormat: currentConversation.apiFormat as StoredVideoTask['apiFormat'],
        operation:
          videoDraft.operation === 'extension'
            ? 'extension'
            : videoDraft.parentTaskId && currentConversation.apiFormat === 'byteDanceVideo'
              ? 'byteDanceContinuation'
              : 'generation',
        upstreamTaskId: null,
        parentTaskId: videoDraft.parentTaskId,
        baseUrl: currentConversation.baseUrl,
        modelId: currentConversation.modelId,
        prompt: prompt.trim(),
        requestSnapshot: {
          operation: videoDraft.operation,
          prompt: prompt.trim(),
          options: turnOptions,
          videoDraft,
          inputAssetIds: inputAssets.map((asset) => asset.id),
        },
        status: 'submitting',
        previousStatus: null,
        progress: null,
        videoUrl: null,
        lastFrameUrl: null,
        duration: null,
        error: null,
        pollFailures: 0,
        createdAt: now,
        updatedAt: now,
        lastPolledAt: null,
      }
      await createTurn({
        conversation: {
          ...currentConversation,
          title: messages.length === 0 ? titleFromPrompt(prompt || '视频任务') : currentConversation.title,
          updatedAt: now,
        },
        userMessage,
        assistantMessage,
        inputAssets,
        videoTask: task,
      })
      revokeDraftImages(images)
      if (conversationIdRef.current === currentConversation.id) {
        setPrompt('')
        setImages([])
      }
      const response =
        videoDraft.operation === 'extension'
          ? await extendVideo(request as ReturnType<typeof buildVideoExtensionRequest>, apiKey)
          : await createVideo(request as ReturnType<typeof buildVideoGenerationRequest>, apiKey)
      await updateVideoTask(taskId, {
        upstreamTaskId: response.task.taskId,
        status: response.task.status,
        previousStatus: response.task.status,
      })
      await updateMessage(assistantMessageId, { status: 'succeeded' })
      for (const voiceId of videoDraft.voiceIds.split(',').map((item) => item.trim()).filter(Boolean)) {
        addRecentVoiceId(voiceId)
      }
      if (conversationIdRef.current === currentConversation.id) {
        setVideoDraft({ ...defaultVideoDraft })
      }
      toast.success('视频任务已提交')
    } catch (error) {
      const message = error instanceof Error ? error.message : '视频任务提交失败'
      const code = error instanceof ApiClientError ? error.code : 'videoRequestFailed'
      await updateVideoTask(taskId, { status: 'failed', error: { code, message } })
      await updateMessage(assistantMessageId, { status: 'failed', error: { code, message } })
      toast.error(message)
    } finally {
      videoBusyRef.current = false
      setVideoBusy(false)
    }
  }

  const setActiveImage = async (asset: StoredMediaAsset) => {
    await updateConversation(conversation.id, { activeImageAssetId: asset.id })
    setMaskDataUrl(null)
    toast.success('已设为下一轮编辑基图')
  }

  const openMaskForAsset = (asset: StoredMediaAsset) => {
    if (!asset.blob || !asset.width || !asset.height) return
    if (maskSource?.ownedUrl) URL.revokeObjectURL(maskSource.url)
    setMaskSource({
      url: URL.createObjectURL(asset.blob),
      width: asset.width,
      height: asset.height,
      ownedUrl: true,
    })
    void updateConversation(conversation.id, { activeImageAssetId: asset.id })
  }

  const openCurrentMask = async () => {
    if (conversation.activeImageAssetId && images.length === 0) {
      const assets = await getAssets([conversation.activeImageAssetId])
      const asset = assets[0]
      if (asset) openMaskForAsset(asset)
      return
    }
    const draft = images[0]
    if (!conversation.activeImageAssetId && images.length === 1 && draft?.kind === 'file') {
      setMaskSource({
        url: draft.previewUrl,
        width: draft.width,
        height: draft.height,
        ownedUrl: false,
      })
    }
  }

  const continueVideo = (task: StoredVideoTask) => {
    if (task.apiFormat === 'byteDanceVideo' && task.lastFrameUrl) {
      setVideoDraft({
        ...defaultVideoDraft,
        byteMode: 'firstFrameToVideo',
        firstFrameUrl: task.lastFrameUrl,
        parentTaskId: task.id,
      })
      setParametersOpen(true)
      return
    }
    if (task.apiFormat === 'xaiVideo' && task.videoUrl) {
      setVideoDraft({
        ...defaultVideoDraft,
        operation: 'extension',
        extensionVideoUrl: task.videoUrl,
        parentTaskId: task.id,
      })
      setParametersOpen(true)
    }
  }

  const canOpenMask = hasSingleMaskSource(conversation, images) &&
    (Boolean(conversation.activeImageAssetId) || images[0]?.kind === 'file')
  const openAIImageEditing =
    conversation.apiFormat === 'openaiImage' &&
    (Boolean(conversation.activeImageAssetId) || images.length > 0 || Boolean(maskDataUrl))

  return (
    <div className="chat-workspace">
      <header className="workspace-header">
        <Button size="icon" variant="ghost" className="lg:hidden" icon={<Menu className="size-5" />} aria-label="打开侧边栏" onClick={onOpenSidebar} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{conversation.title}</h1>
          <p className="truncate text-xs text-[var(--ds-text-caption)]">{apiFormatLabels[conversation.apiFormat]} · {conversation.modelId}</p>
        </div>
        <span className="key-status"><Badge tone={key ? 'success' : 'warning'}>{key ? 'Key 已就绪' : '缺少 Key'}</Badge></span>
        <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="size-4" />} onClick={() => setParametersOpen(true)}>参数</Button>
      </header>

      <div className="message-region">
      <div ref={scrollRef} className="message-scroll ds-scroll" aria-label="对话消息">
        <div ref={contentRef}>
        <MessageList
          conversation={conversation}
          messages={messages}
          onSetActiveImage={(asset) => void setActiveImage(asset)}
          onMaskImage={openMaskForAsset}
          onContinueVideo={continueVideo}
        />
        </div>
      </div>
      {!atBottom ? <Button className="jump-to-latest" variant="secondary" size="sm" icon={<ArrowDown className="size-4" />} onClick={scrollToBottom}>回到最新消息</Button> : null}
      </div>

      <ChatComposer
        key={conversation.id}
        canStop={Boolean(activeImageTask)}
        conversation={conversation}
        prompt={prompt}
        images={images}
        videoDraft={videoDraft}
        busy={busy}
        maskReady={Boolean(maskDataUrl)}
        canOpenMask={canOpenMask}
        onPrompt={setPrompt}
        onImages={(next) => {
          setImages(next)
          setMaskDataUrl(null)
        }}
        onSubmit={submit}
        onStop={() => activeImageTask && cancelImageTask(activeImageTask.id)}
        onParameters={() => setParametersOpen(true)}
        onOpenMask={() => void openCurrentMask()}
      />

      <ParametersDialog
        open={parametersOpen}
        conversation={conversation}
        options={turnOptions}
        videoDraft={videoDraft}
        modelCapabilities={capabilities}
        openAIImageEditing={openAIImageEditing}
        onOpenChange={setParametersOpen}
        onOption={setOption}
        onVideoDraft={(patch) => setVideoDraft((current) => ({ ...current, ...patch }))}
      />

      {maskSource ? (
        <MaskEditor
          open
          imageUrl={maskSource.url}
          width={maskSource.width}
          height={maskSource.height}
          onOpenChange={(open) => {
            if (open) return
            if (maskSource.ownedUrl) URL.revokeObjectURL(maskSource.url)
            setMaskSource(null)
          }}
          onConfirm={setMaskDataUrl}
        />
      ) : null}
    </div>
  )
}

function revokeDraftImages(images: DraftImage[]): void {
  for (const image of images) if (image.kind === 'file') URL.revokeObjectURL(image.previewUrl)
}

function hasSingleMaskSource(
  conversation: { activeImageAssetId: string | null },
  images: DraftImage[],
): boolean {
  return conversation.activeImageAssetId ? images.length === 0 : images.length === 1
}

function titleFromPrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, ' ')
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized || '新对话'
}
