import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateImage, streamImageConversationTurn } from './client'

const request = {
  apiFormat: 'openaiImage' as const,
  baseUrl: 'https://shapi.vip',
  modelId: 'gpt-image-2',
  prompt: 'snow',
}

afterEach(() => vi.unstubAllGlobals())

describe('API client errors', () => {
  it('preserves the normalized backend error and request ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'capabilityNotSupported',
              category: 'capabilityNotSupported',
              message: '当前模型不支持该参数。',
              retryable: false,
              requestId: 'req_test',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = generateImage(request, 'secret-key')
    await expect(result).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'capabilityNotSupported',
      requestId: 'req_test',
      retryable: false,
      status: 422,
    })
  })

  it('sends the upstream key only in the dedicated header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ requestId: 'req_ok', images: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await generateImage(request, 'secret-key')

    const submitted = fetchMock.mock.calls[0]?.[0] as unknown
    expect(submitted).toBeInstanceOf(Request)
    if (!(submitted instanceof Request)) throw new Error('Expected a Request instance')
    expect(submitted.url).toContain('/api/v1/images/generations')
    expect(submitted.headers.get('X-Upstream-API-Key')).toBe('secret-key')
    expect(await submitted.clone().text()).not.toContain('secret-key')
  })

  it('normalizes browser network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(generateImage(request, 'secret-key')).rejects.toMatchObject({
      code: 'networkError',
      message: '无法连接霜华绘梦服务器，请检查网络后重试。',
      retryable: true,
      status: 0,
    })
  })

  it('parses normalized image SSE events and keeps the key in the header', async () => {
    const body = [
      'event: turn.started\ndata: {"requestId":"req_stream","apiFormat":"openaiImage"}\n\n',
      'event: image.partial\ndata: {"index":0,"partialImageIndex":0,"mimeType":"image/png","base64Data":"cGFydGlhbA==","providerMetadata":null}\n\n',
      'event: turn.completed\ndata: {"requestId":"req_stream","usage":null,"providerState":null}\n\n',
    ].join('')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const events: string[] = []

    await streamImageConversationTurn({
      request: {
        apiFormat: 'openaiImage',
        baseUrl: 'https://shapi.vip',
        modelId: 'gpt-image-2',
        prompt: 'snow',
      },
      apiKey: 'stream-secret',
      signal: new AbortController().signal,
      onEvent: (event) => {
        events.push(event.type)
      },
    })

    expect(events).toEqual(['turn.started', 'image.partial', 'turn.completed'])
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).get('X-Upstream-API-Key')).toBe('stream-secret')
    expect(init.body).not.toContain('stream-secret')
  })

  it('rejects an image stream that ends without a terminal event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        'event: turn.started\ndata: {"requestId":"req_stream","apiFormat":"openaiImage"}\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      streamImageConversationTurn({
        request,
        apiKey: 'stream-secret',
        signal: new AbortController().signal,
        onEvent: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'incompleteImageStream', retryable: true })
  })

  it('uses a safe generic message for an unrecognized error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>failure</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )

    await expect(generateImage(request, 'secret-key')).rejects.toEqual(
      expect.objectContaining({
        message: '请求失败，请稍后重试。',
        status: 502,
      }),
    )
  })
})
