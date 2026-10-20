import { ImagePlus, Link2, Trash2, X } from 'lucide-react'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
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
  onProcessingChange,
}: {
  images: DraftImage[]
  maxImages: number
  disabled?: boolean
  onChange: (images: DraftImage[]) => void
  onProcessingChange?: (processing: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showUrl, setShowUrl] = useState(false)
  const [url, setUrl] = useState('')
  const [processing, setProcessing] = useState(false)
  const latest = useRef({ images, maxImages, disabled, onChange })
  useEffect(() => {
    latest.current = { images, maxImages, disabled, onChange }
  }, [images, maxImages, disabled, onChange])
  const mounted = useRef(true)
  const processingRef = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      onProcessingChange?.(false)
    }
  }, [onProcessingChange])

  const chooseFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (disabled || processingRef.current) return
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    const available = Math.max(0, maxImages - images.length)
    if (available === 0) {
      toast.error(`当前格式最多支持 ${maxImages} 张图片`)
      return
    }
    if (files.length === 0) return
    processingRef.current = true
    setProcessing(true)
    onProcessingChange?.(true)
    try {
      const prepared = await Promise.all(
        files.slice(0, available).map(async (file) => {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            throw new Error(`${file.name} 不是支持的 PNG、JPEG 或 WebP 图片。`)
          }
          if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} 超过 50MB 大小限制。`)
          const processed = await fileToDataUrl(file)
          return { file, processed }
        }),
      )
      if (!mounted.current || latest.current.disabled) return
      const remaining = Math.max(0, latest.current.maxImages - latest.current.images.length)
      const next: DraftImage[] = prepared.slice(0, remaining).map(({ file, processed }) => ({
        id: crypto.randomUUID(),
        kind: 'file',
        file,
        previewUrl: URL.createObjectURL(file),
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
      }))
      latest.current.onChange([...latest.current.images, ...next])
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : '图片处理失败')
    } finally {
      processingRef.current = false
      if (mounted.current) {
        setProcessing(false)
        onProcessingChange?.(false)
      }
    }
  }

  const addUrl = () => {
    if (disabled || processing) return
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
    if (disabled || processing) return
    const image = images.find((item) => item.id === id)
    if (image?.kind === 'file') URL.revokeObjectURL(image.previewUrl)
    onChange(images.filter((item) => item.id !== id))
  }

  return (
    <div className="grid min-w-0 gap-2">
      {images.length > 0 ? (
        <div className="ds-scroll flex min-w-0 gap-2 overflow-x-auto pb-1">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]"
            >
              {image.kind === 'file' ? (
                <img
                  src={image.previewUrl}
                  alt={image.file.name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center p-2 text-center text-[10px] leading-4 text-[var(--ds-text-tertiary)]">
                  <Link2 className="mb-1 size-4" />
                  URL
                </div>
              )}
              <button
                type="button"
                aria-label="删除附件"
                disabled={disabled || processing}
                className="attachment-remove absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white transition disabled:opacity-40"
                onClick={() => remove(image.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {showUrl ? (
        <div className="flex min-w-0 gap-2 rounded-xl bg-[var(--ds-bg-hover)] p-2">
          <Input
            aria-label="图片 URL 地址"
            disabled={disabled || processing}
            className="h-9 flex-1"
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
          <Button size="sm" disabled={disabled || processing} onClick={addUrl}>
            添加
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowUrl(false)}
            icon={<Trash2 className="size-4" />}
            aria-label="取消 URL"
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <input
          ref={inputRef}
          className="sr-only"
          aria-label="添加本地参考图片"
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
          disabled={disabled || processing || images.length >= maxImages}
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
