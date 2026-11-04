import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useChatScroll } from './use-chat-scroll'

let scrollHeight = 1000
const callbacks = new Set<ResizeObserverCallback>()
class Observer {
  constructor(callback: ResizeObserverCallback) {
    callbacks.add(callback)
  }
  observe() {
    /* The test changes the geometry explicitly. */
  }
  unobserve() {
    /* Not needed by this observer. */
  }
  disconnect() {
    /* Unmount is checked through cleanup. */
  }
}
function Harness({ revision, ready = true }: { revision: number; ready?: boolean }) {
  const { scrollRef, contentRef, atBottom, scrollToBottom } = useChatScroll('chat', revision, ready)
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, value: 300 },
    })
  }, [ready, scrollRef])
  return ready ? (
    <>
      <div data-testid="scroll" ref={scrollRef}>
        <div ref={contentRef}>messages {revision}</div>
      </div>
      <button onClick={scrollToBottom}>最新</button>
      <span>{atBottom ? 'following' : 'reading'}</span>
    </>
  ) : null
}

beforeEach(() => {
  scrollHeight = 1000
  callbacks.clear()
  vi.stubGlobal('ResizeObserver', Observer)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('lets the reader stay in history until they choose to follow new content', () => {
  const { rerender } = render(<Harness revision={0} />)
  const element = screen.getByTestId('scroll')
  expect(element.scrollTop).toBe(1000)
  element.scrollTop = 100
  fireEvent.scroll(element)
  expect(screen.getByText('reading')).toBeInTheDocument()
  scrollHeight = 1300
  rerender(<Harness revision={1} />)
  act(() => {
    for (const callback of callbacks) callback([], {} as ResizeObserver)
  })
  expect(element.scrollTop).toBe(100)
  fireEvent.click(screen.getByRole('button', { name: '最新' }))
  expect(element.scrollTop).toBe(1300)
  scrollHeight = 1600
  act(() => {
    for (const callback of callbacks) callback([], {} as ResizeObserver)
  })
  expect(element.scrollTop).toBe(1600)
})

it('observes content that mounts after the conversation finishes loading', () => {
  const { rerender } = render(<Harness revision={0} ready={false} />)
  expect(callbacks.size).toBe(0)
  rerender(<Harness revision={1} />)
  expect(callbacks.size).toBe(1)
  scrollHeight = 1400
  act(() => {
    for (const callback of callbacks) callback([], {} as ResizeObserver)
  })
  expect(screen.getByTestId('scroll').scrollTop).toBe(1400)
})
