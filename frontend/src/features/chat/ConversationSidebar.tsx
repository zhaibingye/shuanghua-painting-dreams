import { Image, Menu, MessageSquarePlus, MoreHorizontal, Search, Settings, Snowflake, Trash2, Video, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { cn } from '../../lib/cn'
import { deleteConversation, updateConversation } from '../../storage/db'
import { apiFormatLabels, type MediaKind } from '../../storage/settings'
import { useConversations } from '../../hooks/use-history'
import { cancelConversationImageTasks } from '../image-tasks/image-task-manager'

export function ConversationSidebar({
  mobileOpen,
  onMobileOpenChange,
  onNew,
  onSettings,
}: {
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  onNew: () => void
  onSettings: () => void
}) {
  const { conversations } = useConversations()
  const navigate = useNavigate()
  const params = useParams<{ conversationId: string }>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | MediaKind>('all')
  const [menuId, setMenuId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const filtered = conversations.filter((conversation) => {
      const matchesKind = filter === 'all' || conversation.mediaKind === filter
      const normalized = query.trim().toLocaleLowerCase('zh-CN')
      const matchesQuery =
        !normalized ||
        conversation.title.toLocaleLowerCase('zh-CN').includes(normalized) ||
        conversation.modelId.toLocaleLowerCase('zh-CN').includes(normalized)
      return matchesKind && matchesQuery
    })
    return groupConversations(filtered)
  }, [conversations, filter, query])

  const remove = async (id: string) => {
    if (!window.confirm('确定删除这个对话及其本地媒体结果吗？运行中的图片任务也会停止。')) return
    cancelConversationImageTasks(id)
    await deleteConversation(id)
    if (params.conversationId === id) void navigate('/')
  }

  const rename = async (id: string, current: string) => {
    const title = window.prompt('重命名对话', current)?.trim()
    if (title) await updateConversation(id, { title })
    setMenuId(null)
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="关闭侧边栏"
          className="fixed inset-0 z-40 bg-[var(--ds-bg-overlay)] lg:hidden"
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}
      <aside
        data-open={mobileOpen ? 'true' : 'false'}
        className="conversation-sidebar fixed inset-y-0 left-0 z-50 flex w-[var(--ds-sider-width)] flex-col border-r border-[var(--ds-border-light)] bg-[var(--ds-bg-sidebar)] transition-transform duration-300"
      >
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--ds-brand-primary)] text-white">
              <Snowflake className="size-5" />
            </span>
            <div>
              <p className="font-semibold tracking-wide">霜华绘梦</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ds-text-caption)]">Painting Dreams</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="lg:hidden" icon={<X className="size-4" />} aria-label="关闭侧边栏" onClick={() => onMobileOpenChange(false)} />
        </div>

        <div className="px-3">
          <Button className="w-full rounded-full" size="lg" icon={<MessageSquarePlus className="size-4" />} onClick={onNew}>开启新对话</Button>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-text-caption)]" />
            <Input className="h-9 rounded-full pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对话" />
          </div>
          <div className="mt-2 grid grid-cols-3 rounded-full bg-[var(--ds-bg-hover)] p-1">
            {([
              ['all', '全部', Menu],
              ['image', '图片', Image],
              ['video', '视频', Video],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  'flex h-8 items-center justify-center gap-1 rounded-full text-xs text-[var(--ds-text-secondary)] transition',
                  filter === value && 'bg-[var(--ds-bg-layer-1)] text-[var(--ds-brand-text)] shadow-sm',
                )}
                onClick={() => setFilter(value)}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <nav className="ds-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((group) => (
            <section key={group.label} className="mb-4">
              <h2 className="px-2 py-1 text-[11px] font-medium text-[var(--ds-text-caption)]">{group.label}</h2>
              <div className="grid gap-0.5">
                {group.items.map((conversation) => (
                  <div key={conversation.id} className="group relative">
                    <NavLink
                      to={`/chat/${conversation.id}`}
                      onClick={() => onMobileOpenChange(false)}
                      className={({ isActive }) => cn(
                        'block rounded-xl px-3 py-2.5 pr-9 transition hover:bg-[var(--ds-bg-hover)]',
                        isActive && 'bg-[var(--ds-bg-active)]',
                      )}
                    >
                      <p className="truncate text-sm text-[var(--ds-text-primary)]">{conversation.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--ds-text-caption)]">{apiFormatLabels[conversation.apiFormat]} · {conversation.modelId}</p>
                    </NavLink>
                    <button
                      type="button"
                      aria-label="对话操作"
                      className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg text-[var(--ds-text-tertiary)] opacity-0 hover:bg-[var(--ds-bg-active)] group-hover:opacity-100 focus:opacity-100"
                      onClick={() => setMenuId((value) => value === conversation.id ? null : conversation.id)}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                    {menuId === conversation.id ? (
                      <div className="absolute right-2 top-10 z-20 min-w-28 rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-2)] p-1 shadow-[var(--ds-shadow-popup)]">
                        <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--ds-bg-hover)]" onClick={() => void rename(conversation.id, conversation.title)}>重命名</button>
                        <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--ds-error)] hover:bg-[var(--ds-error-subtle)]" onClick={() => void remove(conversation.id)}><Trash2 className="size-3.5" />删除</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 ? <p className="px-3 py-8 text-center text-xs text-[var(--ds-text-caption)]">还没有匹配的对话</p> : null}
        </nav>

        <div className="border-t border-[var(--ds-border-light)] p-3">
          <Button className="w-full justify-start rounded-xl" variant="ghost" icon={<Settings className="size-4" />} onClick={onSettings}>设置</Button>
        </div>
      </aside>
    </>
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
