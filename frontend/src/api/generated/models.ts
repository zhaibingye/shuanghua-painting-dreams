/* Generated from backend/openapi.json. Run npm run api:generate to update. */

/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ApiFormat".
 */
export type ApiFormat =
  | 'googleGeminiImage'
  | 'openaiImage'
  | 'openaiResponsesImage'
  | 'xaiImage'
  | 'byteDanceImage'
  | 'byteDanceVideo'
  | 'xaiVideo'
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "TaskOperation".
 */
export type TaskOperation = 'generation' | 'extension'
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "TaskStatus".
 */
export type TaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'cancelled'
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "MediaKind".
 */
export type MediaKind = 'image' | 'video'

export interface ApiModels {
  [k: string]: unknown
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceImageEditRequest".
 */
export interface ByteDanceImageEditRequest {
  apiFormat: 'byteDanceImage'
  baseUrl: string
  modelId: string
  prompt: string
  options?: ByteDanceImageOptions
  /**
   * @minItems 1
   * @maxItems 14
   */
  images: (DataUrlImageAsset | UrlImageAsset)[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceImageOptions".
 */
export interface ByteDanceImageOptions {
  /**
   * 分辨率档位或 WIDTHxHEIGHT，取值范围取决于 Seedream 模型。
   */
  size?: string
  watermark?: boolean
  /**
   * 5.0 pro / flash 不支持组图。
   */
  sequentialImageGeneration?: 'disabled' | 'auto'
  /**
   * 组图模式下生效；参考图与输出图合计不超过 15 张。
   */
  maxImages?: number
  /**
   * 仅 Seedream 5.0 支持选择输出格式。
   */
  outputFormat?: 'jpeg' | 'png'
  /**
   * fast 仅支持 4.0 / 5.0 pro。
   */
  optimizePromptMode?: 'standard' | 'fast'
  /**
   * 仅 Seedream 5.0 lite 支持。
   */
  webSearch?: boolean
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "DataUrlImageAsset".
 */
export interface DataUrlImageAsset {
  kind?: 'dataUrl'
  dataUrl: string
  filename?: string | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "UrlImageAsset".
 */
export interface UrlImageAsset {
  kind?: 'url'
  url: string
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceImageGenerationRequest".
 */
export interface ByteDanceImageGenerationRequest {
  apiFormat: 'byteDanceImage'
  baseUrl: string
  modelId: string
  prompt: string
  options?: ByteDanceImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceImageTurnRequest".
 */
export interface ByteDanceImageTurnRequest {
  apiFormat: 'byteDanceImage'
  baseUrl: string
  modelId: string
  prompt: string
  options?: ByteDanceImageOptions
  /**
   * @maxItems 14
   */
  sourceImages?: (DataUrlImageAsset | UrlImageAsset)[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceVideoGenerationRequest".
 */
export interface ByteDanceVideoGenerationRequest {
  apiFormat: 'byteDanceVideo'
  baseUrl: string
  modelId: string
  mode: 'textToVideo' | 'firstFrameToVideo' | 'firstLastFrameToVideo' | 'referenceToVideo'
  prompt?: string
  inputs?: ByteDanceVideoInputs
  options?: ByteDanceVideoOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceVideoInputs".
 */
export interface ByteDanceVideoInputs {
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  /**
   * @maxItems 30
   */
  referenceImageUrls?: string[]
  referenceVideoUrl?: string | null
  referenceAudioUrl?: string | null
  /**
   * @maxItems 10
   */
  referenceVideoUrls?: string[]
  /**
   * @maxItems 10
   */
  referenceAudioUrls?: string[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ByteDanceVideoOptions".
 */
export interface ByteDanceVideoOptions {
  duration?: number
  resolution?: '480p' | '720p' | '1080p' | '4k'
  aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9' | 'adaptive'
  generateAudio?: boolean
  watermark?: boolean
  seed?: number
  returnLastFrame?: boolean
  cameraFixed?: boolean
  serviceTier?: 'default' | 'flex'
  webSearch?: boolean
  omniReferenceTaskType?: 'auto' | 'reference' | 'edit' | 'extend'
  outputFormat?: 'mp4' | 'mov'
  priority?: number
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "CreatedVideoTaskResponse".
 */
export interface CreatedVideoTaskResponse {
  taskId: string
  apiFormat: ApiFormat
  operation: TaskOperation
  status: TaskStatus
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiConversationContent".
 */
export interface GeminiConversationContent {
  role: 'user' | 'model'
  /**
   * @minItems 1
   * @maxItems 128
   */
  parts: (GeminiTextPart | GeminiImagePart)[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiTextPart".
 */
export interface GeminiTextPart {
  kind?: 'text'
  text: string
  thought?: boolean
  thoughtSignature?: string | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiImagePart".
 */
export interface GeminiImagePart {
  kind?: 'image'
  image: DataUrlImageAsset | UrlImageAsset
  thought?: boolean
  thoughtSignature?: string | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiImageEditRequest".
 */
export interface GeminiImageEditRequest {
  apiFormat: 'googleGeminiImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @minItems 1
   * @maxItems 14
   */
  images: (DataUrlImageAsset | UrlImageAsset)[]
  options?: GeminiImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiImageOptions".
 */
export interface GeminiImageOptions {
  aspectRatio?:
    '1:1' | '1:4' | '4:1' | '1:8' | '8:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'
  imageSize?: '512' | '1K' | '2K' | '4K'
  responseModalities?: 'IMAGE' | 'TEXT_AND_IMAGE'
  /**
   * 思考等级是否可用取决于模型。
   */
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'
  includeThoughts?: boolean
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiImageGenerationRequest".
 */
export interface GeminiImageGenerationRequest {
  apiFormat: 'googleGeminiImage'
  baseUrl: string
  modelId: string
  prompt: string
  options?: GeminiImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeminiImageTurnRequest".
 */
export interface GeminiImageTurnRequest {
  apiFormat: 'googleGeminiImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @maxItems 256
   */
  history?: GeminiConversationContent[]
  /**
   * @maxItems 14
   */
  images?: (DataUrlImageAsset | UrlImageAsset)[]
  options?: GeminiImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "GeneratedImageResponse".
 */
export interface GeneratedImageResponse {
  id: string
  mimeType: string
  base64Data: string
  revisedPrompt?: string | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "HTTPValidationError".
 */
export interface HTTPValidationError {
  detail?: ValidationError[]
  [k: string]: unknown
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ValidationError".
 */
export interface ValidationError {
  loc: (string | number)[]
  msg: string
  type: string
  input?: unknown
  ctx?: {
    [k: string]: unknown
  }
  [k: string]: unknown
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "HealthResponse".
 */
export interface HealthResponse {
  status: string
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ImageOperationResponse".
 */
export interface ImageOperationResponse {
  requestId: string
  images: GeneratedImageResponse[]
  textOutputs?: string[]
  usage?: UsageResponse | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "UsageResponse".
 */
export interface UsageResponse {
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  costInUsdTicks?: number | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIImageEditOptions".
 */
export interface OpenAIImageEditOptions {
  /**
   * auto 或 WIDTHxHEIGHT
   */
  size?: string
  /**
   * xhigh / max 需要 GPT Image 2.5 / 2.6。
   */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /**
   * SVG / GIF 仅支持 GPT Image 2.6 文生图，生成期间不提供渐进预览。
   */
  outputFormat?: 'png' | 'jpeg' | 'webp' | 'svg' | 'gif'
  outputCompression?: number
  background?: 'auto' | 'opaque' | 'transparent'
  /**
   * 最多 128 字符；请使用用户标识的哈希值。
   */
  safetyIdentifier?: string | null
  count?: number
  /**
   * GPT Image 2.6 的构图规划量，独立于质量；auto 使用模型默认值 high。
   */
  complexity?: 'auto' | 'low' | 'medium' | 'high'
  /**
   * 仅在上游已开通 SVG 模型选择时填写；留空使用上游默认配置。
   */
  svgModel?: string
  /**
   * 独立于图像复杂度；可用档位取决于所选编写模型，auto 使用其默认值。
   */
  svgReasoningEffort?: 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  frameCount?: number
  /**
   * 仅 GIF 生效；上游按 10 毫秒取整。
   */
  frameDurationMs?: number
  moderation?: 'auto' | 'low'
  partialImages?: number
  /**
   * auto 表示不发送该参数；GPT Image 2 请使用 auto。
   */
  inputFidelity?: 'auto' | 'low' | 'high'
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIImageEditRequest".
 */
export interface OpenAIImageEditRequest {
  apiFormat: 'openaiImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @minItems 1
   * @maxItems 16
   */
  images: (DataUrlImageAsset | UrlImageAsset)[]
  mask?: DataUrlImageAsset | null
  /**
   * 与第一张输入图同尺寸的透明 PNG 标注层；不可与 mask 同时使用。
   */
  markup?: DataUrlImageAsset | null
  options?: OpenAIImageEditOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIImageGenerationRequest".
 */
export interface OpenAIImageGenerationRequest {
  apiFormat: 'openaiImage'
  baseUrl: string
  modelId: string
  prompt: string
  options?: OpenAIImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIImageOptions".
 */
export interface OpenAIImageOptions {
  /**
   * auto 或 WIDTHxHEIGHT
   */
  size?: string
  /**
   * xhigh / max 需要 GPT Image 2.5 / 2.6。
   */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /**
   * SVG / GIF 仅支持 GPT Image 2.6 文生图，生成期间不提供渐进预览。
   */
  outputFormat?: 'png' | 'jpeg' | 'webp' | 'svg' | 'gif'
  outputCompression?: number
  background?: 'auto' | 'opaque' | 'transparent'
  /**
   * 最多 128 字符；请使用用户标识的哈希值。
   */
  safetyIdentifier?: string | null
  count?: number
  /**
   * GPT Image 2.6 的构图规划量，独立于质量；auto 使用模型默认值 high。
   */
  complexity?: 'auto' | 'low' | 'medium' | 'high'
  /**
   * 仅在上游已开通 SVG 模型选择时填写；留空使用上游默认配置。
   */
  svgModel?: string
  /**
   * 独立于图像复杂度；可用档位取决于所选编写模型，auto 使用其默认值。
   */
  svgReasoningEffort?: 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  frameCount?: number
  /**
   * 仅 GIF 生效；上游按 10 毫秒取整。
   */
  frameDurationMs?: number
  moderation?: 'auto' | 'low'
  partialImages?: number
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIImageTurnOptions".
 */
export interface OpenAIImageTurnOptions {
  /**
   * auto 或 WIDTHxHEIGHT
   */
  size?: string
  /**
   * xhigh / max 需要 GPT Image 2.5 / 2.6。
   */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /**
   * SVG / GIF 仅支持 GPT Image 2.6 文生图，生成期间不提供渐进预览。
   */
  outputFormat?: 'png' | 'jpeg' | 'webp' | 'svg' | 'gif'
  outputCompression?: number
  background?: 'auto' | 'opaque' | 'transparent'
  /**
   * 最多 128 字符；请使用用户标识的哈希值。
   */
  safetyIdentifier?: string | null
  count?: number
  /**
   * GPT Image 2.6 的构图规划量，独立于质量；auto 使用模型默认值 high。
   */
  complexity?: 'auto' | 'low' | 'medium' | 'high'
  /**
   * 仅在上游已开通 SVG 模型选择时填写；留空使用上游默认配置。
   */
  svgModel?: string
  /**
   * 独立于图像复杂度；可用档位取决于所选编写模型，auto 使用其默认值。
   */
  svgReasoningEffort?: 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  frameCount?: number
  /**
   * 仅 GIF 生效；上游按 10 毫秒取整。
   */
  frameDurationMs?: number
  moderation?: 'auto' | 'low'
  partialImages?: number
  /**
   * auto 表示不发送该参数；GPT Image 2 请使用 auto。
   */
  inputFidelity?: 'auto' | 'low' | 'high'
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIImageTurnRequest".
 */
export interface OpenAIImageTurnRequest {
  apiFormat: 'openaiImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @maxItems 16
   */
  sourceImages?: (DataUrlImageAsset | UrlImageAsset)[]
  mask?: DataUrlImageAsset | null
  /**
   * 与第一张输入图同尺寸的透明 PNG 标注层；不可与 mask 同时使用。
   */
  markup?: DataUrlImageAsset | null
  options?: OpenAIImageTurnOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIResponsesImageCallHistoryItem".
 */
export interface OpenAIResponsesImageCallHistoryItem {
  kind?: 'imageGenerationCall'
  callId: string
  status?: 'completed'
  image: DataUrlImageAsset
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIResponsesImageOptions".
 */
export interface OpenAIResponsesImageOptions {
  size?: string
  /**
   * xhigh / max 需要 GPT Image 2.5 / 2.6。
   */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  outputFormat?: 'png' | 'jpeg' | 'webp'
  outputCompression?: number
  background?: 'auto' | 'opaque' | 'transparent'
  /**
   * 最多 128 字符；请使用用户标识的哈希值。
   */
  safetyIdentifier?: string | null
  /**
   * auto 使用上游默认值，也可填写 gpt-image-2 等生图模型 ID。
   */
  imageModel?: string
  action?: 'auto' | 'generate' | 'edit'
  moderation?: 'auto' | 'low'
  inputFidelity?: 'auto' | 'low' | 'high'
  partialImages?: number
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIResponsesImageTurnRequest".
 */
export interface OpenAIResponsesImageTurnRequest {
  apiFormat: 'openaiResponsesImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @maxItems 256
   */
  history?: (OpenAIResponsesMessageHistoryItem | OpenAIResponsesImageCallHistoryItem)[]
  /**
   * @maxItems 16
   */
  images?: (DataUrlImageAsset | UrlImageAsset)[]
  options?: OpenAIResponsesImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "OpenAIResponsesMessageHistoryItem".
 */
export interface OpenAIResponsesMessageHistoryItem {
  kind?: 'message'
  text: string
  /**
   * @maxItems 16
   */
  images?: (DataUrlImageAsset | UrlImageAsset)[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ProviderMetadata".
 */
export interface ProviderMetadata {
  apiFormat: ApiFormat
  mediaKind: MediaKind
  displayName: string
  defaultBaseUrl: string
  defaultModelId: string
  genericCapabilities: {
    [k: string]: unknown
  }
  knownModels?: {
    [k: string]: {
      [k: string]: unknown
    }
  }
  defaultOptions: {
    [k: string]: unknown
  }
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ProviderMetadataResponse".
 */
export interface ProviderMetadataResponse {
  schemaVersion: number
  providers: ProviderMetadata[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "ReadyResponse".
 */
export interface ReadyResponse {
  status: string
  version: string
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "VideoCreationResponse".
 */
export interface VideoCreationResponse {
  requestId: string
  task: CreatedVideoTaskResponse
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "VideoOutputResponse".
 */
export interface VideoOutputResponse {
  videoUrl: string
  lastFrameUrl?: string | null
  duration?: number | null
  respectModeration?: boolean | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "VideoTaskErrorResponse".
 */
export interface VideoTaskErrorResponse {
  code: string
  message: string
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "VideoTaskResponse".
 */
export interface VideoTaskResponse {
  taskId: string
  apiFormat: ApiFormat
  status: TaskStatus
  progress?: number | null
  modelId?: string | null
  output?: VideoOutputResponse | null
  usage?: UsageResponse | null
  error?: VideoTaskErrorResponse | null
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "VideoTaskStatusRequest".
 */
export interface VideoTaskStatusRequest {
  apiFormat: 'byteDanceVideo' | 'xaiVideo'
  baseUrl: string
  taskId: string
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "VideoTaskStatusResponse".
 */
export interface VideoTaskStatusResponse {
  requestId: string
  task: VideoTaskResponse
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIImageEditRequest".
 */
export interface XAIImageEditRequest {
  apiFormat: 'xaiImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @minItems 1
   * @maxItems 3
   */
  images: (DataUrlImageAsset | UrlImageAsset)[]
  options?: XAIImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIImageOptions".
 */
export interface XAIImageOptions {
  count?: number
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '2:1' | '1:2' | 'auto'
  resolution?: '1k' | '2k'
  quality?: 'low' | 'medium'
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIImageGenerationRequest".
 */
export interface XAIImageGenerationRequest {
  apiFormat: 'xaiImage'
  baseUrl: string
  modelId: string
  prompt: string
  options?: XAIImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIImageTurnRequest".
 */
export interface XAIImageTurnRequest {
  apiFormat: 'xaiImage'
  baseUrl: string
  modelId: string
  prompt: string
  /**
   * @maxItems 3
   */
  sourceImages?: (DataUrlImageAsset | UrlImageAsset)[]
  options?: XAIImageOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIVideoExtensionRequest".
 */
export interface XAIVideoExtensionRequest {
  duration?: number
  apiFormat: 'xaiVideo'
  baseUrl: string
  modelId: string
  prompt: string
  videoUrl: string
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIVideoGenerationRequest".
 */
export interface XAIVideoGenerationRequest {
  apiFormat: 'xaiVideo'
  baseUrl: string
  modelId: string
  mode: 'textToVideo' | 'firstFrameToVideo' | 'referenceToVideo'
  prompt?: string
  inputs?: XAIVideoInputs
  options?: XAIVideoOptions
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIVideoInputs".
 */
export interface XAIVideoInputs {
  firstFrame?: (DataUrlImageAsset | UrlImageAsset) | null
  /**
   * @maxItems 8
   */
  referenceImages?: (DataUrlImageAsset | UrlImageAsset)[]
  /**
   * @maxItems 3
   */
  voiceIds?: string[]
}
/**
 * This interface was referenced by `ApiModels`'s JSON-Schema
 * via the `definition` "XAIVideoOptions".
 */
export interface XAIVideoOptions {
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3'
}
