import { describe, expect, it } from 'vitest'

import {
  byteDanceResolutionsForModel,
  clampByteDanceResolution,
  resolveByteDanceVideoCapabilities,
  resolveModelCapabilities,
} from './model-capabilities'

describe('ByteDance video capabilities', () => {
  it('gives Seedance 2.0 4k and 1080p', () => {
    expect(byteDanceResolutionsForModel('doubao-seedance-2-0-260128')).toEqual([
      '480p',
      '720p',
      '1080p',
      '4k',
    ])
    expect(resolveByteDanceVideoCapabilities('doubao-seedance-2-0-250301').resolutions).toEqual([
      '480p',
      '720p',
      '1080p',
      '4k',
    ])
  })

  it.each([
    ['doubao-seedance-2-5-260628', ['480p', '720p', '1080p']],
    ['doubao-seedance-2-0-mini-260615', ['480p', '720p']],
    ['doubao-seedance-2-0-fast-260128', ['480p', '720p']],
    ['doubao-seedance-2-0-fast-260128-se', ['480p', '720p']],
    ['doubao-seedance-1-0-lite-250128-se', ['480p', '720p']],
    ['custom-endpoint-se', ['480p', '720p']],
  ])('uses documented resolutions for %s', (modelId, resolutions) => {
    expect(byteDanceResolutionsForModel(modelId)).toEqual(resolutions)
  })

  it('does not treat -se in the middle of a model id as special edition', () => {
    expect(byteDanceResolutionsForModel('doubao-seedance-2-0-fast-se-260128')).toEqual([
      '480p',
      '720p',
    ])
  })

  it('clamps unsupported resolutions back to 720p', () => {
    expect(clampByteDanceResolution('4k', 'doubao-seedance-2-0-260128')).toBe('4k')
    expect(clampByteDanceResolution('4k', 'doubao-seedance-2-0-fast-260128-se')).toBe('720p')
    expect(clampByteDanceResolution('1080p', 'doubao-seedance-2-0-fast-260128-se')).toBe('720p')
  })
})

describe('resolveModelCapabilities', () => {
  it('resolves ByteDance models without waiting for provider metadata', () => {
    const capabilities = resolveModelCapabilities({
      apiFormat: 'byteDanceVideo',
      modelId: 'doubao-seedance-2-0-fast-260128-se',
      provider: undefined,
    })
    expect(capabilities?.resolutions).toEqual(['480p', '720p'])
    expect(capabilities?.generateAudio).toBe(true)
  })

  it('uses exact known model metadata for non-ByteDance providers', () => {
    const capabilities = resolveModelCapabilities({
      apiFormat: 'xaiVideo',
      modelId: 'grok-imagine-video-1.5',
      provider: {
        apiFormat: 'xaiVideo',
        mediaKind: 'video',
        displayName: 'xAI',
        defaultBaseUrl: 'https://shapi.vip',
        defaultModelId: 'grok-imagine-video-1.5',
        genericCapabilities: {},
        defaultOptions: {},
        knownModels: {
          'grok-imagine-video-1.5': {
            resolutions: ['480p', '720p', '1080p'],
          },
        },
      },
    })
    expect(capabilities?.resolutions).toEqual(['480p', '720p', '1080p'])
  })
})
