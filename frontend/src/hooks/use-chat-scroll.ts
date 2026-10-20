import { useCallback, useEffect, useRef, useState } from 'react'

export function useChatScroll(conversationId: string | undefined, revision: unknown, ready = true) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current
    following.current = true
    setAtBottom(true)
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  useEffect(() => {
    following.current = true
    setAtBottom(true)
  }, [conversationId])

  useEffect(() => {
    const element = scrollRef.current
    const content = contentRef.current
    if (!element || !content) return
    const onScroll = () => {
      const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
      following.current = nearBottom
      setAtBottom(nearBottom)
    }
    const resize = () => {
      if (following.current) element.scrollTop = element.scrollHeight
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(content)
    observer?.observe(element)
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer?.disconnect()
      element.removeEventListener('scroll', onScroll)
    }
  }, [conversationId, ready])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (following.current) scrollToBottom()
    })
    return () => cancelAnimationFrame(frame)
  }, [conversationId, revision, scrollToBottom])

  return { scrollRef, contentRef, atBottom, scrollToBottom }
}
