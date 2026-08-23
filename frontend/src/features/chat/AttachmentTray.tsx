import { ImagePlus, Link2, Trash2, X } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { isPublicHttpUrl } from '../../utils/url'
import { fileToDataUrl } from '../../workers/image-worker-client'
import type { DraftImage } from './image-turn'

export function AttachmentTray({
  images,
  maxImages,
  disabled = false,
  onChange,
}: {
  images: DraftImage[]
  maxImages: number
  disabled?: boolean
  onChange: (images: DraftImage[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showUrl, setShowUrl] = useState(false)
  const [url, setUrl] = useState('')
  const [processing, setProcessing] = useState(false)

  const chooseFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    const available = Math.max(0, maxImages - images.length)
    if (available === 0) {
      toast.error(`当前格式最多支持 ${maxImages} 张图片`)
      return
    }
    setProcessing(true)
    try {
      const next = await Promise.all(
        files.slice(0, available).map(async (file): Promise<DraftImage> => {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            throw new Error(`${file.name} 不是支持的 PNG、JPEG 或 WebP 图片。`)
          }
          const processed = await fileToDataUrl(file)
          return {
            id: crypto.randomUUID(),
            kind: 'file',
            file,
            previewUrl: URL.createObjectURL(file),
            dataUrl: processed.dataUrl,
            width: processed.width,
            height: processed.height,
          }
        }),
      )
      onChange([...images, ...next])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片处理失败')
    } finally {
      setProcessing(false)
    }
  }

  const addUrl = () => {
    const normalized = url.trim()
    if (!isPublicHttpUrl(normalized)) {
      toast.error('请输入有效的公网 HTTP/HTTPS 图片 URL')
      return
    }
    if (images.length >= maxImages) {
      toast.error(`当前格式最多支持 ${maxImages} 张图片`)
      return
    }
    onChange([...images, { id: crypto.randomUUID(), kind: 'url', url: normalized }])
    setUrl('')
    setShowUrl(false)
  }

  const remove = (id: string) => {
    const image = images.find((item) => item.id === id)
    if (image?.kind === 'file') URL.revokeObjectURL(image.previewUrl)
    onChange(images.filter((item) => item.id !== id))
  }

  return (
    <div className="grid gap-2">
      {images.length > 0 ? (
        <div className="ds-scroll flex gap-2 overflow-x-auto pb-1">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]"
            >
              {image.kind === 'file' ? (
                <img src={image.previewUrl} alt={image.file.name} className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center p-2 text-center text-[10px] leading-4 text-[var(--ds-text-tertiary)]">
                  <Link2 className="mb-1 size-4" />
                  URL
                </div>
              )}
              <button
                type="button"
                aria-label="删除附件"
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                onClick={() => remove(image.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {showUrl ? (
        <div className="flex gap-2 rounded-xl bg-[var(--ds-bg-hover)] p-2">
          <Input
            className="h-9"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/image.png"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addUrl()
              }
            }}
          />
          <Button size="sm" onClick={addUrl}>添加</Button>
          <Button size="icon" variant="ghost" onClick={() => setShowUrl(false)} icon={<Trash2 className="size-4" />} aria-label="取消 URL" />
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={disabled || processing || images.length >= maxImages}
          onChange={(event) => void chooseFiles(event)}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || processing || images.length >= maxImages}
          icon={<ImagePlus className="size-4" />}
          onClick={() => inputRef.current?.click()}
        >
          {processing ? '处理中…' : '本地图片'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || images.length >= maxImages}
          icon={<Link2 className="size-4" />}
          onClick={() => setShowUrl((value) => !value)}
        >
          图片 URL
        </Button>
        <span className="ml-auto text-xs text-[var(--ds-text-caption)]">
          {images.length}/{maxImages}
        </span>
      </div>
    </div>
  )
}
