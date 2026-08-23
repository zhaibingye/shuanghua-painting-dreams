import { create } from 'zustand'

import {
  type ApiFormat,
  defaultSettings,
  type ImageApiFormat,
  loadSettings,
  saveSettings,
  type StoredSettings,
  type ThemeMode,
  type VideoApiFormat,
} from '../storage/settings'

type SettingsState = {
  settings: StoredSettings
  setGlobalApiKey: (value: string) => void
  setFormatKeyOverride: (format: ApiFormat, value: string | null) => void
  updateFormat: (
    format: ApiFormat,
    patch: Partial<Pick<StoredSettings['formats'][ApiFormat], 'baseUrl' | 'modelId' | 'defaults'>>,
  ) => void
  setActiveImageFormat: (format: ImageApiFormat) => void
  setActiveVideoFormat: (format: VideoApiFormat) => void
  setTheme: (theme: ThemeMode) => void
  addRecentVoiceId: (voiceId: string) => void
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: loadSettings(),
  setGlobalApiKey: (value) =>
    set((state) => ({
      settings: { ...state.settings, globalApiKey: value },
    })),
  setFormatKeyOverride: (format, value) =>
    set((state) => {
      const normalized = value?.trim() ?? ''
      if (!state.settings.globalApiKey.trim() && normalized) {
        return {
          settings: {
            ...state.settings,
            globalApiKey: normalized,
            formats: {
              ...state.settings.formats,
              [format]: { ...state.settings.formats[format], keyOverride: null },
            },
          },
        }
      }
      return {
        settings: {
          ...state.settings,
          formats: {
            ...state.settings.formats,
            [format]: {
              ...state.settings.formats[format],
              keyOverride: normalized || null,
            },
          },
        },
      }
    }),
  updateFormat: (format, patch) =>
    set((state) => ({
      settings: {
        ...state.settings,
        formats: {
          ...state.settings.formats,
          [format]: {
            ...state.settings.formats[format],
            ...patch,
            defaults: patch.defaults ?? state.settings.formats[format].defaults,
          },
        },
      },
    })),
  setActiveImageFormat: (activeImageFormat) =>
    set((state) => ({ settings: { ...state.settings, activeImageFormat } })),
  setActiveVideoFormat: (activeVideoFormat) =>
    set((state) => ({ settings: { ...state.settings, activeVideoFormat } })),
  setTheme: (theme) =>
    set((state) => ({
      settings: { ...state.settings, appearance: { theme } },
    })),
  addRecentVoiceId: (voiceId) =>
    set((state) => {
      const normalized = voiceId.trim()
      if (!normalized) return state
      const recentVoiceIds = [
        normalized,
        ...state.settings.recentVoiceIds.filter((item) => item !== normalized),
      ].slice(0, 20)
      return { settings: { ...state.settings, recentVoiceIds } }
    }),
  resetSettings: () => ({ settings: structuredClone(defaultSettings) }),
}))

useSettingsStore.subscribe((state) => {
  saveSettings(state.settings)
})
