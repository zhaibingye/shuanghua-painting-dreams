import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { putConversation } from '../../storage/db'
import { defaultSettings } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'
import { CreateConversationDialog } from './CreateConversationDialog'

vi.mock('../../storage/db', () => ({ putConversation: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: structuredClone(defaultSettings) })
})
afterEach(cleanup)

it('keeps the dialog open and usable when local storage fails', async () => {
  vi.mocked(putConversation).mockRejectedValueOnce(new Error('Storage quota exceeded'))
  const onCreated = vi.fn()
  const onOpenChange = vi.fn()
  render(<CreateConversationDialog open onOpenChange={onOpenChange} onCreated={onCreated} />)
  fireEvent.click(screen.getByRole('button', { name: '创建对话' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Storage quota exceeded'))
  expect(screen.getByRole('button', { name: '创建对话' })).toBeEnabled()
  expect(onCreated).not.toHaveBeenCalled()
  expect(onOpenChange).not.toHaveBeenCalled()
})

it('creates only one conversation when clicked repeatedly during persistence', async () => {
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.mocked(putConversation).mockReturnValueOnce(pending)
  const onCreated = vi.fn()
  render(<CreateConversationDialog open onOpenChange={() => undefined} onCreated={onCreated} />)
  const button = screen.getByRole('button', { name: '创建对话' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(putConversation).toHaveBeenCalledOnce()
  await act(async () => {
    finish()
    await pending
  })
  expect(onCreated).toHaveBeenCalledOnce()
})
