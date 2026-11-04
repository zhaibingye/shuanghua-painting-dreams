import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, KeyRound, Snowflake } from 'lucide-react'
import { type ReactNode, type SyntheticEvent, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { hasAnyKey } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'

const ignoredSessionKey = 'shuanghua.key-gate.ignored'

export function KeyGate({ children }: { children: ReactNode }) {
  const settings = useSettingsStore((state) => state.settings)
  const setGlobalApiKey = useSettingsStore((state) => state.setGlobalApiKey)
  const [key, setKey] = useState('')
  const [ignored, setIgnored] = useState(
    () => sessionStorage.getItem(ignoredSessionKey) === 'true',
  )
  const open = !hasAnyKey(settings) && !ignored

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!key.trim()) return
    setGlobalApiKey(key.trim())
  }

  const ignore = () => {
    sessionStorage.setItem(ignoredSessionKey, 'true')
    setIgnored(true)
  }

  return (
    <>
      {children}
      <Dialog.Root open={open}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-[var(--ds-bg-overlay)] backdrop-blur-[2px]" />
          <Dialog.Content
            className="ds-modal ds-key-dialog z-[100]"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-[var(--ds-brand-primary)] text-white">
                <Snowflake className="size-6" />
              </span>
              <div>
                <Dialog.Title className="text-xl font-semibold">欢迎使用霜华绘梦</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[var(--ds-text-secondary)]">
                  填写 API Key 后即可开始对话式图片与视频创作。
                </Dialog.Description>
              </div>
            </div>

            <form className="grid gap-4" onSubmit={submit}>
              <Input
                aria-label="API Key"
                autoComplete="off"
                placeholder="填写从 www.shapi.vip 获取的 Key"
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
              <Button className="w-full rounded-full" size="lg" type="submit" icon={<KeyRound className="size-4" />}>
                保存 Key 并进入
              </Button>
            </form>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" className="rounded-full" onClick={() => window.open('https://www.shapi.vip', '_blank', 'noopener,noreferrer')} icon={<ArrowUpRight className="size-4" />}>前往注册</Button>
              <Button variant="ghost" className="rounded-full" onClick={ignore}>暂时忽略</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
