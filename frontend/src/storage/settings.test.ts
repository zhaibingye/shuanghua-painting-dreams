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
})
