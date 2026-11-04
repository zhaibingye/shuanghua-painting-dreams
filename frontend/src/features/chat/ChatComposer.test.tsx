import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { defaultSettings } from '../../storage/settings'
import type { StoredConversation } from '../../storage/db'
import { fileToDataUrl } from '../../workers/image-worker-client'
import type { ProcessedFile } from '../../workers/image.worker'
import { ChatComposer } from './ChatComposer'
import { defaultVideoDraft } from './video-turn'

vi.mock('../../workers/image-worker-client', () => ({ fileToDataUrl: vi.fn() }))
const conversation: StoredConversation = {
  id: 'test',
  title: 'test',
  mediaKind: 'image',
  apiFormat: 'openaiImage',
  ...defaultSettings.formats.openaiImage,
  activeImageAssetId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}
const base = {
  conversation,
  prompt: 'snow',
  images: [],
  videoDraft: defaultVideoDraft,
  busy: false,
  canStop: false,
  maskReady: false,
  canOpenMask: false,
  onPrompt: vi.fn(),
  onImages: vi.fn(),
  onSubmit: vi.fn(),
  onStop: vi.fn(),
  onParameters: vi.fn(),
  onOpenMask: vi.fn(),
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('prevents sending with a half-processed attachment via both Enter and the button', async () => {
  let finish!: (result: ProcessedFile) => void
  const pending = new Promise<ProcessedFile>((resolve) => {
    finish = resolve
  })
  vi.mocked(fileToDataUrl).mockReturnValueOnce(pending)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn(() => 'blob:test')
    },
  )
  render(<ChatComposer {...base} />)
  fireEvent.change(screen.getByLabelText('添加本地参考图片'), {
    target: { files: [new File(['png'], 'image.png', { type: 'image/png' })] },
  })
  expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('textbox', { name: '消息' }), { key: 'Enter' })
  expect(base.onSubmit).not.toHaveBeenCalled()
  await act(async () => {
    finish({
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      mimeType: 'image/png',
      width: 2,
      height: 2,
    })
    await pending
  })
  await waitFor(() => expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled())
})

it('only offers stop for a cancellable image task', () => {
  const { rerender } = render(
    <ChatComposer
      {...base}
      busy
      conversation={{ ...conversation, mediaKind: 'video', apiFormat: 'byteDanceVideo' }}
    />,
  )
  expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
  expect(screen.getByText('正在提交视频')).toBeInTheDocument()
  rerender(<ChatComposer {...base} busy canStop />)
  expect(screen.getByRole('button', { name: '停止生成' })).toBeEnabled()
})
