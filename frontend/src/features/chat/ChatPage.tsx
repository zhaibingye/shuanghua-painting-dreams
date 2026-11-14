import { nanoid } from 'nanoid'
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
import { Select } from '../../components/ui/Field'
import { Spinner } from '../../components/ui/Spinner'
import { useChatScroll } from '../../hooks/use-chat-scroll'
import { useConversation, useMessages } from '../../hooks/use-history'
import {
  createTurn,
  finishVideoSubmission,
  getAssets,
  updateConversation,
  type StoredConversation,
  type StoredMediaAsset,
  type StoredMessage,
  type StoredVideoTask,
} from '../../storage/db'
import { apiFormatLabels, effectiveKey, optionsForFormat, type ApiFormat } from '../../storage/settings'
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
import { geminiImageCapabilities, normalizeByteDanceOptions, normalizeSeedreamImageOptions } from './model-capabilities'
import {
  openAIResponsesImageModel,
  openAIImageSizeError,
  openAIImageCapabilities,
  normalizeOpenAIImageOptions,
} from './openai-image-options'
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
  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<DraftImage[]>([])
  const imagesRef = useRef(images)
  const conversationIdRef = useRef(conversationId)
  const [optionDraft, setOptionDraft] = useState<{
    conversationId: string
    values: Record<string, unknown>
  } | null>(null)
  const [videoDraft, setVideoDraft] = useState<VideoDraft>(defaultVideoDraft)
  const [parametersOpen, setParametersOpen] = useState(false)
  const [imagePreparing, setImagePreparing] = useState(false)
  const imagePreparingRef = useRef(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const videoBusyRef = useRef(false)
  const [imageOverlay, setImageOverlay] = useState<{ kind: 'mask' | 'markup'; dataUrl: string } | null>(null)
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
    setPrompt('')
    setVideoDraft({ ...defaultVideoDraft })
    setImageOverlay(null)
    setMaskSource(null)
    setParametersOpen(false)
    setImages((current) => {
      revokeDraftImages(current)
      return []
    })
  }, [currentApiFormat, currentConversationId])

  useEffect(() => {
    if (!currentConversationId || !currentApiFormat || !currentModelId) return
    const defaults = optionsForFormat(useSettingsStore.getState().settings, currentApiFormat)
    setOptionDraft((current) => ({
      conversationId: currentConversationId,
      values: normalizeModelOptions(
        currentApiFormat,
        currentModelId,
        current?.conversationId === currentConversationId ? current.values : defaults,
      ),
    }))
    if (currentApiFormat === 'openaiImage' && !openAIImageCapabilities(currentModelId).markupEditing) {
      setImageOverlay((current) => current?.kind === 'markup' ? null : current)
    }
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

  if (loading) {
    return <div className="grid h-full place-items-center"><Spinner label="正在加载对话" /></div>
  }
  if (!conversation) {
    return <div className="grid h-full place-items-center px-6 text-center"><div><h1 className="text-xl font-semibold">对话不存在</h1><p className="mt-2 text-sm text-[var(--ds-text-secondary)]">它可能已被删除，请从侧边栏创建新对话。</p></div></div>
  }

  const key = effectiveKey(settings, conversation.apiFormat)
  const turnOptions = optionDraft?.conversationId === conversation.id
    ? optionDraft.values
    : normalizeModelOptions(conversation.apiFormat, conversation.modelId, optionsForFormat(settings, conversation.apiFormat))
  const busy =
    conversation.mediaKind === 'image'
      ? imagePreparing || activeImageTask !== null
      : videoBusy
  const splitLayers = conversation.apiFormat === 'byteDanceImage' && turnOptions.layerDecomposition === true
  const setOption = (name: string, value: unknown) => {
    const changed = { ...turnOptions, [name]: value }
    if (conversation.apiFormat === 'byteDanceImage' && changed.background === 'transparent' && changed.outputFormat === 'jpeg') {
      changed.outputFormat = 'png'
    }
    if (conversation.apiFormat === 'openaiImage' && name === 'outputFormat' && value === 'gif') {
      changed.size = 'auto'
      if (changed.background === 'transparent') changed.background = 'auto'
    }
    const next = conversation.apiFormat === 'openaiImage'
      ? normalizeOpenAIImageOptions(changed, conversation.modelId)
      : conversation.apiFormat === 'byteDanceImage' && name === 'layerDecomposition'
        ? normalizeSeedreamImageOptions({ ...changed, size: value === true ? 'auto' : '2K' }, conversation.modelId)
        : changed
    setOptionDraft({ conversationId: conversation.id, values: next })
    updateFormat(conversation.apiFormat, { defaults: next })
  }

  const submit = () => {
    if (busy) return
    if (!key) {
      toast.error('当前 API 格式没有可用的 Key，请先在设置中填写。')
      return
    }
    if (conversation.apiFormat === 'openaiImage' || conversation.apiFormat === 'openaiResponsesImage') {
      const imageModel = conversation.apiFormat === 'openaiImage' ? conversation.modelId : openAIResponsesImageModel(turnOptions)
      const error = openAIImageSizeError(typeof turnOptions.size === 'string' ? turnOptions.size : 'auto', imageModel, typeof turnOptions.outputFormat === 'string' ? turnOptions.outputFormat : 'png')
      if (error) {
        toast.error(error)
        setParametersOpen(true)
        return
      }
    }
    scrollToBottom()
    if (conversation.mediaKind === 'image') void submitImage(conversation, key)
    else void submitVideo(conversation, key)
  }

  const submitImage = async (
    currentConversation: typeof conversation,
    apiKey: string,
  ) => {
    const currentPrompt = prompt.trim()
    if (!currentPrompt && !splitLayers) {
      toast.error('请填写图片生成或编辑指令。')
      return
    }
    if (imageOverlay?.kind === 'mask' && !hasSingleMaskSource(currentConversation, images)) {
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
        previousMessages: messages,
        prompt: currentPrompt,
        draftImages,
        turnOptions,
        maskDataUrl: imageOverlay?.kind === 'mask' ? imageOverlay.dataUrl : null,
        markupDataUrl: imageOverlay?.kind === 'markup' ? imageOverlay.dataUrl : null,
      })
      const taskId = `image_${nanoid()}`
      const turn = prepareTurn(currentConversation, currentPrompt, draftImages, turnOptions, taskId)
      await createTurn({
        ...turn,
        conversationId: currentConversation.id,
        title: { previous: currentConversation.title, initial: titleFromPrompt(currentPrompt || '拆分图层') },
      })

      startImageTask({
        taskId,
        conversationId: currentConversation.id,
        assistantMessageId: turn.assistantMessage.id,
        request,
        apiKey,
      })
      revokeDraftImages(draftImages)
      if (conversationIdRef.current === currentConversation.id) {
        setPrompt('')
        setImages([])
        setImageOverlay(null)
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
    const taskId = `video_${nanoid()}`
    videoBusyRef.current = true
    setVideoBusy(true)
    try {
      const promptText = prompt.trim()
      const requestOptions = {
        conversation: currentConversation,
        prompt: promptText,
        draft: videoDraft,
        turnOptions,
      }
      const submission = videoDraft.operation === 'extension'
        ? { request: buildVideoExtensionRequest(requestOptions), operation: 'extension' as const }
        : { request: buildVideoGenerationRequest({ ...requestOptions, images }), operation: 'generation' as const }
      const turn = prepareTurn(currentConversation, promptText, images, turnOptions, taskId)
      const { userMessage, assistantMessage } = turn
      const task: StoredVideoTask = {
        id: taskId,
        conversationId: currentConversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        apiFormat: submission.request.apiFormat,
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
        prompt: promptText,
        requestSnapshot: {
          operation: videoDraft.operation,
          prompt: promptText,
          options: turnOptions,
          videoDraft,
          inputAssetIds: userMessage.attachmentAssetIds,
        },
        status: 'submitting',
        previousStatus: null,
        progress: null,
        videoUrl: null,
        lastFrameUrl: null,
        duration: null,
        error: null,
        pollFailures: 0,
        createdAt: userMessage.createdAt,
        updatedAt: userMessage.updatedAt,
        lastPolledAt: null,
      }
      await createTurn({
        ...turn,
        conversationId: currentConversation.id,
        title: { previous: currentConversation.title, initial: titleFromPrompt(promptText || '视频任务') },
        videoTask: task,
      })
      revokeDraftImages(images)
      if (conversationIdRef.current === currentConversation.id) {
        setPrompt('')
        setImages([])
      }
      let response
      try {
        response = submission.operation === 'extension'
          ? await extendVideo(submission.request, apiKey)
          : await createVideo(submission.request, apiKey)
      } catch (error) {
        await finishVideoSubmission(taskId, {
          error: {
            code: error instanceof ApiClientError ? error.code : 'videoRequestFailed',
            message: error instanceof Error ? error.message : '视频任务提交失败',
          },
        })
        throw error
      }
      await finishVideoSubmission(taskId, {
        upstreamTaskId: response.task.taskId,
        status: response.task.status,
      })
      for (const voiceId of videoDraft.voiceIds.split(',').map((item) => item.trim()).filter(Boolean)) {
        addRecentVoiceId(voiceId)
      }
      if (conversationIdRef.current === currentConversation.id) {
        setVideoDraft({ ...defaultVideoDraft })
      }
      toast.success('视频任务已提交')
    } catch (error) {
      const message = error instanceof Error ? error.message : '视频任务提交失败'
      toast.error(message)
    } finally {
      videoBusyRef.current = false
      setVideoBusy(false)
    }
  }

  const setActiveImage = async (asset: StoredMediaAsset) => {
    await updateConversation(conversation.id, { activeImageAssetId: conversation.activeImageAssetId === asset.id ? null : asset.id })
    setImageOverlay(null)
    toast.success(conversation.activeImageAssetId === asset.id ? '已取消编辑基图' : '已设为下一轮编辑基图')
  }

  const openMaskForAsset = (asset: StoredMediaAsset) => {
    if (!asset.blob || !asset.width || !asset.height) return
    setImageOverlay(null)
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

  return (
    <div className="chat-workspace">
      <header className="workspace-header">
        <Button size="icon" variant="ghost" className="lg:hidden" icon={<Menu className="size-5" />} aria-label="打开侧边栏" onClick={onOpenSidebar} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{conversation.title}</h1>
          <p className="truncate text-xs text-[var(--ds-text-caption)]">{apiFormatLabels[conversation.apiFormat]} · {conversation.modelId}</p>
        </div>
        <Select aria-label="当前模型" className="workspace-model" value={conversation.modelId} disabled={busy} onChange={(event) => {
          void updateConversation(conversation.id, { modelId: event.target.value }).catch(() => toast.error('模型切换失败'))
        }}>
          {[...new Set([conversation.modelId, ...settings.formats[conversation.apiFormat].models])].map((model) => <option key={model} value={model}>{model}</option>)}
        </Select>
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
        splitLayers={splitLayers}
        videoDraft={videoDraft}
        busy={busy}
        maskReady={imageOverlay?.kind === 'mask'}
        markupReady={imageOverlay?.kind === 'markup'}
        canOpenMask={canOpenMask}
        onPrompt={setPrompt}
        onImages={(next) => {
          setImages(next)
          setImageOverlay(null)
        }}
        onSubmit={submit}
        onStop={() => activeImageTask && cancelImageTask(activeImageTask.id)}
        onParameters={() => setParametersOpen(true)}
        onOpenMask={() => void openCurrentMask()}
        onVideoDraft={(patch) => setVideoDraft((current) => ({ ...current, ...patch }))}
      />

      <ParametersDialog
        open={parametersOpen}
        conversation={conversation}
        options={turnOptions}
        videoDraft={videoDraft}
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
          onOpenChange={(open) => { if (!open) setMaskSource(null) }}
          onConfirm={(dataUrl) => setImageOverlay({ kind: 'mask', dataUrl })}
          onConfirmMarkup={openAIImageCapabilities(conversation.modelId).markupEditing
            ? (dataUrl) => setImageOverlay({ kind: 'markup', dataUrl }) : undefined}
        />
      ) : null}
    </div>
  )
}

