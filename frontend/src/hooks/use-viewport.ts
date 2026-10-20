import { useEffect } from 'react'

/** 跟随手机键盘、浏览器工具栏和旋转后的实际可视区域，保留用户缩放。 */
export function useViewport(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (viewport && viewport.scale !== 1) return
        const height = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
        if (!Number.isFinite(height) || height <= 0) return
        root.style.setProperty('--app-height', `${height}px`)
        root.style.setProperty('--app-top', `${viewport?.offsetTop ?? 0}px`)
      })
    }
    update()
    window.addEventListener('resize', update)
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      root.style.removeProperty('--app-height')
      root.style.removeProperty('--app-top')
    }
  }, [])
}
