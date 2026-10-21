import type { components } from '../../api/generated/schema'

type ProviderMetadata = components['schemas']['ProviderMetadata']

export const BYTE_DANCE_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p', '4k'] as const
export type ByteDanceVideoResolution = (typeof BYTE_DANCE_VIDEO_RESOLUTIONS)[number]

export const XAI_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const

// Official API limits verified 2026-10-21:
// https://console.volcengine.com/ark/region:cn-beijing/docs/create-video-generation-task-api

const SEEDANCE_2_0_CAPABILITIES: Record<string, unknown> = {
  durationMin: 4,
  durationMax: 15,
  automaticDuration: true,
  resolutions: ['480p', '720p', '1080p', '4k'],
  aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'],
  generateAudio: true,
  cameraFixed: false,
  serviceTiers: ['default'],
  serviceTierParameter: false,
  webSearch: true,
  returnLastFrame: true,
}

const SEEDANCE_2_5_CAPABILITIES: Record<string, unknown> = {
  ...SEEDANCE_2_0_CAPABILITIES,
  durationMax: 30,
  resolutions: ['480p', '720p', '1080p'],
  defaultDuration: -1,
  frameAspectRatios: ['adaptive'],
}

const SEEDANCE_2_0_FAST_CAPABILITIES: Record<string, unknown> = {
  ...SEEDANCE_2_0_CAPABILITIES,
  resolutions: ['480p', '720p'],
}

const SEEDANCE_1_5_PRO_CAPABILITIES: Record<string, unknown> = {
  durationMin: 4,
  durationMax: 12,
  automaticDuration: true,
  resolutions: ['480p', '720p', '1080p'],
  generateAudio: true,
  cameraFixed: true,
  serviceTiers: ['default', 'flex'],
  serviceTierParameter: true,
  webSearch: false,
}

const SEEDANCE_1_0_LITE_CAPABILITIES: Record<string, unknown> = {
  durationMin: 2,
  durationMax: 12,
  automaticDuration: false,
  resolutions: ['480p', '720p'],
  generateAudio: false,
  cameraFixed: true,
  serviceTiers: ['default', 'flex'],
  serviceTierParameter: true,
  webSearch: false,
}

const SEEDANCE_1_0_CAPABILITIES: Record<string, unknown> = {
  defaultResolution: '1080p',
  durationMin: 2,
  durationMax: 12,
  automaticDuration: false,
  resolutions: ['480p', '720p', '1080p'],
  generateAudio: false,
  cameraFixed: true,
  serviceTiers: ['default', 'flex'],
  serviceTierParameter: true,
  webSearch: false,
}

const BYTE_DANCE_GENERIC_CAPABILITIES: Record<string, unknown> = {
  durationMin: 2,
  durationMax: 15,
  automaticDuration: false,
  resolutions: ['480p', '720p'],
  generateAudio: false,
  cameraFixed: false,
  serviceTiers: ['default'],
  serviceTierParameter: false,
  webSearch: false,
}

export function resolveModelCapabilities(options: {
  apiFormat: string | undefined
  modelId: string | undefined
  provider: ProviderMetadata | undefined
}): Record<string, unknown> | undefined {
  const { apiFormat, modelId, provider } = options
  if (!modelId) return undefined
  if ((provider?.apiFormat ?? apiFormat) === 'byteDanceVideo') {
    return resolveByteDanceVideoCapabilities(modelId)
  }
  return provider?.knownModels?.[modelId]
}

export function resolveByteDanceVideoCapabilities(modelId: string): Record<string, unknown> {
  const capabilities = cloneCapabilities(byteDanceFamilyCapabilities(modelId))
  return {
    defaultDuration: 5,
    defaultResolution: '720p',
    defaultGenerateAudio: capabilities.generateAudio,
    seed: capabilities.cameraFixed,
    ...capabilities,
  }
}

export function byteDanceResolutionsForModel(modelId: string): ByteDanceVideoResolution[] {
  const allowed = stringList(resolveByteDanceVideoCapabilities(modelId).resolutions)
  const resolved = BYTE_DANCE_VIDEO_RESOLUTIONS.filter((item) => allowed.includes(item))
  return resolved.length > 0 ? [...resolved] : ['720p']
}

export function clampByteDanceResolution(
  resolution: unknown,
  modelId: string,
): ByteDanceVideoResolution {
  const allowed = byteDanceResolutionsForModel(modelId)
  return typeof resolution === 'string' && allowed.includes(resolution as ByteDanceVideoResolution)
    ? (resolution as ByteDanceVideoResolution)
    : resolveByteDanceVideoCapabilities(modelId).defaultResolution as ByteDanceVideoResolution
}

export function normalizeByteDanceOptions(
  options: Record<string, unknown>,
  modelId: string,
): Record<string, unknown> {
  const capabilities = resolveByteDanceVideoCapabilities(modelId)
  const duration = options.duration
  const validDuration = typeof duration === 'number' && Number.isInteger(duration) && (
    (duration === -1 && capabilities.automaticDuration === true) ||
    (duration >= Number(capabilities.durationMin) && duration <= Number(capabilities.durationMax))
  )
  return {
    ...options,
    duration: validDuration ? duration : capabilities.defaultDuration,
    resolution: clampByteDanceResolution(options.resolution, modelId),
    generateAudio: capabilities.generateAudio === true && (
      typeof options.generateAudio === 'boolean' ? options.generateAudio : capabilities.defaultGenerateAudio
    ),
  }
}

function byteDanceFamilyCapabilities(modelId: string): Record<string, unknown> {
  if (modelId.startsWith('doubao-seedance-2-5-')) return SEEDANCE_2_5_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-2-0-fast-') || modelId.startsWith('doubao-seedance-2-0-mini-')) return SEEDANCE_2_0_FAST_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-2-0-')) return SEEDANCE_2_0_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-1-5-pro-')) return SEEDANCE_1_5_PRO_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-1-0-lite-')) return SEEDANCE_1_0_LITE_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-1-0-')) return SEEDANCE_1_0_CAPABILITIES
  return BYTE_DANCE_GENERIC_CAPABILITIES
}

function cloneCapabilities(capabilities: Record<string, unknown>): Record<string, unknown> {
  return {
    ...capabilities,
    resolutions: stringList(capabilities.resolutions),
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
