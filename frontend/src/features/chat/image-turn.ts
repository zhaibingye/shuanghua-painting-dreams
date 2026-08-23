import type { components } from '../../api/generated/schema'
import type { ImageConversationTurnRequest } from '../../api/client'
import {
  getAssets,
  type MessageProviderState,
  type StoredConversation,
  type StoredMediaAsset,
  type StoredMessage,
} from '../../storage/db'
import { fileToDataUrl } from '../../workers/image-worker-client'

export type DraftImage =
  | {
      id: string
      kind: 'file'
      file: File
      previewUrl: string
      dataUrl: string
      width: number
      height: number
    }
  | {
      id: string
      kind: 'url'
      url: string
    }

type ApiImageAsset =
  | components['schemas']['DataUrlImageAsset']
  | components['schemas']['UrlImageAsset']

export async function buildImageTurnRequest(options: {
  conversation: StoredConversation
  previousMessages: StoredMessage[]
  prompt: string
  draftImages: DraftImage[]
  turnOptions: Record<string, unknown>
  maskDataUrl: string | null
}): Promise<ImageConversationTurnRequest> {
  const { conversation } = options
  const connection = {
    baseUrl: conversation.baseUrl,
    modelId: conversation.modelId,
  }
  const currentImages = options.draftImages.map(draftToApiAsset)

  if (conversation.apiFormat === 'openaiImage') {
    const active = conversation.activeImageAssetId
      ? await getApiAsset(conversation.activeImageAssetId)
      : null
    const sourceImages = active ? [active, ...currentImages] : currentImages
    return {
      apiFormat: 'openaiImage',
      ...connection,
      prompt: options.prompt,
      sourceImages,
      mask: options.maskDataUrl
        ? { kind: 'dataUrl', dataUrl: options.maskDataUrl, filename: 'mask.png' }
        : null,
      options: openAIImageOptions(options.turnOptions),
    }
  }

  if (conversation.apiFormat === 'openaiResponsesImage') {
    return {
      apiFormat: 'openaiResponsesImage',
      ...connection,
      prompt: options.prompt,
      history: await buildResponsesHistory(options.previousMessages),
      images: currentImages,
      options: openAIResponsesOptions(options.turnOptions),
    }
  }

  if (conversation.apiFormat === 'googleGeminiImage') {
    return {
      apiFormat: 'googleGeminiImage',
      ...connection,
      prompt: options.prompt,
      history: await buildGeminiHistory(options.previousMessages),
      images: currentImages,
      options: geminiOptions(options.turnOptions),
    }
  }

  return {
    apiFormat: 'xaiImage',
    ...connection,
    prompt: options.prompt,
    sourceImages: conversation.activeImageAssetId
      ? [await requiredApiAsset(conversation.activeImageAssetId), ...currentImages]
      : currentImages,
    options: xaiOptions(options.turnOptions),
  }
}

export function draftToStoredAsset(options: {
  draft: DraftImage
  conversationId: string
  messageId: string
}): StoredMediaAsset {
  const { draft } = options
  return {
    id: `asset_${crypto.randomUUID()}`,
    conversationId: options.conversationId,
    messageId: options.messageId,
    mediaKind: 'image',
    role: 'input',
    blob: draft.kind === 'file' ? draft.file : null,
    url: draft.kind === 'url' ? draft.url : null,
    filename: draft.kind === 'file' ? draft.file.name : null,
    mimeType: draft.kind === 'file' ? draft.file.type : null,
    width: draft.kind === 'file' ? draft.width : null,
    height: draft.kind === 'file' ? draft.height : null,
    revisedPrompt: null,
    thought: false,
    createdAt: new Date().toISOString(),
  }
}

export async function storedAssetToDataUrl(asset: StoredMediaAsset): Promise<string> {
  if (!asset.blob) throw new Error('本地图片资源缺少 Blob 数据。')
  const file = new File(
    [asset.blob],
    asset.filename ?? `image.${asset.mimeType?.split('/')[1] ?? 'png'}`,
    { type: (asset.mimeType ?? asset.blob.type) || 'image/png' },
  )
  return (await fileToDataUrl(file)).dataUrl
}

async function buildResponsesHistory(
  messages: StoredMessage[],
): Promise<components['schemas']['OpenAIResponsesImageTurnRequest']['history']> {
  const history: NonNullable<
    components['schemas']['OpenAIResponsesImageTurnRequest']['history']
  > = []
  for (let index = 0; index < messages.length; index += 2) {
    const user = messages[index]
    const assistant = messages[index + 1]
    if (user?.role !== 'user' || assistant?.status !== 'succeeded') continue
    history.push({
      kind: 'message',
      text: user.text,
      images: await assetsToApi(user.attachmentAssetIds),
    })
    const state = assistant.providerState
    if (state?.type !== 'openaiResponses') continue
    for (const call of state.imageCalls) {
      const asset = await requiredAsset(call.imageId)
      history.push({
        kind: 'imageGenerationCall',
        callId: call.callId,
        status: 'completed',
        image: {
          kind: 'dataUrl',
          dataUrl: await storedAssetToDataUrl(asset),
          filename: asset.filename,
        },
      })
    }
  }
  return history
}

