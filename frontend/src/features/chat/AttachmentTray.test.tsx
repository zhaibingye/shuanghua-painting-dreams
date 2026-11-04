import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { fileToDataUrl } from '../../workers/image-worker-client'
import type { ProcessedFile } from '../../workers/image.worker'
import { AttachmentTray } from './AttachmentTray'

vi.mock('../../workers/image-worker-client', () => ({ fileToDataUrl: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const processed: ProcessedFile = {
  dataUrl: 'data:image/png;base64,aW1hZ2U=',
  mimeType: 'image/png',
  width: 2,
  height: 2,
}
const createUrl = vi.fn(() => 'blob:preview')
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createUrl
      static override revokeObjectURL = vi.fn()
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function deferred() {
  let resolve!: (value: ProcessedFile) => void
  const promise = new Promise<ProcessedFile>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
const file = () => new File(['image'], 'image.png', { type: 'image/png' })
const upload = (files: File[]) =>
  fireEvent.change(screen.getByLabelText('添加本地参考图片'), { target: { files } })

it('does not leak preview URLs when one file in a batch fails', async () => {
  const onChange = vi.fn()
  vi.mocked(fileToDataUrl).mockResolvedValue(processed)
  render(<AttachmentTray images={[]} maxImages={16} onChange={onChange} />)
  upload([file(), new File(['bad'], 'bad.gif', { type: 'image/gif' })])
  await waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
  expect(createUrl).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
})

it('drops a late file result after the conversation changes', async () => {
  const pending = deferred()
  const onChange = vi.fn()
  const onProcessing = vi.fn()
  vi.mocked(fileToDataUrl).mockReturnValue(pending.promise)
  const { unmount } = render(
    <AttachmentTray
      images={[]}
      maxImages={16}
      onChange={onChange}
      onProcessingChange={onProcessing}
    />,
  )
  upload([file()])
  expect(onProcessing).toHaveBeenCalledWith(true)
  unmount()
  await act(async () => {
    pending.resolve(processed)
    await pending.promise
  })
  expect(onChange).not.toHaveBeenCalled()
  expect(createUrl).not.toHaveBeenCalled()
  expect(onProcessing).toHaveBeenLastCalledWith(false)
})

it('keeps the current attachments and limit when uploads finish later', async () => {
  const pending = deferred()
  const onChange = vi.fn()
  vi.mocked(fileToDataUrl).mockReturnValue(pending.promise)
  const { rerender } = render(<AttachmentTray images={[]} maxImages={2} onChange={onChange} />)
  upload([file(), file()])
  const current = { id: 'current', kind: 'url' as const, url: 'https://example.com/current.png' }
  rerender(<AttachmentTray images={[current]} maxImages={2} onChange={onChange} />)
  await act(async () => {
    pending.resolve(processed)
    await pending.promise
  })
  const result = onChange.mock.calls[0]?.[0] as unknown[]
  expect(result).toHaveLength(2)
  expect(result[0]).toEqual(current)
  expect(createUrl).toHaveBeenCalledOnce()
})

it('disables an already open URL editor while a task runs', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const { rerender } = render(<AttachmentTray images={[]} maxImages={16} onChange={onChange} />)
  await user.click(screen.getByRole('button', { name: '图片 URL' }))
  await user.type(screen.getByLabelText('图片 URL 地址'), 'https://example.com/image.png')
  rerender(<AttachmentTray images={[]} maxImages={16} onChange={onChange} disabled />)
  expect(screen.getByRole('button', { name: '添加' })).toBeDisabled()
  expect(screen.getByLabelText('图片 URL 地址')).toBeDisabled()
  expect(onChange).not.toHaveBeenCalled()
})
