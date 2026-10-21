import { useState } from 'react'
import userEvent from '@testing-library/user-event'
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

  it('explains non-streaming editing and hides progressive previews', () => {
    renderDialog(true)

    expect(screen.queryByText('输入保真度')).not.toBeInTheDocument()
    expect(screen.getByText(/参考图与遮罩编辑使用非流式/)).toBeInTheDocument()
    expect(screen.queryByText('渐进预览数量')).not.toBeInTheDocument()
    expect(screen.getByText('Moderation')).toBeInTheDocument()
  })
})

function ImageDialogHarness({ modelId = 'gpt-image-2.5-sunburst', responses = false }: { modelId?: string; responses?: boolean }) {
  const [current, setCurrent] = useState<Record<string, unknown>>(options)
  return <ParametersDialog open conversation={{ ...conversation, modelId, apiFormat: responses ? 'openaiResponsesImage' : 'openaiImage' }}
    options={current} videoDraft={defaultVideoDraft} modelCapabilities={undefined} openAIImageEditing={false}
    onOpenChange={vi.fn()} onOption={(key, value) => setCurrent((previous) => ({ ...previous, [key]: value }))} onVideoDraft={vi.fn()} />
}

describe('OpenAI image parameter controls', () => {
  it('applies a 4K portrait preset and retains manual size input', async () => {
    const user = userEvent.setup()
    render(<ImageDialogHarness />)
    expect(screen.getByRole('option', { name: '9:21' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('快捷比例'), '9:16')
    await user.click(screen.getByRole('button', { name: /4K/ }))
    expect(screen.getByRole('textbox', { name: /^尺寸/ })).toHaveValue('2160x3840')
    expect(screen.getByText(/属于官方实验性分辨率/)).toBeInTheDocument()
    await user.clear(screen.getByRole('textbox', { name: /^尺寸/ }))
    await user.type(screen.getByRole('textbox', { name: /^尺寸/ }), '1536x864')
    expect(screen.queryByText(/总像素必须/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '自动尺寸' }))
    expect(screen.getByRole('textbox', { name: /^尺寸/ })).toHaveValue('auto')
  })

  it('exposes max, transparent output, and format-specific compression', async () => {
    const user = userEvent.setup()
    render(<ImageDialogHarness />)
    expect(screen.getByRole('option', { name: 'max' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'xhigh' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'transparent' })).toBeInTheDocument()
    expect(screen.queryByLabelText('输出压缩')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('输出格式'), 'webp')
    expect(screen.getByLabelText('输出压缩')).toBeInTheDocument()
  })

  it('restricts older models to standard dimensions and quality', () => {
    render(<ImageDialogHarness modelId="gpt-image-1.5" />)
    expect(screen.queryByRole('option', { name: 'max' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('快捷比例')).not.toBeInTheDocument()
    expect(screen.getByLabelText('标准尺寸')).toBeInTheDocument()
  })

  it('provides the same presets and an explicit image model for Responses', () => {
    render(<ImageDialogHarness responses />)
    expect(screen.getByLabelText('图像模型')).toHaveValue('gpt-image-2.5-sunburst')
    expect(screen.getByLabelText('快捷比例')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'max' })).toBeInTheDocument()
  })
})
