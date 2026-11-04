import { beforeEach, describe, expect, it } from 'vitest'

import { defaultSettings, loadSettings } from '../storage/settings'
import { useSettingsStore } from './settings-store'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ settings: structuredClone(defaultSettings) })
})

describe('settings store key inheritance', () => {
  it('keeps a format key independent when the global key is empty', () => {
    useSettingsStore.getState().setFormatKeyOverride('xaiVideo', 'first-key')
    const settings = useSettingsStore.getState().settings
    expect(settings.globalApiKey).toBe('')
    expect(settings.formats.xaiVideo.keyOverride).toBe('first-key')
  })

  it('stores later format keys as overrides', () => {
    useSettingsStore.getState().setGlobalApiKey('global')
    useSettingsStore.getState().setFormatKeyOverride('openaiImage', 'openai')
    expect(useSettingsStore.getState().settings.formats.openaiImage.keyOverride).toBe('openai')
  })
})

describe('model lists', () => {
  it('adds and selects models and repairs the default when it is removed', () => {
    const store = useSettingsStore.getState()
    store.addModel('openaiImage', ' custom-image ')
    store.setDefaultModel('openaiImage', 'custom-image')
    expect(useSettingsStore.getState().settings.formats.openaiImage.modelId).toBe('custom-image')
    store.removeModel('openaiImage', 'custom-image')
    expect(useSettingsStore.getState().settings.formats.openaiImage.modelId).toBe('gpt-image-2.5-sunburst')
  })

  it('rejects duplicates, invalid model IDs and removal of the final model', () => {
    const store = useSettingsStore.getState()
    expect(() => store.addModel('openaiImage', 'gpt-image-2.5-sunburst')).toThrow('已在列表')
    expect(() => store.addModel('openaiImage', 'model/path')).toThrow('路径字符')
    expect(() => store.removeModel('openaiImage', 'gpt-image-2.5-sunburst')).toThrow('至少保留一个')
    expect(() => store.setDefaultModel('openaiImage', 'missing')).toThrow('先将模型添加')
  })
})

describe('restoring default settings', () => {
  it('updates the live store and persisted settings', () => {
    const store = useSettingsStore.getState()
    store.setGlobalApiKey('old-key')
    store.setTheme('dark')
    store.setActiveImageFormat('openaiResponsesImage')
    store.updateFormat('openaiImage', { baseUrl: 'https://custom.example' })
    store.addModel('openaiImage', 'custom')
    store.setDefaultModel('openaiImage', 'custom')

    store.resetSettings()

    expect(useSettingsStore.getState().settings).toEqual(defaultSettings)
    expect(loadSettings()).toEqual(defaultSettings)
  })
})
