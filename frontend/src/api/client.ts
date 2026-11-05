import type * as schemas from './generated/models'
import { ApiClientError, apiFetch, safeJson, toApiError } from './http'

export { ApiClientError } from './http'

export type ImageOperationResponse = schemas.ImageOperationResponse
export type VideoCreationResponse = schemas.VideoCreationResponse
export type VideoTaskStatusResponse = schemas.VideoTaskStatusResponse

export type ImageGenerationRequest =
  | schemas.GeminiImageGenerationRequest
  | schemas.OpenAIImageGenerationRequest
  | schemas.XAIImageGenerationRequest
  | schemas.ByteDanceImageGenerationRequest

export type ImageEditRequest =
  | schemas.GeminiImageEditRequest
  | schemas.OpenAIImageEditRequest
  | schemas.XAIImageEditRequest
  | schemas.ByteDanceImageEditRequest

export type ImageConversationTurnRequest =
  | schemas.OpenAIImageTurnRequest
  | schemas.OpenAIResponsesImageTurnRequest
  | schemas.GeminiImageTurnRequest
  | schemas.XAIImageTurnRequest
  | schemas.ByteDanceImageTurnRequest

export type VideoGenerationRequest =
  | schemas.ByteDanceVideoGenerationRequest
  | schemas.XAIVideoGenerationRequest

export type VideoExtensionRequest = schemas.XAIVideoExtensionRequest
export type VideoTaskStatusRequest = schemas.VideoTaskStatusRequest

export type StreamedImage = {
  id: string
  mimeType: string
  base64Data: string
  revisedPrompt: string | null
  thought: boolean
  thoughtSignature: string | null
}

export type ImageStreamEvent =
  | {
      type: 'turn.started'
      requestId: string
      apiFormat: string
    }
  | {
      type: 'image.partial'
      index: number
      partialImageIndex: number | null
      mimeType: string
      base64Data: string
      providerMetadata: Record<string, unknown> | null
    }
  | {
      type: 'image.completed'
      index: number
      image: StreamedImage
      providerMetadata: Record<string, unknown> | null
    }
  | {
      type: 'text.delta'
      delta: string
    }
  | {
      type: 'turn.completed'
      requestId: string
      usage: schemas.UsageResponse | null
      providerState: Record<string, unknown> | null
    }
  | {
      type: 'turn.failed'
      error: {
        code: string
        category: string
        message: string
        retryable: boolean
        requestId: string
      }
    }

export async function generateImage(
  request: ImageGenerationRequest,
  apiKey: string,
): Promise<ImageOperationResponse> {
  return apiFetch('/api/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...upstreamHeaders(apiKey) },
    body: JSON.stringify(request),
  })
}

export async function editImage(
  request: ImageEditRequest,
  apiKey: string,
): Promise<ImageOperationResponse> {
  return apiFetch('/api/v1/images/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...upstreamHeaders(apiKey) },
    body: JSON.stringify(request),
  })
}

export async function streamImageConversationTurn(options: {
  request: ImageConversationTurnRequest
  apiKey: string
  signal: AbortSignal
  onEvent: (event: ImageStreamEvent) => void | Promise<void>
}): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/v1/images/conversation-turns/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...upstreamHeaders(options.apiKey),
      },
      body: JSON.stringify(options.request),
      signal: options.signal,
    })
  } catch (error) {
    if (options.signal.aborted) throw error
    throw new ApiClientError({
      message: '无法连接霜华绘梦服务器，请检查网络后重试。',
      code: 'networkError',
      retryable: true,
      status: 0,
    })
  }

  if (!response.ok) {
    const payload = await safeJson(response)
    throw toApiError(payload, response.status)
  }
  if (!response.body) {
    throw new ApiClientError({
      message: '服务器没有返回流式响应体。',
      code: 'missingStreamBody',
      status: 502,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const dispatch = async (block: string): Promise<boolean> => {
    options.signal.throwIfAborted()
    const event = parseSseBlock(block)
    if (!event) return false
    if (event.type === 'turn.failed') {
      throw new ApiClientError({
        message: event.error.message,
        code: event.error.code,
        retryable: event.error.retryable,
        requestId: event.error.requestId,
        status: 200,
      })
    }
    await options.onEvent(event)
    return event.type === 'turn.completed'
  }

  try {
    for (;;) {
      options.signal.throwIfAborted()
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let match = /\r?\n\r?\n/.exec(buffer)
      while (match) {
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (await dispatch(block)) return
        match = /\r?\n\r?\n/.exec(buffer)
      }
      if (done) {
        if (buffer.trim() && await dispatch(buffer)) return
        throw new ApiClientError({
          message: '图片流在收到完成事件前意外结束。',
          code: 'incompleteImageStream',
          retryable: true,
          status: 502,
        })
      }
    }
  } finally {
    // 完成、失败或回调异常后都释放连接，不再等待上游关闭 SSE。
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function createVideo(
  request: VideoGenerationRequest,
  apiKey: string,
): Promise<VideoCreationResponse> {
  return apiFetch('/api/v1/videos/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...upstreamHeaders(apiKey) },
    body: JSON.stringify(request),
  })
}

export async function extendVideo(
  request: VideoExtensionRequest,
  apiKey: string,
): Promise<VideoCreationResponse> {
  return apiFetch('/api/v1/videos/extensions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...upstreamHeaders(apiKey) },
    body: JSON.stringify(request),
  })
}

export async function queryVideoTask(
  request: VideoTaskStatusRequest,
  apiKey: string,
): Promise<VideoTaskStatusResponse> {
  return apiFetch('/api/v1/video-tasks/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...upstreamHeaders(apiKey) },
    body: JSON.stringify(request),
  })
}

function parseSseBlock(block: string): ImageStreamEvent | null {
  let eventName = ''
  const dataLines: string[] = []
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.startsWith(':')) continue
    const [field, ...rest] = rawLine.split(':')
    const value = rest.join(':').trimStart()
    if (field === 'event') eventName = value
    if (field === 'data') dataLines.push(value)
  }
  if (!eventName || dataLines.length === 0) return null
  const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
  return { type: eventName, ...data } as ImageStreamEvent
}

function upstreamHeaders(apiKey: string): Record<string, string> {
  return { 'X-Upstream-API-Key': apiKey }
}
