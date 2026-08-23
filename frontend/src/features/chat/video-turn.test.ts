import { describe, expect, it } from 'vitest'

import type { StoredConversation } from '../../storage/db'
import { buildVideoGenerationRequest, defaultVideoDraft } from './video-turn'

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
    if (request.apiFormat !== 'byteDanceVideo') return
    expect(request.options?.resolution).toBe('4k')
  })

  it('sends 1080p for Seedance 2.0 fast special edition', () => {
    const request = buildVideoGenerationRequest({
      conversation: conversation('doubao-seedance-2-0-fast-260128-se'),
      prompt: 'snow',
      draft: defaultVideoDraft,
      images: [],
      turnOptions: { resolution: '1080p' },
    })
    expect(request.apiFormat).toBe('byteDanceVideo')
    if (request.apiFormat !== 'byteDanceVideo') return
    expect(request.options?.resolution).toBe('1080p')
  })

  it('falls back when the current model cannot use 4k or 1080p', () => {
    const request = buildVideoGenerationRequest({
      conversation: conversation('doubao-seedance-2-0-fast-260128'),
      prompt: 'snow',
      draft: defaultVideoDraft,
      images: [],
      turnOptions: { resolution: '4k' },
    })
    expect(request.apiFormat).toBe('byteDanceVideo')
    if (request.apiFormat !== 'byteDanceVideo') return
    expect(request.options?.resolution).toBe('720p')

    const lite = buildVideoGenerationRequest({
      conversation: conversation('doubao-seedance-1-0-lite-250128'),
      prompt: 'snow',
      draft: defaultVideoDraft,
      images: [],
      turnOptions: { resolution: '1080p' },
    })
    expect(lite.apiFormat).toBe('byteDanceVideo')
    if (lite.apiFormat !== 'byteDanceVideo') return
    expect(lite.options?.resolution).toBe('720p')
  })
})
