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

describe('video parameter controls', () => {
  it('renders Seedance 2.0 controls from the generated catalog', () => {
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
        onOpenChange={vi.fn()}
        onOption={vi.fn()}
        onVideoDraft={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('分辨率')).toHaveValue('720p')
    expect(screen.getByRole('option', { name: '4k' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '1080p' })).toBeInTheDocument()
    expect(screen.queryByLabelText('服务等级')).not.toBeInTheDocument()
  })

  it.each([
    ['grok-imagine-video-1.5', ['480p', '720p', '1080p']],
    ['custom-video', ['480p', '720p']],
  ])('uses catalog resolutions and schema limits for %s', (modelId, resolutions) => {
    render(<ParametersDialog open
      conversation={{ ...conversation, apiFormat: 'xaiVideo', mediaKind: 'video', modelId }}
      options={{}} videoDraft={defaultVideoDraft}
      onOpenChange={vi.fn()} onOption={vi.fn()} onVideoDraft={vi.fn()} />)
    const resolution = screen.getByLabelText('分辨率')
    expect(resolution).toHaveValue('720p')
    expect([...resolution.querySelectorAll('option')].map((option) => option.value)).toEqual(resolutions)
    expect(screen.getByLabelText('时长（秒）')).toHaveValue(8)
    expect(screen.getByLabelText('时长（秒）')).toHaveAttribute('max', '15')
  })
})

function ImageDialogHarness({ modelId = 'gpt-image-2.5-sunburst', responses = false }: { modelId?: string; responses?: boolean }) {
  const [current, setCurrent] = useState<Record<string, unknown>>(options)
  return <ParametersDialog open conversation={{ ...conversation, modelId, apiFormat: responses ? 'openaiResponsesImage' : 'openaiImage' }}
    options={current} videoDraft={defaultVideoDraft}
    onOpenChange={vi.fn()} onOption={(key, value) => setCurrent((previous) => ({ ...previous, [key]: value }))} onVideoDraft={vi.fn()} />
}

describe('OpenAI image parameter controls', () => {
  it('shows 2.6 complexity and GIF controls while hiding incompatible streaming and compression controls', async () => {
    const user = userEvent.setup()
    render(<ImageDialogHarness modelId="gpt-image-2.6-sunburst" />)
    expect(screen.getByLabelText('复杂度')).toHaveValue('auto')
    expect(screen.getByRole('option', { name: 'svg' })).toBeInTheDocument()
    expect(screen.queryByLabelText('动画帧数')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('输出格式'), 'gif')
    expect(screen.getByLabelText('动画帧数')).toHaveValue(9)
    expect(screen.getByLabelText('动画帧数')).toHaveAttribute('max', '64')
    expect(screen.getByLabelText('每帧时长（毫秒）')).toHaveValue(200)
    expect(screen.queryByLabelText('输出压缩')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('渐进预览数量')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('快捷比例')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('输出格式'), 'svg')
    expect(screen.getByLabelText('生成数量')).toHaveAttribute('max', '1')
    expect(screen.queryByLabelText('动画帧数')).not.toBeInTheDocument()
    expect(screen.getByLabelText('SVG 编写模型（可选）')).toHaveValue('')
    expect(screen.queryByLabelText('SVG 编写推理强度')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('SVG 编写模型（可选）'), 'custom-svg-author')
    expect(screen.getByLabelText('SVG 编写推理强度')).toHaveValue('auto')
  })

  it('keeps new Images controls out of Responses and older image models', () => {
    const { unmount } = render(<ImageDialogHarness modelId="gpt-image-2.6-sunburst" responses />)
    expect(screen.queryByLabelText('复杂度')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'svg' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'gif' })).not.toBeInTheDocument()
    unmount()
    render(<ImageDialogHarness />)
    expect(screen.queryByLabelText('复杂度')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'svg' })).not.toBeInTheDocument()
  })

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
    expect(screen.getByLabelText('生图工具模型')).toHaveValue('gpt-image-2.5-sunburst')
    expect(screen.getByLabelText('快捷比例')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'max' })).toBeInTheDocument()
  })
})
