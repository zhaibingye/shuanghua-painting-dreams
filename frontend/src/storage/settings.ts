import { z } from 'zod'

import catalog from '../api/generated/provider-catalog.json'
import { defaultImageOptions } from '../api/image-options'

export const imageApiFormats = [
  'googleGeminiImage',
  'openaiImage',
  'openaiResponsesImage',
  'xaiImage',
  'byteDanceImage',
] as const
export const videoApiFormats = ['byteDanceVideo', 'xaiVideo'] as const
export const apiFormats = [...imageApiFormats, ...videoApiFormats] as const

export type ImageApiFormat = (typeof imageApiFormats)[number]
export type VideoApiFormat = (typeof videoApiFormats)[number]
export type ApiFormat = (typeof apiFormats)[number]
export type ThemeMode = 'system' | 'light' | 'dark'
export type MediaKind = 'image' | 'video'

export const apiFormatLabels = Object.fromEntries(
  catalog.providers.map((provider) => [provider.apiFormat, provider.displayName]),
) as Record<ApiFormat, string>

export type FormatSettings = {
  baseUrl: string
  modelId: string
  models: string[]
  keyOverride: string | null
  defaults: Record<string, unknown>
}

export type StoredSettings = {
  schemaVersion: 3
  appearance: { theme: ThemeMode }
  globalApiKey: string
  activeImageFormat: ImageApiFormat
  activeVideoFormat: VideoApiFormat
  recentVoiceIds: string[]
  formats: Record<ApiFormat, FormatSettings>
}

export const defaultSettings: StoredSettings = {
  schemaVersion: 3,
  appearance: { theme: 'system' },
  globalApiKey: '',
  activeImageFormat: 'openaiResponsesImage',
  activeVideoFormat: 'byteDanceVideo',
  recentVoiceIds: [],
  formats: Object.fromEntries(catalog.providers.map((provider): [string, FormatSettings] => [provider.apiFormat, {
    baseUrl: provider.defaultBaseUrl,
    modelId: provider.defaultModelId,
    models: [provider.defaultModelId],
    keyOverride: null,
    defaults: provider.defaultOptions,
  }])) as Record<ApiFormat, FormatSettings>,
}

const formatSettingsSchema = z.object({
  baseUrl: z.string().min(1),
  modelId: z.string().min(1),
  models: z.array(z.string().trim().min(1)).min(1).optional(),
  keyOverride: z.string().nullable(),
  defaults: z.record(z.string(), z.unknown()),
})

const settingsSchema = z.object({
  schemaVersion: z.union([z.literal(2), z.literal(3)]),
  appearance: z.object({ theme: z.enum(['system', 'light', 'dark']) }),
  globalApiKey: z.string(),
  activeImageFormat: z.enum(imageApiFormats),
  activeVideoFormat: z.enum(videoApiFormats),
  recentVoiceIds: z.array(z.string()).max(20).default([]),
  formats: z.partialRecord(z.enum(apiFormats), formatSettingsSchema),
})

const storageKey = 'shuanghua.settings.v2'

export function loadSettings(): StoredSettings {
  const raw = localStorage.getItem(storageKey)
  if (raw === null) return structuredClone(defaultSettings)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return structuredClone(defaultSettings) }
  const result = settingsSchema.safeParse(parsed)
  if (!result.success) return structuredClone(defaultSettings)
  const stored = result.data
  const settings = { ...structuredClone(defaultSettings), ...stored, schemaVersion: 3 as const,
    formats: structuredClone(defaultSettings.formats) }
  for (const format of apiFormats) {
    const current = stored.formats[format]
    if (!current) continue
    const defaults = { ...settings.formats[format].defaults, ...current.defaults }
    if (stored.schemaVersion === 2 && format === 'googleGeminiImage') {
      const legacy: Record<string, string> = { High: 'HIGH', Low: 'LOW', Off: 'MINIMAL' }
      const level = String(defaults.thinkingLevel)
      defaults.thinkingLevel = legacy[level] ?? level
    }
    settings.formats[format] = { ...current, defaults,
      models: [...new Set([...(current.models ?? []), current.modelId])] }
  }
  return settings
}

export function optionsForFormat(settings: StoredSettings, format: ApiFormat): Record<string, unknown> {
  const stored = settings.formats[format].defaults
  if (!isImageFormat(format)) return { ...stored }
  const defaults = defaultImageOptions(format)
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, stored[key] ?? defaults[key]]))
}

export function saveSettings(settings: StoredSettings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings))
}

export function effectiveKey(settings: StoredSettings, format: ApiFormat): string {
  return settings.formats[format].keyOverride?.trim() ?? settings.globalApiKey.trim()
}

export function hasAnyKey(settings: StoredSettings): boolean {
  if (settings.globalApiKey.trim()) return true
  return apiFormats.some((format) => Boolean(settings.formats[format].keyOverride?.trim()))
}

export function isImageFormat(format: ApiFormat): format is ImageApiFormat {
  return (imageApiFormats as readonly string[]).includes(format)
}

export function mediaKindForFormat(format: ApiFormat): MediaKind {
  return isImageFormat(format) ? 'image' : 'video'
}
