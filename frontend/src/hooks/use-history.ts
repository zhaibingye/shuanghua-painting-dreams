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

export function useConversations(): {
  conversations: StoredConversation[]
  loading: boolean
} {
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    void listConversations().then((value) => {
      setConversations(value)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    reload()
    return subscribeDatabaseChanges(reload)
  }, [reload])

  return { conversations, loading }
}

export function useConversation(id: string | undefined): {
  conversation: StoredConversation | null
  loading: boolean
} {
  const [conversation, setConversation] = useState<StoredConversation | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const reload = useCallback(() => {
    if (!id) {
      setConversation(null)
      setLoading(false)
      return
    }
    void getConversation(id).then((value) => {
      setConversation(value ?? null)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    setLoading(Boolean(id))
    reload()
    return subscribeDatabaseChanges(reload)
  }, [id, reload])

  return { conversation, loading }
}

export function useMessages(conversationId: string | undefined): {
  messages: StoredMessage[]
  loading: boolean
} {
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [loading, setLoading] = useState(Boolean(conversationId))
  const reload = useCallback(() => {
    if (!conversationId) {
      setMessages([])
      setLoading(false)
      return
    }
    void listMessages(conversationId).then((value) => {
      setMessages(value)
      setLoading(false)
    })
  }, [conversationId])

  useEffect(() => {
    setLoading(Boolean(conversationId))
    reload()
    return subscribeDatabaseChanges(reload)
  }, [conversationId, reload])

  return { messages, loading }
}

export function useVideoTask(assistantMessageId: string): StoredVideoTask | null {
  const [task, setTask] = useState<StoredVideoTask | null>(null)
  const reload = useCallback(() => {
    void getVideoTaskByMessage(assistantMessageId).then((value) => setTask(value ?? null))
  }, [assistantMessageId])

  useEffect(() => {
    reload()
    return subscribeDatabaseChanges(reload)
  }, [reload])

  return task
}
