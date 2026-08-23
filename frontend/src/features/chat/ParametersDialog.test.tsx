import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StoredConversation } from '../../storage/db'
import { ParametersDialog } from './ParametersDialog'
import { defaultVideoDraft } from './video-turn'

const conversation: StoredConversation = {
  id: 'conv_test',
  title: '测试对话',
  mediaKind: 'image',
  apiFormat: 'openaiImage',
  baseUrl: 'https://shapi.vip',
  modelId: 'gpt-image-2',
  activeImageAssetId: null,
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z',
}

afterEach(cleanup)

const options = {
  count: 1,
  size: '1024x1024',
  quality: 'auto',
  outputFormat: 'png',
  outputCompression: 100,
  background: 'auto',
  moderation: 'auto',
  inputFidelity: 'auto',
  partialImages: 2,
}

function renderDialog(openAIImageEditing: boolean) {
  render(
    <ParametersDialog
      open
      conversation={conversation}
      options={options}
      videoDraft={defaultVideoDraft}
      modelCapabilities={undefined}
      openAIImageEditing={openAIImageEditing}
      onOpenChange={vi.fn()}
      onOption={vi.fn()}
      onVideoDraft={vi.fn()}
    />,
  )
}

describe('ParametersDialog ByteDance video resolutions', () => {
  it('renders 4k when Seedance 2.0 capabilities include it', () => {
    render(
      <ParametersDialog
        open
        conversation={{
          ...conversation,
          mediaKind: 'video',
          apiFormat: 'byteDanceVideo',
          modelId: 'doubao-seedance-2-0-260128',
        }}
        options={{ duration: 5, resolution: '720p', aspectRatio: 'adaptive' }}
        videoDraft={defaultVideoDraft}
        modelCapabilities={{
          automaticDuration: true,
          resolutions: ['480p', '720p', '1080p', '4k'],
          generateAudio: true,
          webSearch: true,
        }}
        openAIImageEditing={false}
        onOpenChange={vi.fn()}
        onOption={vi.fn()}
        onVideoDraft={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('分辨率')).toHaveValue('720p')
    expect(screen.getByRole('option', { name: '4k' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '1080p' })).toBeInTheDocument()
  })
})

describe('ParametersDialog OpenAI Images mode', () => {
  it('shows generation-only streaming controls without a reference image', () => {
    renderDialog(false)

    expect(screen.getByText('渐进预览数量')).toBeInTheDocument()
    expect(screen.getByText('Moderation')).toBeInTheDocument()
    expect(screen.queryByText('输入保真度')).not.toBeInTheDocument()
    expect(screen.queryByText(/参考图与遮罩编辑使用非流式/)).not.toBeInTheDocument()
  })

  it('explains non-streaming editing and hides generation-only controls', () => {
    renderDialog(true)

    expect(screen.getByText('输入保真度')).toBeInTheDocument()
    expect(screen.getByText(/参考图与遮罩编辑使用非流式/)).toBeInTheDocument()
    expect(screen.queryByText('渐进预览数量')).not.toBeInTheDocument()
    expect(screen.queryByText('Moderation')).not.toBeInTheDocument()
  })
})
