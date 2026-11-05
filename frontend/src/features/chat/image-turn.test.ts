import { beforeEach, describe, expect, it } from 'vitest'

import { defaultSettings, optionsForFormat, type ApiFormat } from '../../storage/settings'
import { clearWorkspace, type StoredConversation } from '../../storage/db'
import { buildImageTurnRequest } from './image-turn'

function conversation(format: ApiFormat): StoredConversation {
  return { id: 'conv_test', title: 'test', mediaKind: 'image', apiFormat: format,
    modelId: defaultSettings.formats[format].modelId, baseUrl: 'https://shapi.vip',
    activeImageAssetId: null, createdAt: '', updatedAt: '' }
}

beforeEach(clearWorkspace)

describe('image turn contract', () => {
  it('sends a separate markup asset and retains 2.6 animation controls', async () => {
    const current = { ...conversation('openaiImage'), modelId: 'gpt-image-2.6-sunburst' }
    const markup = 'data:image/png;base64,iVBORw0KGgo='
    const request = await buildImageTurnRequest({ conversation: current,
      previousMessages: [], prompt: 'make the circled vase blue',
      draftImages: [{ id: 'ref', kind: 'url', url: 'https://example.com/a.png' }],
      turnOptions: { complexity: 'low' }, maskDataUrl: null, markupDataUrl: markup })
    expect(request).toMatchObject({ markup: { kind: 'dataUrl', dataUrl: markup, filename: 'markup.png' },
      mask: null, options: { complexity: 'low' } })
    const animation = await buildImageTurnRequest({ conversation: current,
      previousMessages: [], prompt: 'looping lantern', draftImages: [], maskDataUrl: null,
      turnOptions: { outputFormat: 'gif', size: '256x256', frameCount: 64, frameDurationMs: 120 } })
    expect(animation.options).toMatchObject({ outputFormat: 'gif', size: '256x256', frameCount: 64, frameDurationMs: 120 })
  })

  it.each(['svg', 'gif'])('rejects reference images for %s before submission', async (outputFormat) => {
    await expect(buildImageTurnRequest({ conversation: { ...conversation('openaiImage'), modelId: 'gpt-image-2.6-sunburst' },
      previousMessages: [], prompt: 'snow', draftImages: [{ id: 'ref', kind: 'url', url: 'https://example.com/a.png' }],
      turnOptions: { outputFormat }, maskDataUrl: null,
    })).rejects.toThrow('仅支持文生图')
  })

  it('builds Seedream requests with reference images and schema defaults', async () => {
    const request = await buildImageTurnRequest({ conversation: conversation('byteDanceImage'),
      previousMessages: [], prompt: 'snow', draftImages: [{ id: 'ref', kind: 'url', url: 'https://example.com/a.png' }],
      turnOptions: optionsForFormat(defaultSettings, 'byteDanceImage'), maskDataUrl: null })
    expect(request.apiFormat).toBe('byteDanceImage')
    expect(request).toMatchObject({ sourceImages: [{ kind: 'url', url: 'https://example.com/a.png' }],
      options: { size: '2K', watermark: true, sequentialImageGeneration: 'disabled' } })
  })

  it('reports missing editing bases instead of silently generating a new image', async () => {
    await expect(buildImageTurnRequest({ conversation: { ...conversation('openaiImage'), activeImageAssetId: 'missing' },
      previousMessages: [], prompt: 'edit', draftImages: [], turnOptions: {}, maskDataUrl: null,
    })).rejects.toThrow('图片已不存在')
  })

  it('rejects invalid options instead of silently replacing them', async () => {
    await expect(buildImageTurnRequest({ conversation: conversation('openaiImage'),
      previousMessages: [], prompt: 'snow', draftImages: [], turnOptions: { count: 0, quality: 'typo' }, maskDataUrl: null,
    })).rejects.toThrow('无效')
  })

  it('does not turn video formats into xAI image requests', async () => {
    await expect(buildImageTurnRequest({ conversation: conversation('xaiVideo'),
      previousMessages: [], prompt: 'snow', draftImages: [], turnOptions: {}, maskDataUrl: null,
    })).rejects.toThrow('不支持图片生成')
  })
})
