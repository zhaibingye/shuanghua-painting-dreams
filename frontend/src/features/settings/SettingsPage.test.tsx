import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { defaultSettings } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'
import { SettingsDialog } from './SettingsPage'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ settings: structuredClone(defaultSettings) })
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 1000 }) },
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'storage')
})

it('keeps a complete independent key scoped to its API format', async () => {
  const user = userEvent.setup()
  render(<SettingsDialog open onOpenChange={() => undefined} />)
  await user.click(screen.getByRole('checkbox', { name: /使用独立 Key/ }))
  const input = screen.getByLabelText('独立 Key')
  await user.type(input, 'complete-key')
  expect(input).toHaveValue('complete-key')
  await user.tab()

  expect(useSettingsStore.getState().settings.globalApiKey).toBe('')
  expect(useSettingsStore.getState().settings.formats.openaiImage.keyOverride).toBe('complete-key')
  expect(screen.getByLabelText('全局 Key')).toHaveValue('')
})


it('saves an independent key when the dialog closes with Escape', async () => {
  useSettingsStore.getState().setGlobalApiKey('global-key')
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  render(<SettingsDialog open onOpenChange={onOpenChange} />)
  await user.click(screen.getByRole('checkbox', { name: /使用独立 Key/ }))
  await user.type(screen.getByLabelText('独立 Key'), 'override-key')
  await user.keyboard('{Escape}')
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(useSettingsStore.getState().settings.formats.openaiImage.keyOverride).toBe('override-key')
})
