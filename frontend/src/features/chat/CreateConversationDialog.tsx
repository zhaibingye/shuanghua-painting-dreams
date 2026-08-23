import * as Dialog from '@radix-ui/react-dialog'
import { Image, MessageSquarePlus, Video, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { FieldShell, Input, Select } from '../../components/ui/Field'
import { putConversation, type StoredConversation } from '../../storage/db'
import {
  apiFormatLabels,
  imageApiFormats,
  type ApiFormat,
  type MediaKind,
  videoApiFormats,
} from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'

export function CreateConversationDialog({
  open,
  initialKind = 'image',
  onOpenChange,
  onCreated,
}: {
  open: boolean
  initialKind?: MediaKind
  onOpenChange: (open: boolean) => void
  onCreated: (conversation: StoredConversation) => void
}) {
  const settings = useSettingsStore((state) => state.settings)
  const setActiveImageFormat = useSettingsStore((state) => state.setActiveImageFormat)
  const setActiveVideoFormat = useSettingsStore((state) => state.setActiveVideoFormat)
  const [kind, setKind] = useState<MediaKind>(initialKind)
  const [format, setFormat] = useState<ApiFormat>(settings.activeImageFormat)
  const selectedSettings = settings.formats[format]
  const [modelId, setModelId] = useState(selectedSettings.modelId)

  useEffect(() => {
    if (!open) return
    setKind(initialKind)
    const nextFormat =
      initialKind === 'image' ? settings.activeImageFormat : settings.activeVideoFormat
    setFormat(nextFormat)
    setModelId(settings.formats[nextFormat].modelId)
  }, [initialKind, open, settings])

  const changeKind = (nextKind: MediaKind) => {
    setKind(nextKind)
    const nextFormat =
      nextKind === 'image' ? settings.activeImageFormat : settings.activeVideoFormat
    setFormat(nextFormat)
    setModelId(settings.formats[nextFormat].modelId)
  }

  const changeFormat = (nextFormat: ApiFormat) => {
    setFormat(nextFormat)
    setModelId(settings.formats[nextFormat].modelId)
  }

  const create = async () => {
    const now = new Date().toISOString()
    const connection = settings.formats[format]
    const conversation: StoredConversation = {
      id: `conv_${crypto.randomUUID()}`,
      title: kind === 'image' ? '新图片对话' : '新视频对话',
      mediaKind: kind,
      apiFormat: format,
      baseUrl: connection.baseUrl,
      modelId: modelId.trim() || connection.modelId,
      activeImageAssetId: null,
      createdAt: now,
      updatedAt: now,
    }
    await putConversation(conversation)
    if (kind === 'image') setActiveImageFormat(format as (typeof imageApiFormats)[number])
    else setActiveVideoFormat(format as (typeof videoApiFormats)[number])
    onOpenChange(false)
    onCreated(conversation)
  }

  const formats = kind === 'image' ? imageApiFormats : videoApiFormats

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--ds-bg-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)] p-6 shadow-[var(--ds-shadow-popup)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
                <MessageSquarePlus className="size-5 text-[var(--ds-brand-text)]" />
                开启新对话
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--ds-text-secondary)]">
                API 格式和模型会固定在当前对话中。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" icon={<X className="size-4" />} aria-label="关闭" />
            </Dialog.Close>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-1">
            <Button variant={kind === 'image' ? 'primary' : 'ghost'} className="rounded-full" icon={<Image className="size-4" />} onClick={() => changeKind('image')}>图片对话</Button>
            <Button variant={kind === 'video' ? 'primary' : 'ghost'} className="rounded-full" icon={<Video className="size-4" />} onClick={() => changeKind('video')}>视频对话</Button>
          </div>

          <div className="mt-5 grid gap-4">
            <FieldShell label="API 格式">
              <Select value={format} onChange={(event) => changeFormat(event.target.value as ApiFormat)}>
                {formats.map((item) => <option key={item} value={item}>{apiFormatLabels[item]}</option>)}
              </Select>
            </FieldShell>
            <FieldShell label="模型 ID">
              <Input value={modelId} onChange={(event) => setModelId(event.target.value)} />
            </FieldShell>
            <div className="rounded-xl bg-[var(--ds-bg-hover)] p-3 text-xs text-[var(--ds-text-secondary)]">
              Base URL：<span className="break-all">{selectedSettings.baseUrl}</span>
            </div>
          </div>

          <Button className="mt-6 w-full rounded-full" size="lg" onClick={() => void create()}>
            创建对话
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
