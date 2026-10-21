import { describe, expect, it } from 'vitest'

import { buildImageTurnRequest } from './image-turn'
import {
  OPENAI_ASPECT_RATIOS,
  OPENAI_RESOLUTION_TIERS,
  normalizeOpenAIImageOptions,
  openAIImageCapabilities,
  openAIImageAspectRatio,
  openAIImagePreset,
  openAIImageSizeError,
} from './openai-image-options'

describe('OpenAI image presets', () => {
  for (const ratio of OPENAI_ASPECT_RATIOS) {
    for (const tier of OPENAI_RESOLUTION_TIERS) {
      it(`${ratio} ${tier} satisfies every API constraint`, () => {
        const size = openAIImagePreset(ratio, tier)
        const [width = 0, height = 0] = size.split('x').map(Number)
        const [ratioWidth = 1, ratioHeight = 1] = ratio.split(':').map(Number)
        expect(width % 16).toBe(0)
        expect(height % 16).toBe(0)
        expect(width * height).toBeGreaterThanOrEqual(655_360)
        expect(width * height).toBeLessThanOrEqual(8_294_400)
        expect(Math.max(width, height)).toBeLessThanOrEqual(3840)
        expect(width / height).toBeCloseTo(ratioWidth / ratioHeight)
        expect(openAIImageSizeError(size, 'gpt-image-2.5-sunburst')).toBeUndefined()
      })
    }
  }

  it('restores the ratio from saved dimensions', () => {
    expect(openAIImageAspectRatio('3840x2160')).toBe('16:9')
    expect(openAIImageAspectRatio('576x1344')).toBe('9:21')
    expect(openAIImageAspectRatio('auto')).toBe('1:1')
  })

  it('uses official 2K/4K widescreen sizes and clamps square 4K to the pixel limit', () => {
    expect(openAIImagePreset('16:9', '2K')).toBe('2048x1152')
    expect(openAIImagePreset('16:9', '4K')).toBe('3840x2160')
    expect(openAIImagePreset('9:16', '4K')).toBe('2160x3840')
    expect(openAIImagePreset('1:1', '4K')).toBe('2880x2880')
  })

  it.each(['0x1024', '1025x1024', '4096x4096', '3840x3840', '512x512', '3072x512'])(
    'rejects invalid custom size %s', (size) => {
      expect(openAIImageSizeError(size, 'gpt-image-2')).toBeTruthy()
    },
  )
})

describe('OpenAI model options', () => {
  it('enables max only for Image 2.5 including snapshots', () => {
    expect(openAIImageCapabilities('gpt-image-2.5-flare-2026-09-08').qualities).toContain('max')
    expect(openAIImageCapabilities('gpt-image-2').qualities).not.toContain('max')
    expect(openAIImageSizeError('2048x2048', 'gpt-image-1.5')).toBeTruthy()
  })

  it('normalizes persisted options when changing models and transparent output', () => {
    expect(normalizeOpenAIImageOptions({
      quality: 'max', inputFidelity: 'high', size: '2048x2048',
      background: 'transparent', outputFormat: 'jpeg',
    }, 'gpt-image-1-mini')).toMatchObject({
      quality: 'auto', inputFidelity: 'auto', size: 'auto', outputFormat: 'png',
    })
  })

  it.each(['openaiImage', 'openaiResponsesImage'] as const)(
    'preserves max and the selected dimensions through the %s request builder', async (apiFormat) => {
      const request = await buildImageTurnRequest({
        conversation: {
          id: 'test', title: 'test', mediaKind: 'image', apiFormat,
          baseUrl: 'https://example.com', modelId: 'gpt-image-2.5-sunburst',
          activeImageAssetId: null, createdAt: '', updatedAt: '',
        },
        previousMessages: [], prompt: 'flower', draftImages: [], maskDataUrl: null,
        turnOptions: {
          quality: 'max', size: '3840x2160', safetyIdentifier: 'hash',
          imageModel: 'gpt-image-2.5-flare', moderation: 'low',
        },
      })
      expect(request.options).toMatchObject({
        quality: 'max', size: '3840x2160', safetyIdentifier: 'hash', moderation: 'low',
      })
      if (request.apiFormat === 'openaiResponsesImage') {
        expect(request.options?.imageModel).toBe('gpt-image-2.5-flare')
      }
    },
  )
})