async function buildGeminiHistory(
  messages: StoredMessage[],
): Promise<components['schemas']['GeminiImageTurnRequest']['history']> {
  const history: NonNullable<components['schemas']['GeminiImageTurnRequest']['history']> = []
  for (let index = 0; index < messages.length; index += 2) {
    const user = messages[index]
    const assistant = messages[index + 1]
    if (user?.role !== 'user' || assistant?.status !== 'succeeded') continue
    const userImages = await assetsToApi(user.attachmentAssetIds)
    history.push({
      role: 'user',
      parts: [
        { kind: 'text', text: user.text, thought: false, thoughtSignature: null },
        ...userImages.map((image) => ({
          kind: 'image' as const,
          image,
          thought: false,
          thoughtSignature: null,
        })),
      ],
    })
    const state = assistant.providerState
    if (state?.type !== 'gemini') continue
    history.push({
      role: 'model',
      parts: await Promise.all(
        state.parts.map(async (part) => {
          if (part.kind === 'text') {
            return {
              kind: 'text' as const,
              text: part.text,
              thought: part.thought,
              thoughtSignature: part.thoughtSignature,
            }
          }
          return {
            kind: 'image' as const,
            image: await requiredApiAsset(part.imageId),
            thought: part.thought,
            thoughtSignature: part.thoughtSignature,
          }
        }),
      ),
    })
  }
  return history
}

export function draftToApiAsset(image: DraftImage): ApiImageAsset {
  return image.kind === 'file'
    ? { kind: 'dataUrl', dataUrl: image.dataUrl, filename: image.file.name }
    : { kind: 'url', url: image.url }
}

async function assetsToApi(ids: string[]): Promise<ApiImageAsset[]> {
  const assets = await getAssets(ids)
  return Promise.all(assets.map(assetToApi))
}

async function getApiAsset(id: string): Promise<ApiImageAsset | null> {
  const assets = await getAssets([id])
  const asset = assets[0]
  return asset ? assetToApi(asset) : null
}

async function requiredApiAsset(id: string): Promise<ApiImageAsset> {
  return assetToApi(await requiredAsset(id))
}

async function requiredAsset(id: string): Promise<StoredMediaAsset> {
  const assets = await getAssets([id])
  const asset = assets[0]
  if (!asset) throw new Error('对话上下文中的图片已不存在。')
  return asset
}

async function assetToApi(asset: StoredMediaAsset): Promise<ApiImageAsset> {
  if (asset.url) return { kind: 'url', url: asset.url }
  return {
    kind: 'dataUrl',
    dataUrl: await storedAssetToDataUrl(asset),
    filename: asset.filename,
  }
}

function openAIImageOptions(
  options: Record<string, unknown>,
): components['schemas']['OpenAIImageTurnOptions'] {
  return {
    count: numberOption(options, 'count', 1),
    size: textOption(options, 'size', '1024x1024'),
    quality: enumOption(options, 'quality', ['auto', 'low', 'medium', 'high'], 'auto'),
    outputFormat: enumOption(options, 'outputFormat', ['png', 'jpeg', 'webp'], 'png'),
    outputCompression: numberOption(options, 'outputCompression', 100),
    background: enumOption(
      options,
      'background',
      ['auto', 'opaque', 'transparent'],
      'auto',
    ),
    moderation: enumOption(options, 'moderation', ['auto', 'low'], 'auto'),
    partialImages: numberOption(options, 'partialImages', 2),
    inputFidelity: enumOption(options, 'inputFidelity', ['auto', 'low', 'high'], 'auto'),
  }
}

function openAIResponsesOptions(
  options: Record<string, unknown>,
): components['schemas']['OpenAIResponsesImageOptions'] {
  return {
    size: textOption(options, 'size', 'auto'),
    quality: enumOption(options, 'quality', ['auto', 'low', 'medium', 'high'], 'auto'),
    outputFormat: enumOption(options, 'outputFormat', ['png', 'jpeg', 'webp'], 'png'),
    outputCompression: numberOption(options, 'outputCompression', 100),
    background: enumOption(
      options,
      'background',
      ['auto', 'opaque', 'transparent'],
      'auto',
    ),
    moderation: enumOption(options, 'moderation', ['auto', 'low'], 'auto'),
    inputFidelity: enumOption(options, 'inputFidelity', ['auto', 'low', 'high'], 'auto'),
    partialImages: numberOption(options, 'partialImages', 2),
  }
}

function geminiOptions(
  options: Record<string, unknown>,
): components['schemas']['GeminiImageOptions'] {
  return {
    aspectRatio: textOption(options, 'aspectRatio', '1:1'),
    imageSize: enumOption(options, 'imageSize', ['512', '1K', '2K', '4K'], '1K'),
    responseModalities: enumOption(
      options,
      'responseModalities',
      ['IMAGE', 'TEXT_AND_IMAGE'],
      'IMAGE',
    ),
    thinkingLevel: enumOption(
      options,
      'thinkingLevel',
      ['High', 'Low', 'Off'],
      'High',
    ),
    includeThoughts: booleanOption(options, 'includeThoughts', false),
  }
}

function xaiOptions(
  options: Record<string, unknown>,
): components['schemas']['XAIImageOptions'] {
  return {
    count: numberOption(options, 'count', 1),
    aspectRatio: textOption(options, 'aspectRatio', '1:1'),
    resolution: enumOption(options, 'resolution', ['1k', '2k'], '1k'),
    quality: enumOption(options, 'quality', ['low', 'medium'], 'medium'),
  }
}

function textOption(options: Record<string, unknown>, key: string, fallback: string): string {
  return typeof options[key] === 'string' ? options[key] : fallback
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

export function providerStateFromStream(options: {
  rawState: Record<string, unknown> | null
  imageCalls: {
    callId: string
    imageId: string
    prompt: string | null
  }[]
}): MessageProviderState | null {
  if (options.rawState?.type === 'gemini') {
    return options.rawState as unknown as Extract<MessageProviderState, { type: 'gemini' }>
  }
  if (options.rawState?.type === 'openaiResponses') {
    return {
      type: 'openaiResponses',
      responseId:
        typeof options.rawState.responseId === 'string' ? options.rawState.responseId : null,
      store: false,
      imageCalls: options.imageCalls.map((call) => ({ ...call, status: 'completed' })),
    }
  }
  return null
}
