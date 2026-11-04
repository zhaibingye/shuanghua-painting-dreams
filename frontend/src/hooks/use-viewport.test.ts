import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useViewport } from './use-viewport'

class Viewport extends EventTarget {
  height = 844
  offsetTop = 0
  scale = 1
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('innerHeight', 844)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('fits the keyboard viewport and offset while preserving pinch zoom', () => {
  const viewport = new Viewport()
  vi.stubGlobal('visualViewport', viewport)
  renderHook(useViewport)
  const style = document.documentElement.style
  expect(style.getPropertyValue('--app-height')).toBe('844px')
  viewport.height = 360
  viewport.offsetTop = 24
  viewport.dispatchEvent(new Event('resize'))
  expect(style.getPropertyValue('--app-height')).toBe('360px')
  expect(style.getPropertyValue('--app-top')).toBe('24px')
  viewport.scale = 2
  viewport.height = 180
  viewport.dispatchEvent(new Event('resize'))
  expect(style.getPropertyValue('--app-height')).toBe('360px')
  viewport.scale = 1
  viewport.offsetTop = 0
  viewport.dispatchEvent(new Event('scroll'))
  expect(style.getPropertyValue('--app-height')).toBe('180px')
  expect(style.getPropertyValue('--app-top')).toBe('0px')
})

it('falls back to the window and removes listeners and styles on unmount', () => {
  vi.stubGlobal('visualViewport', undefined)
  const { unmount } = renderHook(useViewport)
  vi.stubGlobal('innerHeight', 390)
  window.dispatchEvent(new Event('resize'))
  expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('390px')
  unmount()
  window.dispatchEvent(new Event('resize'))
  expect(document.documentElement.style.getPropertyValue('--app-height')).toBe('')
})
