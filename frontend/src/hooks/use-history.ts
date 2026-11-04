import { useCallback, useEffect, useState } from 'react'

import {
  getConversation,
  getVideoTaskByMessage,
  listConversations,
  listMessages,
  subscribeDatabaseChanges,
  type StoredConversation,
  type StoredMessage,
  type StoredVideoTask,
} from '../storage/db'

const emptyConversations: StoredConversation[] = []
const emptyMessages: StoredMessage[] = []

// 查询与结果绑定，切换对话时立即隐藏旧数据；只接收当前查询的最新结果。
function useHistoryQuery<T>(query: () => Promise<T>, empty: T): {
  value: T
  loading: boolean
} {
  const [result, setResult] = useState<{ query: typeof query; value: T } | null>(null)

  useEffect(() => {
    let disposed = false
    let version = 0
    const reload = () => {
      const currentVersion = ++version
      void query().then((value) => {
        if (!disposed && currentVersion === version) setResult({ query, value })
      })
    }
    const unsubscribe = subscribeDatabaseChanges(reload)
    reload()
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [query])

  return result?.query === query
    ? { value: result.value, loading: false }
    : { value: empty, loading: true }
}

export function useConversations(): {
  conversations: StoredConversation[]
  loading: boolean
} {
  const { value, loading } = useHistoryQuery(listConversations, emptyConversations)
  return { conversations: value, loading }
}

export function useConversation(id: string | undefined): {
  conversation: StoredConversation | null
  loading: boolean
} {
  const query = useCallback(async () => id ? (await getConversation(id)) ?? null : null, [id])
  const { value, loading } = useHistoryQuery(query, null)
  return { conversation: value, loading: Boolean(id) && loading }
}

export function useMessages(conversationId: string | undefined): {
  messages: StoredMessage[]
  loading: boolean
} {
  const query = useCallback(
    () => conversationId ? listMessages(conversationId) : Promise.resolve(emptyMessages),
    [conversationId],
  )
  const { value, loading } = useHistoryQuery(query, emptyMessages)
  return { messages: value, loading: Boolean(conversationId) && loading }
}

export function useVideoTask(assistantMessageId: string): StoredVideoTask | null {
  const query = useCallback(
    async () => (await getVideoTaskByMessage(assistantMessageId)) ?? null,
    [assistantMessageId],
  )
  return useHistoryQuery(query, null).value
}
