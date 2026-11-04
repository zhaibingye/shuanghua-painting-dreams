import { beforeEach, describe, expect, it } from 'vitest'

import {
  defaultSettings,
  effectiveKey,
  hasAnyKey,
  loadSettings,
  saveSettings,
} from './settings'

beforeEach(() => localStorage.clear())

describe('settings storage', () => {
  it('uses the global key when a format has no override', () => {
    const settings = structuredClone(defaultSettings)
    settings.globalApiKey = 'global-key'
    expect(effectiveKey(settings, 'openaiImage')).toBe('global-key')
  })

  it('prefers a format-specific key', () => {
    const settings = structuredClone(defaultSettings)
    settings.globalApiKey = 'global-key'
    settings.formats.xaiImage.keyOverride = 'xai-key'
    expect(effectiveKey(settings, 'xaiImage')).toBe('xai-key')
  })

  it('detects any configured key', () => {
    const settings = structuredClone(defaultSettings)
    expect(hasAnyKey(settings)).toBe(false)
    settings.formats.byteDanceVideo.keyOverride = 'byte-key'
    expect(hasAnyKey(settings)).toBe(true)
  })

  it('round-trips validated settings and recovers from corruption', () => {
    const settings = structuredClone(defaultSettings)
    settings.globalApiKey = 'saved'
    saveSettings(settings)
    expect(loadSettings().globalApiKey).toBe('saved')
    expect(loadSettings().formats.openaiResponsesImage.modelId).toBe('gpt-5.6-luna')
    localStorage.setItem('shuanghua.settings.v2', '{broken')
    expect(loadSettings().globalApiKey).toBe('')
  })

  it('migrates v2 keys and models without discarding existing configuration', () => {
    const legacy = JSON.parse(JSON.stringify(defaultSettings)) as Record<string, unknown>
    legacy.schemaVersion = 2
    const formats = legacy.formats as Record<string, Record<string, unknown>>
    delete formats.byteDanceImage
    for (const format of Object.values(formats)) delete format.models
    legacy.globalApiKey = 'existing-global'
    const gemini = formats.googleGeminiImage
    if (!gemini) throw new Error('缺少 Gemini 测试配置')
    gemini.modelId = 'custom-gemini'
    gemini.defaults = { thinkingLevel: 'Off', aspectRatio: '16:9' }
    const openai = formats.openaiImage
    if (!openai) throw new Error('缺少 OpenAI 测试配置')
    openai.keyOverride = 'existing-override'
    localStorage.setItem('shuanghua.settings.v2', JSON.stringify(legacy))

    const loaded = loadSettings()
    expect(loaded.schemaVersion).toBe(3)
    expect(loaded.globalApiKey).toBe('existing-global')
    expect(loaded.formats.openaiImage.keyOverride).toBe('existing-override')
    expect(loaded.formats.googleGeminiImage.models).toEqual(['custom-gemini'])
    expect(loaded.formats.googleGeminiImage.defaults.thinkingLevel).toBe('MINIMAL')
    expect(loaded.formats.byteDanceImage.modelId).toBeTruthy()
  })

  it('preserves model lists and an explicitly empty independent key', () => {
    const settings = structuredClone(defaultSettings)
    settings.formats.openaiImage.models.push('custom-image')
    settings.formats.openaiImage.modelId = 'custom-image'
    settings.globalApiKey = 'global'
    settings.formats.openaiImage.keyOverride = ''
    saveSettings(settings)
    const loaded = loadSettings()
    expect(loaded.formats.openaiImage.models).toEqual(['gpt-image-2', 'custom-image'])
    expect(effectiveKey(loaded, 'openaiImage')).toBe('')
  })
})
