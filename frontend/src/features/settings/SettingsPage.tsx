import * as Dialog from '@radix-ui/react-dialog'
import { Database, KeyRound, RotateCcw, Settings, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { FieldShell, Input, Select } from '../../components/ui/Field'
import { clearWorkspace } from '../../storage/db'
import {
  apiFormatLabels,
  apiFormats,
  effectiveKey,
  type ApiFormat,
} from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const settings = useSettingsStore((state) => state.settings)
  const setGlobalApiKey = useSettingsStore((state) => state.setGlobalApiKey)
  const setFormatKeyOverride = useSettingsStore((state) => state.setFormatKeyOverride)
  const updateFormat = useSettingsStore((state) => state.updateFormat)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const resetSettings = useSettingsStore((state) => state.resetSettings)
  const [format, setFormat] = useState<ApiFormat>(settings.activeImageFormat)
  const [overrideEnabled, setOverrideEnabled] = useState(
    settings.formats[format].keyOverride !== null,
  )
  const [overrideDraft, setOverrideDraft] = useState(settings.formats[format].keyOverride ?? '')
  const overrideDirty = useRef(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const selected = settings.formats[format]
  const inherited = effectiveKey(settings, format)

  useEffect(() => {
    setOverrideEnabled(settings.formats[format].keyOverride !== null)
    setOverrideDraft(settings.formats[format].keyOverride ?? '')
    overrideDirty.current = false
  }, [format, settings.formats])

  useEffect(() => {
    if (!open) return
    void navigator.storage.estimate().then((estimate) => {
      setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 })
    })
  }, [open])

  const storageText = useMemo(() => {
    if (!storage) return '正在读取…'
    return `${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}`
  }, [storage])

  const commitOverride = () => {
    if (!overrideDirty.current) return
    overrideDirty.current = false
    setFormatKeyOverride(format, overrideDraft)
  }

  const clearAll = async () => {
    if (!window.confirm('确定清空全部对话、图片和视频任务吗？')) return
    await clearWorkspace()
    toast.success('本地工作区已清空')
    const estimate = await navigator.storage.estimate()
    setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 })
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) commitOverride()
      onOpenChange(nextOpen)
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[var(--ds-bg-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] flex max-h-[min(88vh,52rem)] w-[min(94vw,48rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)] shadow-[var(--ds-shadow-popup)]">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--ds-border-light)] px-6">
            <div className="flex items-center gap-2">
              <Settings className="size-5 text-[var(--ds-brand-text)]" />
              <Dialog.Title className="text-lg font-semibold">设置</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" icon={<X className="size-4" />} aria-label="关闭设置" />
            </Dialog.Close>
          </header>

          <div className="ds-scroll overflow-y-auto p-6">
            <section className="grid gap-4">
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-[var(--ds-brand-text)]" />
                <div>
                  <h2 className="font-semibold">全局 API Key</h2>
                  <p className="text-xs text-[var(--ds-text-secondary)]">未设置独立 Key 的格式会自动继承。</p>
                </div>
              </div>
              <FieldShell label="全局 Key">
                <Input aria-label="全局 Key" autoComplete="off" type="password" value={settings.globalApiKey} onChange={(event) => setGlobalApiKey(event.target.value)} placeholder="填写从 www.shapi.vip 获取的 Key" />
              </FieldShell>
            </section>

            <div className="my-6 h-px bg-[var(--ds-border-light)]" />

            <section className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold">API 格式配置</h2>
                  <p className="mt-1 text-xs text-[var(--ds-text-secondary)]">新对话会读取这里的连接信息和模型。</p>
                </div>
                <Select aria-label="API 格式配置" className="w-auto min-w-52" value={format} onChange={(event) => setFormat(event.target.value as ApiFormat)}>
                  {apiFormats.map((item) => <option key={item} value={item}>{apiFormatLabels[item]}</option>)}
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldShell label="Base URL" hint="自动追加 API 路径">
                  <Input value={selected.baseUrl} onChange={(event) => updateFormat(format, { baseUrl: event.target.value })} />
                </FieldShell>
                <FieldShell label="默认模型 ID">
                  <Input value={selected.modelId} onChange={(event) => updateFormat(format, { modelId: event.target.value })} />
                </FieldShell>
              </div>

              <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-4">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-medium">使用独立 Key</span>
                    <span className="text-xs text-[var(--ds-text-secondary)]">关闭时使用全局 Key。</span>
                  </span>
                  <input
                    className="size-4 accent-[var(--ds-brand-primary)]"
                    type="checkbox"
                    checked={overrideEnabled}
                    onChange={(event) => {
                      setOverrideEnabled(event.target.checked)
                      if (!event.target.checked) setFormatKeyOverride(format, null)
                    }}
                  />
                </label>
                {overrideEnabled ? (
                  <Input className="mt-4" autoComplete="off" type="password" aria-label="独立 Key" value={overrideDraft} onChange={(event) => { overrideDirty.current = true; setOverrideDraft(event.target.value) }} onBlur={commitOverride} placeholder="填写该格式独立 Key" />
                ) : (
                  <div className="mt-4"><Badge tone={inherited ? 'success' : 'warning'}>{inherited ? '正在使用全局 Key' : '当前没有可用 Key'}</Badge></div>
                )}
              </div>
            </section>

            <div className="my-6 h-px bg-[var(--ds-border-light)]" />

            <div className="grid gap-6 sm:grid-cols-2">
              <section className="grid content-start gap-4">
                <h2 className="font-semibold">外观</h2>
                <FieldShell label="主题">
                  <Select value={settings.appearance.theme} onChange={(event) => setTheme(event.target.value as 'system' | 'light' | 'dark')}>
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </Select>
                </FieldShell>
                <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={resetSettings}>恢复默认设置</Button>
              </section>

              <section className="grid content-start gap-4">
                <div className="flex items-center gap-2">
                  <Database className="size-5 text-[var(--ds-brand-text)]" />
                  <h2 className="font-semibold">浏览器存储</h2>
                </div>
                <p className="text-sm text-[var(--ds-text-secondary)]">当前估算使用量：{storageText}</p>
                <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void clearAll()}>清空全部对话</Button>
              </section>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function formatBytes(value: number): string {
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`
}
