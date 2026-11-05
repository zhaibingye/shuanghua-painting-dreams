import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { MaskEditor } from './MaskEditor'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('exports the transparent annotation canvas without converting it to a mask', async () => {
  const overlay = new Uint8ClampedArray([34, 211, 238, 140, 0, 0, 0, 0])
  const context = {
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: overlay })),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(8) })),
    putImageData: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,markup')
  const onConfirm = vi.fn()
  const onConfirmMarkup = vi.fn()
  const user = userEvent.setup()
  render(<MaskEditor open imageUrl="https://example.com/image.png" width={2} height={1}
    onConfirm={onConfirm} onConfirmMarkup={onConfirmMarkup} onOpenChange={vi.fn()} />)
  await user.selectOptions(screen.getByLabelText('编辑方式'), 'markup')
  await user.click(screen.getByRole('button', { name: '应用标注' }))
  expect(onConfirmMarkup).toHaveBeenCalledWith('data:image/png;base64,markup')
  expect(onConfirm).not.toHaveBeenCalled()
  expect(context.putImageData).not.toHaveBeenCalled()
})

it('keeps undo and redo history consistent in React StrictMode', async () => {
  const context = {
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16) })),
    putImageData: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  const user = userEvent.setup()
  render(
    <StrictMode>
      <MaskEditor open imageUrl="https://example.com/image.png" width={2} height={2}
        onConfirm={() => undefined} onOpenChange={() => undefined} />
    </StrictMode>,
  )

  await user.click(screen.getByRole('button', { name: '反转' }))
  await user.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '重做' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByRole('button', { name: '重做' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
})
