import { beforeEach, describe, expect, it } from 'vitest'

import { defaultSettings } from '../storage/settings'
import { useSettingsStore } from './settings-store'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ settings: structuredClone(defaultSettings) })
})

describe('settings store key inheritance', () => {
  it('promotes the first format key to the global key', () => {
    useSettingsStore.getState().setFormatKeyOverride('xaiVideo', 'first-key')
    const settings = useSettingsStore.getState().settings
    expect(settings.globalApiKey).toBe('first-key')
    expect(settings.formats.xaiVideo.keyOverride).toBeNull()
  })

  it('stores later format keys as overrides', () => {
    useSettingsStore.getState().setGlobalApiKey('global')
    useSettingsStore.getState().setFormatKeyOverride('openaiImage', 'openai')
    expect(useSettingsStore.getState().settings.formats.openaiImage.keyOverride).toBe('openai')
  })
})
