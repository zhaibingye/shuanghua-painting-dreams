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
    patch: Partial<Pick<StoredSettings['formats'][ApiFormat], 'baseUrl' | 'defaults'>>,
  ) => void
  addModel: (format: ApiFormat, modelId: string) => void
  removeModel: (format: ApiFormat, modelId: string) => void
  setDefaultModel: (format: ApiFormat, modelId: string) => void
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
      return {
        settings: {
          ...state.settings,
          formats: {
            ...state.settings.formats,
            [format]: {
              ...state.settings.formats[format],
              keyOverride: value === null ? null : normalized,
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
          },
        },
      },
    })),
  addModel: (format, value) => set((state) => {
    const modelId = value.trim()
    if (!modelId || /[\s/?#\\]/.test(modelId)) throw new Error('模型 ID 不能包含空白或路径字符。')
    const current = state.settings.formats[format]
    if (current.models.includes(modelId)) throw new Error('模型已在列表中。')
    return { settings: { ...state.settings, formats: { ...state.settings.formats,
      [format]: { ...current, models: [...current.models, modelId] } } } }
  }),
  removeModel: (format, modelId) => set((state) => {
    const current = state.settings.formats[format]
    const models = current.models.filter((item) => item !== modelId)
    const [firstModel] = models
    if (!firstModel) throw new Error('每个格式至少保留一个模型。')
    return { settings: { ...state.settings, formats: { ...state.settings.formats,
      [format]: { ...current, models, modelId: current.modelId === modelId ? firstModel : current.modelId } } } }
  }),
  setDefaultModel: (format, modelId) => set((state) => {
    const current = state.settings.formats[format]
    if (!current.models.includes(modelId)) throw new Error('请先将模型添加到列表。')
    return { settings: { ...state.settings, formats: { ...state.settings.formats,
      [format]: { ...current, modelId } } } }
  }),
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
