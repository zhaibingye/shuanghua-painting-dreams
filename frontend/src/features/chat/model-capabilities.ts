import catalog from '../../api/generated/provider-catalog.json'
import type { components } from '../../api/generated/schema'

type ProviderMetadata = components['schemas']['ProviderMetadata']
type ByteDanceVideoOptions = components['schemas']['ByteDanceVideoOptions']
type ByteDanceVideoResolution = ByteDanceVideoOptions['resolution']

type ByteDanceVideoCapabilities = Readonly<{
  durationMin: number
  durationMax: number
  automaticDuration: boolean
  resolutions: readonly ByteDanceVideoResolution[]
  defaultDuration: number
  defaultResolution: ByteDanceVideoResolution
  generateAudio: boolean
  defaultGenerateAudio: boolean
  cameraFixed: boolean
  seed: boolean
  serviceTiers: readonly string[]
  serviceTierParameter: boolean
  webSearch: boolean
  aspectRatios?: readonly string[]
  frameAspectRatios?: readonly string[]
  returnLastFrame?: boolean
}>

// This generated table shares its prefix order and limits with the backend.
// Custom model IDs use the backend's generic model policy.
const modelCatalog = catalog.byteDanceVideoFamilies as {
  families: { prefixes: string[]; capabilities: ByteDanceVideoCapabilities }[]
  defaultCapabilities: ByteDanceVideoCapabilities
}

export const XAI_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const

export function resolveModelCapabilities(options: {
  apiFormat: string | undefined
  modelId: string | undefined
  provider: ProviderMetadata | undefined
}): Record<string, unknown> | undefined {
  const { apiFormat, modelId, provider } = options
  if (!modelId) return undefined
  if (apiFormat === 'byteDanceVideo') return resolveByteDanceVideoCapabilities(modelId)
  return provider?.knownModels?.[modelId]
}

export function resolveByteDanceVideoCapabilities(modelId: string): ByteDanceVideoCapabilities {
  const family = modelCatalog.families.find(({ prefixes }) =>
    prefixes.some((prefix) => modelId.startsWith(prefix)),
  )
  return family?.capabilities ?? modelCatalog.defaultCapabilities
}

export function normalizeByteDanceOptions(
  options: Record<string, unknown>,
  modelId: string,
): Record<string, unknown> & Required<Pick<ByteDanceVideoOptions, 'duration' | 'resolution' | 'generateAudio'>> {
  const capabilities = resolveByteDanceVideoCapabilities(modelId)
  const duration = options.duration
  const validDuration = typeof duration === 'number' && Number.isInteger(duration) && (
    (duration === -1 && capabilities.automaticDuration) ||
    (duration >= capabilities.durationMin && duration <= capabilities.durationMax)
  )
  const resolution = capabilities.resolutions.find((value) => value === options.resolution)
  return {
    ...options,
    duration: validDuration ? duration : capabilities.defaultDuration,
    resolution: resolution ?? capabilities.defaultResolution,
    generateAudio: capabilities.generateAudio && (
      typeof options.generateAudio === 'boolean' ? options.generateAudio : capabilities.defaultGenerateAudio
    ),
  }
}
