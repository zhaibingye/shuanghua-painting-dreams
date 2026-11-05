import * as Dialog from '@radix-ui/react-dialog'
import { Database, KeyRound, Plus, RotateCcw, Settings, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { OPENAI_IMAGE_MODELS } from '../chat/openai-image-options'

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
  const addModel = useSettingsStore((state) => state.addModel)
  const removeModel = useSettingsStore((state) => state.removeModel)
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const resetSettings = useSettingsStore((state) => state.resetSettings)
  const [format, setFormat] = useState<ApiFormat>(settings.activeImageFormat)
  const [modelInput, setModelInput] = useState('')
  const overrideEnabled = settings.formats[format].keyOverride !== null
  const [storage, setStorage] = useState<StorageEstimate | null>()
  const selected = settings.formats[format]
  const inherited = effectiveKey(settings, format)

  useEffect(() => {
    if (!open) return
    void estimateStorage().then(setStorage)
  }, [open])

  const storageText = useMemo(() => {
    if (storage === undefined) return '正在读取…'
    if (storage === null) return '当前浏览器未提供容量统计'
    return `${formatBytes(storage.usage ?? 0)} / ${formatBytes(storage.quota ?? 0)}`
  }, [storage])

  const clearAll = async () => {
    if (!window.confirm('确定清空全部对话、图片和视频任务吗？')) return
    await clearWorkspace()
    toast.success('本地工作区已清空')
    setStorage(await estimateStorage())
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[var(--ds-bg-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="ds-modal ds-settings-dialog z-[70]">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--ds-border-light)] px-6">
            <div className="flex items-center gap-2">
              <Settings className="size-5 text-[var(--ds-brand-text)]" />
              <Dialog.Title className="text-lg font-semibold">设置</Dialog.Title>
              <Dialog.Description className="sr-only">管理 API 连接、模型、外观和本地数据。</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" icon={<X className="size-4" />} aria-label="关闭设置" />
            </Dialog.Close>
          </header>

          <div className="settings-body ds-scroll">
            <section className="grid gap-4">
              <div className="flex items-center gap-3">
                <KeyRound className="size-5 text-[var(--ds-brand-text)]" />
                <div>
                  <h2 className="font-semibold">全局 API Key</h2>
                  <p className="text-xs text-[var(--ds-text-secondary)]">未设置独立 Key 的格式会自动继承。</p>
                </div>
              </div>
              <FieldShell label="全局 Key">
                <Input aria-label="全局 Key" autoComplete="off" type="password" value={settings.globalApiKey} onChange={(event) => setGlobalApiKey(event.target.value)} placeholder="填写 API 服务商提供的 Key" />
              </FieldShell>
            </section>

            <div className="my-6 h-px bg-[var(--ds-border-light)]" />

            <section className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold">API 格式配置</h2>
                  <p className="mt-1 text-xs text-[var(--ds-text-secondary)]">为每种格式维护模型列表和默认模型，新对话只需选择格式。</p>
                </div>
                <Select aria-label="API 格式配置" className="w-full sm:w-auto sm:min-w-52" value={format} onChange={(event) => { setFormat(event.target.value as ApiFormat); setModelInput('') }}>
                  {apiFormats.map((item) => <option key={item} value={item}>{apiFormatLabels[item]}</option>)}
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldShell label="Base URL" hint={format === 'byteDanceImage' || format === 'byteDanceVideo' ? '官方地址走 /api/v3，其他走 /v1' : '自动追加 API 路径'}>
                  <Input aria-label="Base URL" value={selected.baseUrl} onChange={(event) => updateFormat(format, { baseUrl: event.target.value })} />
                </FieldShell>
                <FieldShell label="默认模型">
                  <Select aria-label="默认模型" value={selected.modelId} onChange={(event) => setDefaultModel(format, event.target.value)}>
                    {selected.models.map((model) => <option key={model} value={model}>{model}</option>)}
                  </Select>
                </FieldShell>
              </div>

              <div className="rounded-xl border border-[var(--ds-border-default)] p-4">
                <h3 className="mb-3 text-sm font-medium">模型列表</h3>
                <form className="flex gap-2" onSubmit={(event) => {
                  event.preventDefault()
                  try { addModel(format, modelInput); setModelInput('') }
                  catch (error) { toast.error(error instanceof Error ? error.message : '添加模型失败') }
                }}>
                  <Input aria-label="添加模型 ID" value={modelInput} onChange={(event) => setModelInput(event.target.value)} placeholder="输入模型 ID 或 Endpoint ID" list={format === 'openaiImage' ? 'openai-model-suggestions' : undefined} />
                  {format === 'openaiImage' ? <datalist id="openai-model-suggestions">{OPENAI_IMAGE_MODELS.map((model) => <option key={model} value={model} />)}</datalist> : null}
                  <Button type="submit" disabled={!modelInput.trim()} icon={<Plus className="size-4" />}>添加</Button>
                </form>
                <ul className="mt-3 grid gap-2">
                  {selected.models.map((model) => <li key={model} className="flex min-w-0 items-center gap-2 rounded-lg bg-[var(--ds-bg-hover)] px-3 py-2">
                    <span className="min-w-0 flex-1 break-all text-sm">{model}</span>
                    {selected.modelId === model ? <Badge>默认</Badge> : <Button size="sm" variant="ghost" onClick={() => setDefaultModel(format, model)}>设为默认</Button>}
                    <Button size="icon" variant="ghost" aria-label={`删除模型 ${model}`} disabled={selected.models.length === 1} icon={<Trash2 className="size-4" />} onClick={() => removeModel(format, model)} />
                  </li>)}
                </ul>
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
                      setFormatKeyOverride(format, event.target.checked ? '' : null)
                    }}
                  />
                </label>
                {overrideEnabled ? (
                  <Input aria-label="独立 Key" className="mt-4" autoComplete="off" type="password" value={selected.keyOverride ?? ''} onChange={(event) => setFormatKeyOverride(format, event.target.value)} placeholder="填写该格式独立 Key" />
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

async function estimateStorage(): Promise<StorageEstimate | null> {
  try {
    return await navigator.storage?.estimate() ?? null
  } catch {
    return null
  }
}

function formatBytes(value: number): string {
  if (value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB'] as const
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
