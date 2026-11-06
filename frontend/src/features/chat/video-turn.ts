import type {
  VideoExtensionRequest,
  VideoGenerationRequest,
} from '../../api/client'
import { parseOptions } from '../../api/options'
import type { StoredConversation } from '../../storage/db'
import { isPublicHttpUrl } from '../../utils/url'
import { draftToApiAsset, type DraftImage } from './image-turn'
import {
  byteDanceVideoDefaults,
  resolveByteDanceVideoCapabilities,
} from './model-capabilities'

export type ByteVideoMode =
  | 'textToVideo'
  | 'firstFrameToVideo'
  | 'firstLastFrameToVideo'
  | 'referenceToVideo'
export type XAIVideoMode = 'textToVideo' | 'firstFrameToVideo' | 'referenceToVideo'

export const byteVideoModeLabels: Record<ByteVideoMode, string> = {
  textToVideo: '文生视频',
  firstFrameToVideo: '首帧生视频',
  firstLastFrameToVideo: '首尾帧生视频',
  referenceToVideo: '参考素材生视频',
}

export type VideoDraft = {
  operation: 'generation' | 'extension'
  parentTaskId: string | null
  byteMode: ByteVideoMode
  xaiMode: XAIVideoMode
  firstFrameUrl: string
  lastFrameUrl: string
  referenceImageUrls: string
  referenceVideoUrl: string
  referenceAudioUrl: string
  extensionVideoUrl: string
  voiceIds: string
}

export const defaultVideoDraft: VideoDraft = {
  operation: 'generation',
  parentTaskId: null,
  byteMode: 'textToVideo',
  xaiMode: 'textToVideo',
  firstFrameUrl: '',
  lastFrameUrl: '',
  referenceImageUrls: '',
  referenceVideoUrl: '',
  referenceAudioUrl: '',
  extensionVideoUrl: '',
  voiceIds: '',
}

export function validateVideoTurn(options: {
  conversation: StoredConversation
  prompt: string
  draft: VideoDraft
  images: DraftImage[]
}): string | null {
  const { conversation, prompt, draft, images } = options
  if (draft.operation === 'extension') {
    if (!prompt.trim()) return '视频续写必须填写提示词。'
    if (!isPublicHttpUrl(draft.extensionVideoUrl.trim())) {
      return '源视频 URL 必须是有效的公网 HTTP/HTTPS 地址。'
    }
    return null
  }

  if (conversation.apiFormat === 'byteDanceVideo') {
    const capabilities = resolveByteDanceVideoCapabilities(conversation.modelId)
    if (!capabilities.modes.includes(draft.byteMode)) return '当前模型不支持所选视频生成模式。'
    if (draft.byteMode === 'textToVideo' && !prompt.trim()) return '文生视频必须填写提示词。'
    if (images.length > byteVideoImageLimit(conversation.modelId, draft)) {
      return '图片附件超过当前模式的可用数量，请移除多余图片或切换模式。'
    }
    const inputs = byteVideoInputs(draft, images)
    if (draft.byteMode === 'firstFrameToVideo' && !inputs.firstFrameUrl) {
      return '首帧生视频必须提供首帧图片。'
    }
    if (
      draft.byteMode === 'firstLastFrameToVideo' &&
      (!inputs.firstFrameUrl || !inputs.lastFrameUrl)
    ) {
      return '首尾帧生视频必须同时提供首帧和尾帧图片。'
    }
    const imageSources = [inputs.firstFrameUrl, inputs.lastFrameUrl, ...inputs.referenceImageUrls].filter((value): value is string => Boolean(value))
    if (imageSources.some((source) => !isByteMediaSource(source, 'image')) ||
      inputs.referenceVideoUrls.some((source) => !isByteMediaSource(source, 'video')) ||
      inputs.referenceAudioUrls.some((source) => !isByteMediaSource(source, 'audio'))) {
      return '素材需要有效的公网 URL、asset:// 素材 ID，图片和音频也可使用 Base64。'
    }
    if (inputs.referenceImageUrls.length > capabilities.maxReferenceImages ||
      inputs.referenceVideoUrls.length > capabilities.maxReferenceVideos ||
      inputs.referenceAudioUrls.length > capabilities.maxReferenceAudios) {
      return `当前模型最多支持 ${capabilities.maxReferenceImages} 张参考图、${capabilities.maxReferenceVideos} 段视频、${capabilities.maxReferenceAudios} 段音频。`
    }
    if (draft.byteMode === 'referenceToVideo') {
      if (!imageSources.length && !inputs.referenceVideoUrls.length && !inputs.referenceAudioUrls.length) {
        return '参考素材生视频至少需要一个素材。'
      }
      if (inputs.referenceAudioUrls.length && !imageSources.length && !inputs.referenceVideoUrls.length && !capabilities.audioOnlyReference) {
        return '当前模型的参考音频需要搭配参考图片或视频。'
      }
    }
    for (const image of images) {
      if (image.kind !== 'file') continue
      if (image.file.size >= 30 * 1024 * 1024) return '视频输入图片必须小于 30MB。'
      if (image.width < 300 || image.height < 300 || image.width > 6000 || image.height > 6000 ||
        image.width / image.height < 0.4 || image.width / image.height > 2.5) {
        return '视频输入图片边长需为 300–6000 像素，宽高比需为 0.4–2.5。'
      }
    }
    return null
  }

  if (draft.xaiMode === 'referenceToVideo' && parseList(draft.voiceIds).length > 3) {
    return '多参考生视频最多支持 3 个音色 ID。'
  }
  const promptRequired = draft.xaiMode !== 'firstFrameToVideo'
  if (promptRequired && !prompt.trim()) return '当前视频模式必须填写提示词。'
  if (draft.xaiMode === 'firstFrameToVideo' && images.length === 0) {
    return '首帧生视频必须提供一张图片。'
  }
  if (
    draft.xaiMode === 'referenceToVideo' &&
    images.length === 0 &&
    parseList(draft.voiceIds).length === 0
  ) {
    return '多参考生视频至少需要一张图片或一个音色 ID。'
  }
  return null
}

