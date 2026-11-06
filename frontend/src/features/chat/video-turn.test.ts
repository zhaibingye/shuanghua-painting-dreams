import { describe, expect, it } from 'vitest'

import type { StoredConversation } from '../../storage/db'
import { normalizeByteDanceOptions } from './model-capabilities'
import type { DraftImage } from './image-turn'
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

function localImage(id = 'image'): Extract<DraftImage, { kind: 'file' }> {
  return {
    id, kind: 'file', file: new File(['image'], `${id}.png`, { type: 'image/png' }),
    previewUrl: `blob:${id}`, dataUrl: 'data:image/png;base64,aW1hZ2U=', width: 512, height: 512,
  }
}

describe('Seedance image and multimodal inputs', () => {
  const values = {
    conversation: conversation('doubao-seedance-2-5-260628'), prompt: '',
    draft: { ...defaultVideoDraft, byteMode: 'referenceToVideo' as const },
    images: [localImage()], turnOptions: {},
  }

  it('sends local first and last frames directly as Base64 in order', () => {
    const first = localImage('first')
    const last = { id: 'last', kind: 'url' as const, url: 'https://example.com/last.png' }
    const options = { ...values, draft: { ...defaultVideoDraft, byteMode: 'firstLastFrameToVideo' as const }, images: [first, last] }
    expect(validateVideoTurn(options)).toBeNull()
    expect(buildVideoGenerationRequest(options)).toMatchObject({ inputs: {
      firstFrameUrl: first.dataUrl, lastFrameUrl: last.url,
      referenceImageUrls: [], referenceVideoUrls: [], referenceAudioUrls: [],
    } })
  })

  it('fills a missing frame with a local image when a frame URL is already set', () => {
    const options = { ...values, draft: { ...values.draft, byteMode: 'firstLastFrameToVideo' as const, firstFrameUrl: 'asset://first_frame' } }
    expect(validateVideoTurn(options)).toBeNull()
    expect(buildVideoGenerationRequest(options)).toMatchObject({ inputs: {
      firstFrameUrl: 'asset://first_frame', lastFrameUrl: values.images[0]?.kind === 'file' ? values.images[0].dataUrl : '',
    } })
  })

  it('supports 30 reference images without a prompt for 2.5 and 9 for 2.0', () => {
    const options = { ...values, images: Array.from({ length: 30 }, (_, index) => localImage(String(index))) }
    expect(validateVideoTurn(options)).toBeNull()
    expect(buildVideoGenerationRequest(options)).toMatchObject({ inputs: { referenceImageUrls: options.images.map((image) => image.dataUrl) } })
    const seedance2 = { ...options, conversation: conversation('doubao-seedance-2-0-260128') }
    expect(validateVideoTurn(seedance2)).toContain('超过')
    expect(validateVideoTurn({ ...seedance2, images: options.images.slice(0, 9) })).toBeNull()
  })

  it('preserves commas in signed URLs and Base64 while accepting multiple video and audio sources', () => {
    const video = 'https://example.com/video.mp4?signature=a,b&other=%2F'
    const audio = 'data:audio/wav;base64,aGVsbG8='
    const options = { ...values, draft: { ...values.draft, referenceVideoUrl: `${video}\nasset://second_video`, referenceAudioUrl: `${audio}\nasset://second_audio` } }
    expect(validateVideoTurn(options)).toBeNull()
    expect(buildVideoGenerationRequest(options)).toMatchObject({ inputs: {
      referenceVideoUrls: [video, 'asset://second_video'], referenceAudioUrls: [audio, 'asset://second_audio'],
    } })
  })

  it('keeps the message image numbers when additional reference URLs are supplied', () => {
    const options = { ...values, draft: { ...values.draft, referenceImageUrls: 'asset://extra_reference' } }
    expect(buildVideoGenerationRequest(options)).toMatchObject({ inputs: {
      referenceImageUrls: [values.images[0]?.dataUrl, 'asset://extra_reference'],
    } })
  })

  it('allows audio-only reference for 2.5 and requires visuals for 2.0', () => {
    const options = { ...values, images: [], draft: { ...values.draft, referenceAudioUrl: 'asset://audio' } }
    expect(validateVideoTurn(options)).toBeNull()
    expect(validateVideoTurn({ ...options, conversation: conversation('doubao-seedance-2-0-260128') })).toContain('搭配')
  })

  it('requires removing attachments when switching to text mode', () => {
    expect(validateVideoTurn({ ...values, prompt: 'move', draft: defaultVideoDraft })).toContain('移除')
  })

  it('checks local image dimensions before submitting', () => {
    expect(validateVideoTurn({ ...values, images: [{ ...localImage(), width: 299 }] })).toContain('300–6000')
  })
})
