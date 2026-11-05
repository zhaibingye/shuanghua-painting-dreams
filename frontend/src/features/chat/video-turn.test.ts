import { describe, expect, it } from 'vitest'

import type { StoredConversation } from '../../storage/db'
import { normalizeByteDanceOptions } from './model-capabilities'
import { buildVideoExtensionRequest, buildVideoGenerationRequest, defaultVideoDraft, validateVideoTurn } from './video-turn'

function conversation(modelId: string): StoredConversation {
  return {
    id: 'conv_video',
    title: '视频对话',
    mediaKind: 'video',
    apiFormat: 'byteDanceVideo',
    baseUrl: 'https://shapi.vip',
    modelId,
    activeImageAssetId: null,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  }
}

describe('buildVideoGenerationRequest resolution', () => {
  it('sends 4k for Seedance 2.0', () => {
    const request = buildVideoGenerationRequest({
      conversation: conversation('doubao-seedance-2-0-260128'),
      prompt: 'snow',
      draft: defaultVideoDraft,
      images: [],
      turnOptions: { resolution: '4k' },
    })
    expect(request.apiFormat).toBe('byteDanceVideo')
    expect(request.options?.resolution).toBe('4k')
  })
})

describe('Seedance model defaults', () => {
  it.each([
    ['doubao-seedance-2-5-260628', -1, '720p', true],
    ['doubao-seedance-2-0-260128', 5, '720p', true],
    ['doubao-seedance-1-0-pro-250528', 5, '1080p', false],
  ] as const)('builds valid defaults for %s', (modelId, duration, resolution, generateAudio) => {
    const request = buildVideoGenerationRequest({
      conversation: conversation(modelId), prompt: 'snow', draft: defaultVideoDraft,
      images: [], turnOptions: {},
    })
    expect(request.options).toMatchObject({ duration, resolution, generateAudio })
  })

  it('preserves explicit audio and duration choices', () => {
    const request = buildVideoGenerationRequest({
      conversation: conversation('doubao-seedance-2-5-260628'), prompt: 'snow',
      draft: defaultVideoDraft, images: [],
      turnOptions: { duration: 30, resolution: '1080p', generateAudio: false },
    })
    expect(request.options).toMatchObject({ duration: 30, resolution: '1080p', generateAudio: false })
  })

  it('uses adaptive ratio for 2.5 frame generation', () => {
    const request = buildVideoGenerationRequest({
      conversation: conversation('doubao-seedance-2-5-260628'), prompt: 'snow',
      draft: { ...defaultVideoDraft, byteMode: 'firstFrameToVideo', firstFrameUrl: 'https://example.com/first.png' },
      images: [], turnOptions: { aspectRatio: '16:9' },
    })
    expect(request.options).toMatchObject({ aspectRatio: 'adaptive' })
  })
})

it('rejects excess voice IDs without silently discarding submitted values', () => {
  const values = {
    conversation: { ...conversation('grok-imagine-video-1.5'), apiFormat: 'xaiVideo' as const },
    prompt: 'snow',
    draft: { ...defaultVideoDraft, xaiMode: 'referenceToVideo' as const, voiceIds: 'a,b,c,d' },
    images: [],
    turnOptions: {},
  }
  expect(validateVideoTurn(values)).toContain('最多支持 3 个音色')
  const request = buildVideoGenerationRequest(values)
  expect(request).toMatchObject({ inputs: { voiceIds: ['a', 'b', 'c', 'd'] } })
})

describe('video option boundaries', () => {
  it.each([
    ['doubao-seedance-2-0-fast-260128-se', '1080p'],
    ['doubao-seedance-2-0-fast-260128', '4k'],
    ['doubao-seedance-1-0-lite-250128', '1080p'],
    ['doubao-seedance-2-5-260628', '4k'],
  ])('normalizes saved resolutions when selecting %s', (modelId, resolution) => {
    expect(normalizeByteDanceOptions({ resolution }, modelId).resolution).toBe('720p')
  })

  it.each(['byteDanceVideo', 'xaiVideo'] as const)('rejects invalid submitted %s options', (apiFormat) => {
    expect(() => buildVideoGenerationRequest({
      conversation: { ...conversation('custom-model'), apiFormat },
      prompt: 'snow', draft: defaultVideoDraft, images: [], turnOptions: { duration: '8' },
    })).toThrow('Duration')
  })

  it('validates extension duration and supplies its schema default', () => {
    const values = {
      conversation: { ...conversation('grok-imagine-video'), apiFormat: 'xaiVideo' as const },
      prompt: 'continue', draft: { ...defaultVideoDraft, extensionVideoUrl: 'https://example.com/source.mp4' },
    }
    expect(buildVideoExtensionRequest({ ...values, turnOptions: {} }).duration).toBe(6)
    expect(() => buildVideoExtensionRequest({ ...values, turnOptions: { extensionDuration: 11 } })).toThrow('Duration')
  })
})
