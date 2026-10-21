import { z } from 'zod'

export const imageApiFormats = [
  'googleGeminiImage',
  'openaiImage',
  'openaiResponsesImage',
  'xaiImage',
] as const
export const videoApiFormats = ['byteDanceVideo', 'xaiVideo'] as const
export const apiFormats = [...imageApiFormats, ...videoApiFormats] as const

export type ImageApiFormat = (typeof imageApiFormats)[number]
export type VideoApiFormat = (typeof videoApiFormats)[number]
export type ApiFormat = (typeof apiFormats)[number]
export type ThemeMode = 'system' | 'light' | 'dark'
export type MediaKind = 'image' | 'video'

export const apiFormatLabels: Record<ApiFormat, string> = {
  googleGeminiImage: 'Google Gemini 图像',
  openaiImage: 'OpenAI Images',
  openaiResponsesImage: 'OpenAI Responses 图像',
  xaiImage: 'xAI 图像',
  byteDanceVideo: '字节 Seedance 视频',
  xaiVideo: 'xAI Grok 视频',
}

export type FormatSettings = {
  baseUrl: string
  modelId: string
  keyOverride: string | null
  defaults: Record<string, unknown>
}

export type StoredSettings = {
  schemaVersion: 2
  appearance: { theme: ThemeMode }
  globalApiKey: string
  activeImageFormat: ImageApiFormat
  activeVideoFormat: VideoApiFormat
  recentVoiceIds: string[]
  formats: Record<ApiFormat, FormatSettings>
}

export const defaultSettings: StoredSettings = {
  schemaVersion: 2,
  appearance: { theme: 'system' },
  globalApiKey: '',
  activeImageFormat: 'openaiImage',
  activeVideoFormat: 'byteDanceVideo',
  recentVoiceIds: [],
  formats: {
    googleGeminiImage: {
      baseUrl: 'https://www.shapi.vip',
      modelId: 'nano-banana-2',
      keyOverride: null,
      defaults: {
        aspectRatio: '1:1',
        imageSize: '1K',
        responseModalities: 'IMAGE',
        thinkingLevel: 'High',
        includeThoughts: false,
      },
    },
    openaiImage: {
      baseUrl: 'https://www.shapi.vip',
      modelId: 'gpt-image-2.5-sunburst',
      keyOverride: null,
      defaults: {
        count: 1,
        size: '1024x1024',
        quality: 'auto',
        outputFormat: 'png',
        outputCompression: 100,
        background: 'auto',
        moderation: 'auto',
        inputFidelity: 'auto',
        partialImages: 2,
      },
    },
    openaiResponsesImage: {
      baseUrl: 'https://www.shapi.vip',
      modelId: 'gpt-5.6-luna',
      keyOverride: null,
      defaults: {
        size: 'auto',
        quality: 'auto',
        outputFormat: 'png',
        outputCompression: 100,
        background: 'auto',
        moderation: 'auto',
        inputFidelity: 'auto',
        partialImages: 2,
      },
    },
    xaiImage: {
      baseUrl: 'https://www.shapi.vip',
      modelId: 'grok-imagine-image-2.0',
      keyOverride: null,
      defaults: {
        count: 1,
        aspectRatio: '1:1',
        resolution: '1k',
        quality: 'medium',
      },
    },
    byteDanceVideo: {
      baseUrl: 'https://www.shapi.vip',
      modelId: 'doubao-seedance-2-5-260628',
      keyOverride: null,
      defaults: {
        duration: -1,
        resolution: '720p',
        aspectRatio: 'adaptive',
        generateAudio: true,
        watermark: false,
        seed: -1,
        returnLastFrame: false,
        cameraFixed: false,
        serviceTier: 'default',
        webSearch: false,
      },
    },
    xaiVideo: {
      baseUrl: 'https://www.shapi.vip',
      modelId: 'grok-imagine-video-1.5',
      keyOverride: null,
      defaults: {
        duration: 8,
        resolution: '720p',
        aspectRatio: '16:9',
        voiceIds: [],
        extensionDuration: 6,
      },
    },
  },
}

const formatSettingsSchema = z.object({
  baseUrl: z.string().min(1),
  modelId: z.string().min(1),
  keyOverride: z.string().nullable(),
  defaults: z.record(z.string(), z.unknown()),
})

const settingsSchema = z.object({
  schemaVersion: z.literal(2),
  appearance: z.object({ theme: z.enum(['system', 'light', 'dark']) }),
  globalApiKey: z.string(),
  activeImageFormat: z.enum(imageApiFormats),
  activeVideoFormat: z.enum(videoApiFormats),
  recentVoiceIds: z.array(z.string()).max(20).default([]),
  formats: z.object({
    googleGeminiImage: formatSettingsSchema,
    openaiImage: formatSettingsSchema,
    openaiResponsesImage: formatSettingsSchema,
    xaiImage: formatSettingsSchema,
    byteDanceVideo: formatSettingsSchema,
    xaiVideo: formatSettingsSchema,
  }),
})

const storageKey = 'shuanghua.settings.v2'

export function loadSettings(): StoredSettings {
  const raw = localStorage.getItem(storageKey)
  if (raw === null) return structuredClone(defaultSettings)
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = settingsSchema.safeParse(parsed)
    if (result.success) return result.data
  } catch {
    // 未上线版本不迁移损坏或旧版设置，直接恢复新默认值。
  }
  return structuredClone(defaultSettings)
}

export function saveSettings(settings: StoredSettings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings))
}

export function effectiveKey(settings: StoredSettings, format: ApiFormat): string {
  const override = settings.formats[format].keyOverride?.trim() ?? ''
  return override.length > 0 ? override : settings.globalApiKey.trim()
}

export function hasAnyKey(settings: StoredSettings): boolean {
  if (settings.globalApiKey.trim()) return true
  return apiFormats.some((format) => Boolean(settings.formats[format].keyOverride?.trim()))
}

export function mediaKindForFormat(format: ApiFormat): MediaKind {
  return imageApiFormats.includes(format as ImageApiFormat) ? 'image' : 'video'
}
