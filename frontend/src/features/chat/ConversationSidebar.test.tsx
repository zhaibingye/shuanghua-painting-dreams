import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { deleteConversation } from '../../storage/db'
import { ConversationSidebar } from './ConversationSidebar'

const layout = vi.hoisted(() => ({ desktop: true }))
vi.mock('../../hooks/use-media-query', () => ({ useMediaQuery: () => layout.desktop }))
vi.mock('../../hooks/use-history', () => ({
  useConversations: () => ({
    loading: false,
    conversations: [
      {
        id: 'current',
        title: '测试创作',
        apiFormat: 'openaiImage',
        mediaKind: 'image',
        modelId: 'gpt-image-2.5-sunburst',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  }),
}))
vi.mock('../../storage/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/db')>()),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}))

function Harness() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  return (
    <>
      <button aria-label="打开侧边栏" onClick={() => setOpen(true)}>
        导航
      </button>
      <ConversationSidebar
        mobileOpen={open}
        onMobileOpenChange={setOpen}
        onNew={() => undefined}
        onSettings={() => undefined}
      />
      <span data-testid="location">{location.pathname}</span>
    </>
  )
}
function start() {
  return render(
    <MemoryRouter initialEntries={['/chat/current']}>
      <Harness />
    </MemoryRouter>,
  )
}
beforeEach(() => {
  layout.desktop = true
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('navigates home after deleting the active conversation outside the route outlet', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const user = userEvent.setup()
  start()
  await user.click(screen.getByRole('button', { name: '对话操作：测试创作' }))
  await user.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
  expect(deleteConversation).toHaveBeenCalledWith('current')
})

it('traps focus in the mobile drawer and restores the opener on Escape', async () => {
  layout.desktop = false
  const user = userEvent.setup()
  start()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const opener = screen.getByRole('button', { name: '打开侧边栏' })
  await user.click(opener)
  const drawer = screen.getByRole('dialog', { name: '对话导航' })
  expect(drawer.contains(document.activeElement)).toBe(true)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(opener).toHaveFocus())
})

it('preserves the search and releases the modal when resizing to desktop', async () => {
  layout.desktop = false
  const user = userEvent.setup()
  const { rerender } = start()
  await user.click(screen.getByRole('button', { name: '打开侧边栏' }))
  await user.type(screen.getByRole('textbox', { name: '搜索对话' }), '测试')
  layout.desktop = true
  rerender(
    <MemoryRouter initialEntries={['/chat/current']}>
      <Harness />
    </MemoryRouter>,
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '对话导航' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '搜索对话' })).toHaveValue('测试')
  expect(document.body.style.pointerEvents).not.toBe('none')
})
