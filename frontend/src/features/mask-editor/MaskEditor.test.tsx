import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { MaskEditor } from './MaskEditor'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