export function buildVideoGenerationRequest(options: {
  conversation: StoredConversation
  prompt: string
  draft: VideoDraft
  images: DraftImage[]
  turnOptions: Record<string, unknown>
}): VideoGenerationRequest {
  const { conversation, prompt, draft, images, turnOptions } = options
  if (conversation.apiFormat === 'byteDanceVideo') {
    const byteOptions = parseOptions('byteDanceVideo', {
      ...byteDanceVideoDefaults(conversation.modelId),
      aspectRatio: conversation.modelId.startsWith('doubao-seedance-1-0-') && draft.byteMode === 'textToVideo' ? '16:9' : 'adaptive',
      ...turnOptions,
    })
    const capabilities = resolveByteDanceVideoCapabilities(conversation.modelId)
    const frameMode = draft.byteMode === 'firstFrameToVideo' || draft.byteMode === 'firstLastFrameToVideo'

    const request: VideoGenerationRequest = {
      apiFormat: 'byteDanceVideo',
      baseUrl: conversation.baseUrl,
      modelId: conversation.modelId,
      mode: draft.byteMode,
      prompt: prompt.trim(),
      inputs: byteVideoInputs(draft, images),
      options: {
        ...byteOptions,
        aspectRatio: frameMode && capabilities.frameAspectRatios ? 'adaptive' : byteOptions.aspectRatio,
        omniReferenceTaskType: draft.byteMode === 'referenceToVideo' ? byteOptions.omniReferenceTaskType : 'auto',
      },
    }
    if (new Blob([JSON.stringify(request)]).size > 64 * 1024 * 1024) {
      throw new Error('编码后的请求超过 64MB，请减少图片或音频素材，或改用公网 URL。')
    }
    return request
  }

  const apiImages = images.map(draftToApiAsset)
  return {
    apiFormat: 'xaiVideo',
    baseUrl: conversation.baseUrl,
    modelId: conversation.modelId,
    mode: draft.xaiMode,
    prompt: prompt.trim(),
    inputs: {
      firstFrame: draft.xaiMode === 'firstFrameToVideo' ? apiImages[0] ?? null : null,
      referenceImages: draft.xaiMode === 'referenceToVideo' ? apiImages : [],
      voiceIds:
        draft.xaiMode === 'referenceToVideo' ? parseList(draft.voiceIds) : [],
    },
    options: parseOptions('xaiVideo', turnOptions),
  }
}

export function buildVideoExtensionRequest(options: {
  conversation: StoredConversation
  prompt: string
  draft: VideoDraft
  turnOptions: Record<string, unknown>
}): VideoExtensionRequest {
  return {
    apiFormat: 'xaiVideo',
    baseUrl: options.conversation.baseUrl,
    modelId: options.conversation.modelId,
    prompt: options.prompt.trim(),
    videoUrl: options.draft.extensionVideoUrl.trim(),
    ...parseOptions('xaiVideoExtension', { duration: options.turnOptions.extensionDuration }),
  }
}

function byteVideoInputs(draft: VideoDraft, images: DraftImage[]) {
  const sources = images.map((image) => image.kind === 'file' ? image.dataUrl : image.url)
  const frameMode = draft.byteMode === 'firstFrameToVideo' || draft.byteMode === 'firstLastFrameToVideo'
  const referenceMode = draft.byteMode === 'referenceToVideo'
  return {
    firstFrameUrl: frameMode ? draft.firstFrameUrl.trim() || (sources.shift() ?? null) : null,
    lastFrameUrl: draft.byteMode === 'firstLastFrameToVideo' ? draft.lastFrameUrl.trim() || (sources.shift() ?? null) : null,
    referenceImageUrls: referenceMode ? [...sources, ...parseMediaList(draft.referenceImageUrls)] : [],
    referenceVideoUrls: referenceMode ? parseMediaList(draft.referenceVideoUrl) : [],
    referenceAudioUrls: referenceMode ? parseMediaList(draft.referenceAudioUrl) : [],
  }
}

export function byteVideoImageLimit(modelId: string, draft: VideoDraft): number {
  if (draft.byteMode === 'firstFrameToVideo') return draft.firstFrameUrl.trim() ? 0 : 1
  if (draft.byteMode === 'firstLastFrameToVideo') return 2 - Number(Boolean(draft.firstFrameUrl.trim())) - Number(Boolean(draft.lastFrameUrl.trim()))
  if (draft.byteMode === 'referenceToVideo') return Math.max(0, resolveByteDanceVideoCapabilities(modelId).maxReferenceImages - parseMediaList(draft.referenceImageUrls).length)
  return 0
}

function parseMediaList(value: string): string[] {
  // Data URLs contain a comma, and signed URLs may contain commas too.
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

export function isByteMediaSource(value: string, kind: 'image' | 'audio' | 'video'): boolean {
  if (isPublicHttpUrl(value) || /^asset:\/\/[A-Za-z0-9_-]+$/.test(value)) return true
  const formats = kind === 'image' ? 'jpeg|png|webp|bmp|tiff|gif|heic|heif' : 'wav|mp3|mpeg'
  return kind !== 'video' && new RegExp(`^data:${kind}/(?:${formats});base64,[A-Za-z0-9+/=\\r\\n]+$`).test(value)
}

export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}
