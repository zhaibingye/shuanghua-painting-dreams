import * as Dialog from '@radix-ui/react-dialog'
import {
  Image,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  Snowflake,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useMatch, useNavigate } from 'react-router-dom'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Spinner } from '../../components/ui/Spinner'
import { useConversations } from '../../hooks/use-history'
import { useMediaQuery } from '../../hooks/use-media-query'
import { cn } from '../../lib/cn'
import { deleteConversation, updateConversation } from '../../storage/db'
import { apiFormatLabels, type MediaKind } from '../../storage/settings'
import { cancelConversationImageTasks } from '../image-tasks/image-task-manager'

type SidebarProps = {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onNew: () => void
  onSettings: () => void
}

export function ConversationSidebar({
  mobileOpen,
  onMobileOpenChange,
  onNew,
  onSettings,
}: SidebarProps) {
  const desktop = useMediaQuery('(min-width: 1024px)')
  useEffect(() => {
    if (desktop && mobileOpen) onMobileOpenChange(false)
  }, [desktop, mobileOpen, onMobileOpenChange])
  const { conversations, loading } = useConversations()
  const navigate = useNavigate()
  const activeRoute = useMatch('/chat/:conversationId')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | MediaKind>('all')
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuId) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuId(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuId(null)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [menuId])

  const groups = useMemo(
    () =>
      groupConversations(
        conversations.filter((conversation) => {
          const normalized = query.trim().toLocaleLowerCase('zh-CN')
          return (
            (filter === 'all' || conversation.mediaKind === filter) &&
            (!normalized ||
              conversation.title.toLocaleLowerCase('zh-CN').includes(normalized) ||
              conversation.modelId.toLocaleLowerCase('zh-CN').includes(normalized))
          )
        }),
      ),
    [conversations, filter, query],
  )

  const remove = async (id: string) => {
    if (!window.confirm('确定删除这个对话及其本地媒体结果吗？运行中的图片任务也会停止。')) return
    cancelConversationImageTasks(id)
    await deleteConversation(id)
    setMenuId(null)
    if (activeRoute?.params.conversationId === id) {
      onMobileOpenChange(false)
      void navigate('/')
    }
  }
  const rename = async (id: string, current: string) => {
    const title = window.prompt('重命名对话', current)?.trim()
    if (title) await updateConversation(id, { title })
    setMenuId(null)
  }

  const content = (
    <>
      <div className="sidebar-brand">
        <NavLink
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-brand-primary)]"
          onClick={() => onMobileOpenChange(false)}
          aria-label="霜华绘梦首页"
        >
          <span className="brand-mark">
            <Snowflake className="size-5" />
          </span>
          <span>
            <span className="block font-semibold tracking-wide">霜华绘梦</span>
            <span className="block text-[10px] tracking-[0.14em] text-[var(--ds-text-tertiary)]">
              PAINTING DREAMS
            </span>
          </span>
        </NavLink>
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          icon={<X className="size-4" />}
          aria-label="关闭侧边栏"
          onClick={() => onMobileOpenChange(false)}
        />
      </div>
      <div className="px-4">
        <Button
          className="w-full rounded-xl shadow-sm"
          size="lg"
          icon={<MessageSquarePlus className="size-4" />}
          onClick={() => {
            onMobileOpenChange(false)
            onNew()
          }}
        >
          开启新对话
        </Button>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-text-tertiary)]" />
          <Input
            aria-label="搜索对话"
            className="h-10 border-transparent bg-[var(--ds-bg-hover)] pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话或模型"
          />
        </div>
        <div className="sidebar-filters" aria-label="筛选对话">
          {(
            [
              ['all', '全部', Menu],
              ['image', '图片', Image],
              ['video', '视频', Video],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={cn('sidebar-filter', filter === value && 'is-selected')}
              onClick={() => setFilter(value)}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <nav className="sidebar-history ds-scroll" aria-label="历史对话">
        {loading ? (
          <div className="grid place-items-center py-10">
            <Spinner label="正在读取对话" />
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-5">
              <h2 className="mb-2 px-3 text-[11px] font-medium tracking-wide text-[var(--ds-text-tertiary)]">
                {group.label}
              </h2>
              <div className="grid gap-1">
                {group.items.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="conversation-row group"
                    ref={menuId === conversation.id ? menuRef : undefined}
                  >
                    <NavLink
                      to={`/chat/${conversation.id}`}
                      onClick={() => onMobileOpenChange(false)}
                      className={({ isActive }) => cn('conversation-link', isActive && 'is-active')}
                    >
                      <span className="block truncate text-sm font-medium">
                        {conversation.title}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-[var(--ds-text-tertiary)]">
                        {apiFormatLabels[conversation.apiFormat]} · {conversation.modelId}
                      </span>
                    </NavLink>
                    <button
                      type="button"
                      aria-label={`对话操作：${conversation.title}`}
                      aria-expanded={menuId === conversation.id}
                      aria-controls={`actions-${conversation.id}`}
                      className="conversation-options"
                      onClick={() =>
                        setMenuId((value) => (value === conversation.id ? null : conversation.id))
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                    {menuId === conversation.id ? (
                      <div
                        id={`actions-${conversation.id}`}
                        className="conversation-actions"
                        aria-label="对话操作"
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil className="size-3.5" />}
                          onClick={() => void rename(conversation.id, conversation.title)}
                        >
                          重命名
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash2 className="size-3.5" />}
                          onClick={() => void remove(conversation.id)}
                        >
                          删除
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
        {!loading && groups.length === 0 ? (
          <div className="sidebar-empty">
            <MessageSquarePlus className="size-7" />
            <p>{query || filter !== 'all' ? '没有匹配的对话' : '还没有创作记录'}</p>
            <span>
              {query || filter !== 'all' ? '试试其他关键词或分类' : '开启一段对话，留住你的灵感'}
            </span>
          </div>
        ) : null}
      </nav>
      <div className="sidebar-footer">
        <Button
          className="w-full justify-start rounded-xl"
          variant="ghost"
          icon={<Settings className="size-4" />}
          onClick={onSettings}
        >
          设置<span className="ml-auto text-[10px] text-[var(--ds-text-tertiary)]">偏好与连接</span>
        </Button>
      </div>
    </>
  )
  if (desktop)
    return (
      <aside className="conversation-sidebar sidebar-panel" aria-label="对话导航" data-open="true">
        {content}
      </aside>
    )
  return (
    <Dialog.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sidebar-overlay" />
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            document.querySelector<HTMLButtonElement>('button[aria-label="打开侧边栏"]')?.focus()
          }}
        >
          <aside className="conversation-sidebar sidebar-panel mobile-sidebar" data-open="true">
            <Dialog.Title className="sr-only">对话导航</Dialog.Title>
            {content}
          </aside>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type ConversationGroup = {
  label: string
  items: ReturnType<typeof useConversations>['conversations']
}
function groupConversations(
  conversations: ReturnType<typeof useConversations>['conversations'],
): ConversationGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const groups: ConversationGroup[] = [
    { label: '今天', items: [] },
    { label: '过去 7 天', items: [] },
    { label: '更早', items: [] },
  ]
  for (const conversation of conversations) {
    const updated = new Date(conversation.updatedAt)
    if (updated >= today) groups[0]?.items.push(conversation)
    else if (updated >= sevenDaysAgo) groups[1]?.items.push(conversation)
    else groups[2]?.items.push(conversation)
  }
  return groups.filter((group) => group.items.length > 0)
}
