import { nanoid } from 'nanoid'
import { parseImageOptions } from '../../api/image-options'
import type * as schemas from '../../api/generated/models'
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
  | schemas.DataUrlImageAsset
  | schemas.UrlImageAsset

export async function buildImageTurnRequest(options: {
  conversation: StoredConversation
  previousMessages: StoredMessage[]
  prompt: string
  draftImages: DraftImage[]
  turnOptions: Record<string, unknown>
  maskDataUrl: string | null
  markupDataUrl?: string | null
}): Promise<ImageConversationTurnRequest> {
  const { conversation } = options
  const connection = {
    baseUrl: conversation.baseUrl,
    modelId: conversation.modelId,
  }
  const currentImages = options.draftImages.map(draftToApiAsset)

  if (conversation.apiFormat === 'openaiImage') {
    const active = conversation.activeImageAssetId
      ? await requiredApiAsset(conversation.activeImageAssetId)
      : null
    const sourceImages = active ? [active, ...currentImages] : currentImages
    const parsedOptions = parseImageOptions('openaiImage', options.turnOptions)
    if (['svg', 'gif'].includes(parsedOptions.outputFormat) && sourceImages.length) {
      throw new Error('SVG / GIF 仅支持文生图，请先取消编辑基图并移除参考图。')
    }
    if (parsedOptions.outputFormat === 'svg' && parsedOptions.count !== 1) {
      throw new Error('SVG 输出只能生成一张图片。')
    }
    return {
      apiFormat: 'openaiImage',
      ...connection,
      prompt: options.prompt,
      sourceImages,
      mask: options.maskDataUrl
        ? { kind: 'dataUrl', dataUrl: options.maskDataUrl, filename: 'mask.png' }
        : null,
      markup: options.markupDataUrl
        ? { kind: 'dataUrl', dataUrl: options.markupDataUrl, filename: 'markup.png' }
        : null,
      options: parsedOptions,
    }
  }

  if (conversation.apiFormat === 'openaiResponsesImage') {
    return {
      apiFormat: 'openaiResponsesImage',
      ...connection,
      prompt: options.prompt,
      history: await buildResponsesHistory(options.previousMessages),
      images: currentImages,
      options: parseImageOptions('openaiResponsesImage', options.turnOptions),
    }
  }

  if (conversation.apiFormat === 'googleGeminiImage') {
    return {
      apiFormat: 'googleGeminiImage',
      ...connection,
      prompt: options.prompt,
      history: await buildGeminiHistory(options.previousMessages),
      images: currentImages,
      options: parseImageOptions('googleGeminiImage', options.turnOptions),
    }
  }

  const sourceImages = conversation.activeImageAssetId
    ? [await requiredApiAsset(conversation.activeImageAssetId), ...currentImages]
    : currentImages
  if (conversation.apiFormat === 'xaiImage') return {
    apiFormat: 'xaiImage', ...connection, prompt: options.prompt, sourceImages,
    options: parseImageOptions('xaiImage', options.turnOptions),
  }
  if (conversation.apiFormat === 'byteDanceImage') return {
    apiFormat: 'byteDanceImage', ...connection, prompt: options.prompt, sourceImages,
    options: parseImageOptions('byteDanceImage', options.turnOptions),
  }
  throw new Error('当前对话格式不支持图片生成。')
}

export function draftToStoredAsset(options: {
  draft: DraftImage
  conversationId: string
  messageId: string
}): StoredMediaAsset {
  const { draft } = options
  return {
    id: `asset_${nanoid()}`,
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
): Promise<schemas.OpenAIResponsesImageTurnRequest['history']> {
  const history: NonNullable<
    schemas.OpenAIResponsesImageTurnRequest['history']
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
): Promise<schemas.GeminiImageTurnRequest['history']> {
  const history: NonNullable<schemas.GeminiImageTurnRequest['history']> = []
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
  if (asset.mimeType && !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) {
    throw new Error('编辑基图仅支持 PNG、JPEG 或 WebP；SVG / GIF 结果可预览和下载。')
  }
  if (asset.url) return { kind: 'url', url: asset.url }
  return {
    kind: 'dataUrl',
    dataUrl: await storedAssetToDataUrl(asset),
    filename: asset.filename,
  }
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
