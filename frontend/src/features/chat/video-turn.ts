import type {
  VideoExtensionRequest,
  VideoGenerationRequest,
} from '../../api/client'
import type { StoredConversation } from '../../storage/db'
import { isPublicHttpUrl } from '../../utils/url'
import { draftToApiAsset, type DraftImage } from './image-turn'
import { clampByteDanceResolution, XAI_VIDEO_RESOLUTIONS } from './model-capabilities'

export type ByteVideoMode =
  | 'textToVideo'
  | 'firstFrameToVideo'
  | 'firstLastFrameToVideo'
  | 'referenceToVideo'
export type XAIVideoMode = 'textToVideo' | 'firstFrameToVideo' | 'referenceToVideo'

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
    const promptRequired =
      draft.byteMode === 'textToVideo' || draft.byteMode === 'referenceToVideo'
    if (promptRequired && !prompt.trim()) return '当前视频模式必须填写提示词。'
    if (draft.byteMode === 'firstFrameToVideo' && !draft.firstFrameUrl.trim()) {
      return '首帧生视频必须填写首帧 URL。'
    }
    if (
      draft.byteMode === 'firstLastFrameToVideo' &&
      (!draft.firstFrameUrl.trim() || !draft.lastFrameUrl.trim())
    ) {
      return '首尾帧生视频必须同时填写首帧和尾帧 URL。'
    }
    const mediaUrls = byteMediaUrls(draft)
    if (mediaUrls.some((url) => !isPublicHttpUrl(url))) {
      return '字节视频素材只允许公网 HTTP/HTTPS URL。'
    }
    if (mediaUrls.length + Number(Boolean(prompt.trim())) > 5) {
      return '字节视频的提示词和素材合计最多 5 项。'
    }
    if (draft.byteMode === 'referenceToVideo' && mediaUrls.length === 0) {
      return '参考素材生视频至少需要一个素材 URL。'
    }
    return null
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
    return {
      apiFormat: 'byteDanceVideo',
      baseUrl: conversation.baseUrl,
      modelId: conversation.modelId,
      mode: draft.byteMode,
      prompt: prompt.trim(),
      inputs: {
        firstFrameUrl:
          draft.byteMode === 'firstFrameToVideo' ||
          draft.byteMode === 'firstLastFrameToVideo'
            ? draft.firstFrameUrl.trim() || null
            : null,
        lastFrameUrl:
          draft.byteMode === 'firstLastFrameToVideo'
            ? draft.lastFrameUrl.trim() || null
            : null,
        referenceImageUrls:
          draft.byteMode === 'referenceToVideo'
            ? parseList(draft.referenceImageUrls)
            : [],
        referenceVideoUrl:
          draft.byteMode === 'referenceToVideo'
            ? draft.referenceVideoUrl.trim() || null
            : null,
        referenceAudioUrl:
          draft.byteMode === 'referenceToVideo'
            ? draft.referenceAudioUrl.trim() || null
            : null,
      },
      options: {
        duration: numberOption(turnOptions, 'duration', 5),
        resolution: clampByteDanceResolution(turnOptions.resolution, conversation.modelId),
        aspectRatio: enumOption(
          turnOptions,
          'aspectRatio',
          ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
          'adaptive',
        ),
        generateAudio: booleanOption(turnOptions, 'generateAudio', false),
        watermark: booleanOption(turnOptions, 'watermark', false),
        seed: numberOption(turnOptions, 'seed', -1),
        returnLastFrame: booleanOption(turnOptions, 'returnLastFrame', false),
        cameraFixed: booleanOption(turnOptions, 'cameraFixed', false),
        serviceTier: enumOption(
          turnOptions,
          'serviceTier',
          ['default', 'flex'],
          'default',
        ),
        webSearch: booleanOption(turnOptions, 'webSearch', false),
      },
    }
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
        draft.xaiMode === 'referenceToVideo' ? parseList(draft.voiceIds).slice(0, 3) : [],
    },
    options: {
      duration: numberOption(turnOptions, 'duration', 8),
      resolution: enumOption(
        turnOptions,
        'resolution',
        XAI_VIDEO_RESOLUTIONS,
        '720p',
      ),
      aspectRatio: enumOption(
        turnOptions,
        'aspectRatio',
        ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'],
        '16:9',
      ),
    },
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
    duration: numberOption(options.turnOptions, 'extensionDuration', 6),
  }
}

function byteMediaUrls(draft: VideoDraft): string[] {
  if (draft.byteMode === 'firstFrameToVideo') return [draft.firstFrameUrl.trim()].filter(Boolean)
  if (draft.byteMode === 'firstLastFrameToVideo') {
    return [draft.firstFrameUrl.trim(), draft.lastFrameUrl.trim()].filter(Boolean)
  }
  if (draft.byteMode === 'referenceToVideo') {
    return [
      ...parseList(draft.referenceImageUrls),
      draft.referenceVideoUrl.trim(),
      draft.referenceAudioUrl.trim(),
    ].filter(Boolean)
  }
  return []
}

export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function numberOption(options: Record<string, unknown>, key: string, fallback: number): number {
  const value = options[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function booleanOption(
  options: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof options[key] === 'boolean' ? options[key] : fallback
}

function enumOption<const T extends string>(
  options: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = options[key]
  return typeof value === 'string' && values.includes(value as T) ? (value as T) : fallback
}
