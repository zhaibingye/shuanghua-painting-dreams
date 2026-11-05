export class ApiClientError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly requestId: string | null
  readonly status: number

  constructor(options: {
    message: string
    code?: string
    retryable?: boolean
    requestId?: string | null
    status: number
  }) {
    super(options.message)
    this.name = 'ApiClientError'
    this.code = options.code ?? 'requestFailed'
    this.retryable = options.retryable ?? false
    this.requestId = options.requestId ?? null
    this.status = options.status
  }
}

export async function apiFetch<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(new Request(new URL(url, window.location.origin), options))
  } catch {
    throw new ApiClientError({
      message: '无法连接霜华绘梦服务器，请检查网络后重试。',
      code: 'networkError',
      retryable: true,
      status: 0,
    })
  }
  if (!response.ok) throw toApiError(await safeJson(response), response.status)
  return response.json() as Promise<T>
}

export function toApiError(error: unknown, status: number): ApiClientError {
  if (isErrorEnvelope(error)) {
    return new ApiClientError({
      message: error.error.message,
      code: error.error.code,
      retryable: error.error.retryable,
      requestId: error.error.requestId,
      status,
    })
  }
  return new ApiClientError({ message: '请求失败，请稍后重试。', status })
}

export async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isErrorEnvelope(value: unknown): value is {
  error: { message: string; code: string; retryable: boolean; requestId: string }
} {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = value.error
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'retryable' in error &&
    typeof error.retryable === 'boolean' &&
    'requestId' in error &&
    typeof error.requestId === 'string'
  )
}
