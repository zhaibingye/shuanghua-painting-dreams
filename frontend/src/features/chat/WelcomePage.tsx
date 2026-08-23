import { Image, Menu, MessageSquarePlus, Sparkles, Video } from 'lucide-react'

import { Button } from '../../components/ui/Button'

export function WelcomePage({
  onOpenSidebar,
  onNewImage,
  onNewVideo,
}: {
  onOpenSidebar: () => void
  onNewImage: () => void
  onNewVideo: () => void
}) {
  return (
    <div className="relative grid h-full place-items-center overflow-y-auto px-6 py-16">
      <Button size="icon" variant="ghost" className="absolute left-3 top-3 lg:hidden" icon={<Menu className="size-5" />} aria-label="打开侧边栏" onClick={onOpenSidebar} />
      <div className="w-full max-w-2xl text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[var(--ds-brand-primary)] text-white shadow-[var(--ds-shadow-card)]">
          <Sparkles className="size-7" />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">今天想创造什么？</h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-[var(--ds-text-secondary)]">
          在独立对话中连续生成和编辑图片，或将多轮视频任务整理成清晰的创作记录。
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button type="button" className="group rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)] p-5 text-left shadow-[var(--ds-shadow-card)] transition hover:border-[var(--ds-brand-border)] hover:bg-[var(--ds-brand-subtle)]" onClick={onNewImage}>
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--ds-brand-subtle)] text-[var(--ds-brand-text)] group-hover:bg-[var(--ds-bg-layer-1)]"><Image className="size-5" /></span>
            <h2 className="mt-4 font-semibold">图片对话</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ds-text-secondary)]">OpenAI、Gemini 与 xAI 的连续生成和编辑。</p>
          </button>
          <button type="button" className="group rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)] p-5 text-left shadow-[var(--ds-shadow-card)] transition hover:border-[var(--ds-brand-border)] hover:bg-[var(--ds-brand-subtle)]" onClick={onNewVideo}>
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--ds-brand-subtle)] text-[var(--ds-brand-text)] group-hover:bg-[var(--ds-bg-layer-1)]"><Video className="size-5" /></span>
            <h2 className="mt-4 font-semibold">视频对话</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ds-text-secondary)]">字节 Seedance 与 xAI 视频任务，每轮相互独立。</p>
          </button>
        </div>
        <Button className="mt-6 rounded-full" size="lg" icon={<MessageSquarePlus className="size-4" />} onClick={onNewImage}>开启新对话</Button>
      </div>
    </div>
  )
}
