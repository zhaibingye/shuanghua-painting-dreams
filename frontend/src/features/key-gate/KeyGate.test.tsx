import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { defaultSettings } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'
import { KeyGate } from './KeyGate'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSettingsStore.setState({ settings: structuredClone(defaultSettings) })
})

describe('KeyGate', () => {
  it('blocks the application when no key exists and can be ignored for the session', async () => {
    const user = userEvent.setup()
    render(
      <KeyGate>
        <div>工作台内容</div>
      </KeyGate>,
    )

    expect(screen.getByText('欢迎使用霜华绘梦')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '暂时忽略' }))
    expect(screen.queryByText('欢迎使用霜华绘梦')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('shuanghua.key-gate.ignored')).toBe('true')
  })

  it('saves the first entered key as the global key', async () => {
    const user = userEvent.setup()
    render(<KeyGate><div>工作台内容</div></KeyGate>)
    await user.type(screen.getByLabelText('API Key'), 'new-key')
    await user.click(screen.getByRole('button', { name: '保存 Key 并进入' }))
    expect(useSettingsStore.getState().settings.globalApiKey).toBe('new-key')
  })
})
