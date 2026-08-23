import type { components } from '../../api/generated/schema'

type ProviderMetadata = components['schemas']['ProviderMetadata']

export const BYTE_DANCE_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p', '4k'] as const
export type ByteDanceVideoResolution = (typeof BYTE_DANCE_VIDEO_RESOLUTIONS)[number]

export const XAI_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const

const SEEDANCE_SPECIAL_EDITION_SUFFIX = '-se'
const RESOLUTION_1080P = '1080p'

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

const SEEDANCE_2_0_FAST_CAPABILITIES: Record<string, unknown> = {
  durationMin: 4,
  durationMax: 15,
  automaticDuration: true,
  resolutions: ['480p', '720p'],
  generateAudio: true,
  cameraFixed: false,
  serviceTiers: ['default'],
  serviceTierParameter: false,
  webSearch: true,
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
  if (modelId.endsWith(SEEDANCE_SPECIAL_EDITION_SUFFIX)) {
    ensureResolution(capabilities, RESOLUTION_1080P)
  }
  return capabilities
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
    : '720p'
}

function byteDanceFamilyCapabilities(modelId: string): Record<string, unknown> {
  if (modelId.startsWith('doubao-seedance-2-0-fast-')) return SEEDANCE_2_0_FAST_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-2-0-')) return SEEDANCE_2_0_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-1-5-pro-')) return SEEDANCE_1_5_PRO_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-1-0-lite-')) return SEEDANCE_1_0_LITE_CAPABILITIES
  if (modelId.startsWith('doubao-seedance-1-0-')) return SEEDANCE_1_0_CAPABILITIES
  return BYTE_DANCE_GENERIC_CAPABILITIES
}

function ensureResolution(capabilities: Record<string, unknown>, resolution: string): void {
  const resolutions = stringList(capabilities.resolutions)
  if (!resolutions.includes(resolution)) {
    capabilities.resolutions = [...resolutions, resolution]
  }
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
