import { ArrowUpRight, Image, Layers3, Menu, Sparkles, Video } from 'lucide-react'

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
    <div className="welcome-page ds-scroll">
      <header className="welcome-header">
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden"
          icon={<Menu className="size-5" />}
          aria-label="打开侧边栏"
          onClick={onOpenSidebar}
        />
        <span className="text-xs font-medium tracking-widest text-[var(--ds-text-tertiary)]">
          灵感，从这里开始
        </span>
        <span className="welcome-status">
          <span /> 你的创作空间
        </span>
      </header>
      <div className="welcome-content">
        <div className="welcome-eyebrow">
          <Sparkles className="size-4" /> 霜华绘梦 · 创作工作台
        </div>
        <h1>
          让每一份灵感，
          <br />
          <span>都有自己的画面。</span>
        </h1>
        <p className="welcome-description">
          从一句描述到一张图片、一段影像。
          <br className="hidden sm:block" />
          用对话打磨细节，让想象慢慢成形。
        </p>
        <div className="creation-grid">
          <button type="button" className="creation-card image-creation" onClick={onNewImage}>
            <div className="creation-art landscape-art" aria-hidden="true">
              <span className="art-sun" />
              <span className="art-hill art-hill-back" />
              <span className="art-hill art-hill-front" />
              <span className="art-caption">
                <Image className="size-3.5" /> 从想象到画面
              </span>
            </div>
            <div className="creation-card-copy">
              <div className="flex items-center justify-between gap-3">
                <h2>图片对话</h2>
                <span className="creation-arrow">
                  <ArrowUpRight className="size-4" />
                </span>
              </div>
              <p>生成、参考、局部重绘，在对话中雕琢每个细节。</p>
              <span className="creation-meta">OpenAI · Gemini · xAI</span>
            </div>
          </button>
          <button type="button" className="creation-card video-creation" onClick={onNewVideo}>
            <div className="creation-art film-art" aria-hidden="true">
              <span className="film-frame frame-back" />
              <span className="film-frame frame-front">
                <Video className="size-7" />
              </span>
              <span className="film-timeline">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="art-caption">
                <Video className="size-3.5" /> 让故事流动起来
              </span>
            </div>
            <div className="creation-card-copy">
              <div className="flex items-center justify-between gap-3">
                <h2>视频对话</h2>
                <span className="creation-arrow">
                  <ArrowUpRight className="size-4" />
                </span>
              </div>
              <p>描述镜头与动作，把静止的灵感延展成故事。</p>
              <span className="creation-meta">Seedance · xAI</span>
            </div>
          </button>
        </div>
        <p className="welcome-note">
          <Layers3 className="size-4 shrink-0" /> 每段对话独立记录，让创作井然有序。
        </p>
      </div>
    </div>
  )
}
