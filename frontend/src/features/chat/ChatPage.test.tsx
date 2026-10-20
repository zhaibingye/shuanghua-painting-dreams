import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { createVideo, type VideoCreationResponse } from '../../api/client'
import { createTurn, updateMessage, updateVideoTask, type StoredConversation } from '../../storage/db'
import { defaultSettings } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'
import { ChatPage } from './ChatPage'

const route = vi.hoisted(() => ({ id: 'first' }))
vi.mock('react-router-dom', () => ({ useParams: () => ({ conversationId: route.id }) }))
vi.mock('../../hooks/use-history', () => ({
  useConversation: () => ({ conversation: conversation(route.id), loading: false }),
  useMessages: () => ({ messages: [] }),
}))
vi.mock('../../hooks/use-provider-metadata', () => ({ useProviderMetadata: () => ({ data: undefined }) }))
vi.mock('./MessageList', () => ({ MessageList: () => null }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  createVideo: vi.fn(),
}))
vi.mock('../../storage/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../storage/db')>(),
  createTurn: vi.fn(),
  updateMessage: vi.fn(),
  updateVideoTask: vi.fn(),
}))

function conversation(id: string): StoredConversation {
  return {
    id, title: id, mediaKind: 'video', apiFormat: 'byteDanceVideo',
    ...defaultSettings.formats.byteDanceVideo,
    activeImageAssetId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

const response: VideoCreationResponse = {
  requestId: 'req_test',
  task: { taskId: 'upstream', apiFormat: 'byteDanceVideo', operation: 'generation', status: 'queued' },
}

beforeEach(() => {
  vi.clearAllMocks()
  route.id = 'first'
  useSettingsStore.setState({ settings: { ...structuredClone(defaultSettings), globalApiKey: 'test-key' } })
  vi.mocked(createTurn).mockResolvedValue(undefined)
  vi.mocked(createVideo).mockResolvedValue(response)
  vi.mocked(updateMessage).mockResolvedValue(undefined)
  vi.mocked(updateVideoTask).mockResolvedValue(undefined)
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
})

afterEach(cleanup)

describe('video submission lifecycle', () => {
  it('blocks duplicate submissions while the turn is still being saved', async () => {
    const saved = deferred<undefined>()
    vi.mocked(createTurn).mockReturnValueOnce(saved.promise)
    const user = userEvent.setup()
    render(<ChatPage onOpenSidebar={() => undefined} />)
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'snow')
    const send = screen.getByRole('button', { name: '发送消息' })
    fireEvent.click(send)
    fireEvent.click(send)
    expect(createTurn).toHaveBeenCalledOnce()
    await act(async () => { saved.resolve(undefined); await saved.promise })
    await waitFor(() => expect(createVideo).toHaveBeenCalledOnce())
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('视频任务已提交'))
  })

  it('handles storage errors and unlocks the composer without submitting upstream', async () => {
    vi.mocked(createTurn).mockRejectedValueOnce(new Error('storage full'))
    const user = userEvent.setup()
    render(<ChatPage onOpenSidebar={() => undefined} />)
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'snow')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('storage full'))
    expect(createVideo).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('snow')
    expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled()
  })

  it('does not clear the new conversation video draft when an old submission completes', async () => {
    const submitted = deferred<VideoCreationResponse>()
    vi.mocked(createVideo).mockReturnValueOnce(submitted.promise)
    const user = userEvent.setup()
    const { rerender } = render(<ChatPage onOpenSidebar={() => undefined} />)
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'snow')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    await waitFor(() => expect(createVideo).toHaveBeenCalledOnce())

    route.id = 'second'
    rerender(<ChatPage onOpenSidebar={() => undefined} />)
    await user.click(screen.getByRole('button', { name: '参数' }))
    await user.selectOptions(screen.getByLabelText('生成模式'), 'firstFrameToVideo')
    await user.type(screen.getByLabelText('首帧公网 URL'), 'https://example.com/new.png')
    await act(async () => { submitted.resolve(response); await submitted.promise })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('视频任务已提交'))
    expect(screen.getByLabelText('生成模式')).toHaveValue('firstFrameToVideo')
    expect(screen.getByLabelText('首帧公网 URL')).toHaveValue('https://example.com/new.png')
  })
})