function revokeDraftImages(images: DraftImage[]): void {
  for (const image of images) if (image.kind === 'file') URL.revokeObjectURL(image.previewUrl)
}

function normalizeModelOptions(format: ApiFormat, modelId: string, options: Record<string, unknown>) {
  switch (format) {
    case 'byteDanceVideo':
      return normalizeByteDanceOptions(options, modelId)
    case 'openaiImage':
      return normalizeOpenAIImageOptions(options, modelId)
    case 'byteDanceImage':
      return normalizeSeedreamImageOptions(options, modelId)
    case 'googleGeminiImage': {
      const capabilities = geminiImageCapabilities(modelId)
      if (!capabilities) return options
      return {
        ...options,
        imageSize: capabilities.imageSizes.includes(String(options.imageSize)) ? options.imageSize : '1K',
        thinkingLevel: capabilities.thinkingLevels?.includes(String(options.thinkingLevel)) === false
          ? 'MEDIUM' : options.thinkingLevel,
      }
    }
    default:
      return options
  }
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

function prepareTurn(
  conversation: StoredConversation,
  prompt: string,
  images: DraftImage[],
  options: Record<string, unknown>,
  taskId: string,
) {
  const now = Date.now()
  const createdAt = new Date(now).toISOString()
  const userMessageId = `msg_${nanoid()}`
  const inputAssets = images.map((draft) =>
    draftToStoredAsset({ draft, conversationId: conversation.id, messageId: userMessageId }),
  )
  const userMessage: StoredMessage = {
    id: userMessageId,
    conversationId: conversation.id,
    mediaKind: conversation.mediaKind,
    role: 'user',
    status: 'succeeded',
    text: prompt,
    attachmentAssetIds: inputAssets.map((asset) => asset.id),
    outputAssetIds: [],
    providerState: null,
    optionsSnapshot: options,
    taskId: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
  }
  const assistantMessage: StoredMessage = {
    ...userMessage,
    id: `msg_${nanoid()}`,
    role: 'assistant',
    status: 'pending',
    text: '',
    attachmentAssetIds: [],
    taskId,
    createdAt: new Date(now + 1).toISOString(),
  }
  return { userMessage, assistantMessage, inputAssets }
}
