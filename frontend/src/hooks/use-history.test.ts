import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '../storage/settings'
import type { StoredConversation } from '../storage/db'
import { getConversation, subscribeDatabaseChanges } from '../storage/db'
import { useConversation } from './use-history'

vi.mock('../storage/db', () => ({
  getConversation: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  getVideoTaskByMessage: vi.fn(),
  subscribeDatabaseChanges: vi.fn(),
}))

let reload: () => void

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(subscribeDatabaseChanges).mockImplementation((listener) => {
    reload = listener
    return vi.fn()
  })
})

function conversation(id: string): StoredConversation {
  return {
    id,
    title: id,
    mediaKind: 'image',
    apiFormat: 'openaiImage',
    ...defaultSettings.formats.openaiImage,
    activeImageAssetId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

describe('history query lifecycle', () => {
  it('ignores old conversation results after navigation', async () => {
    const old = deferred<StoredConversation | undefined>()
    vi.mocked(getConversation)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(conversation('new'))
    const { result, rerender } = renderHook(({ id }) => useConversation(id), {
      initialProps: { id: 'old' },
    })

    rerender({ id: 'new' })
    expect(result.current.conversation).toBeNull()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.conversation?.id).toBe('new'))
    await act(async () => { old.resolve(conversation('old')); await old.promise })
    expect(result.current.conversation?.id).toBe('new')
  })

  it('only applies the latest database refresh', async () => {
    const older = deferred<StoredConversation | undefined>()
    vi.mocked(getConversation)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ ...conversation('same'), title: 'latest title' })
    const { result } = renderHook(() => useConversation('same'))

    act(() => reload())
    await waitFor(() => expect(result.current.conversation?.title).toBe('latest title'))
    await act(async () => { older.resolve(conversation('same')); await older.promise })
    expect(result.current.conversation?.title).toBe('latest title')
  })

  it('hides the previous conversation while the next one loads', async () => {
    const next = deferred<StoredConversation | undefined>()
    vi.mocked(getConversation)
      .mockResolvedValueOnce(conversation('first'))
      .mockReturnValueOnce(next.promise)
    const { result, rerender } = renderHook(({ id }) => useConversation(id), {
      initialProps: { id: 'first' },
    })
    await waitFor(() => expect(result.current.conversation?.id).toBe('first'))
    rerender({ id: 'second' })
    expect(result.current.conversation).toBeNull()
    expect(result.current.loading).toBe(true)
    await act(async () => { next.resolve(conversation('second')); await next.promise })
    expect(result.current.conversation?.id).toBe('second')
  })
})
