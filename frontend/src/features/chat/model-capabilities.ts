import catalog from '../../api/generated/provider-catalog.json'
import type * as schemas from '../../api/generated/models'
import { defaultOptions, type Options } from '../../api/options'

type ByteDanceVideoOptions = schemas.ByteDanceVideoOptions
type ByteDanceVideoResolution = NonNullable<ByteDanceVideoOptions['resolution']>

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
  modes: readonly schemas.ByteDanceVideoGenerationRequest['mode'][]
  maxReferenceImages: number
  maxReferenceVideos: number
  maxReferenceAudios: number
  audioOnlyReference: boolean
  omniReferenceTaskType: boolean
  outputFormats: readonly string[]
  priority: boolean
}>

// This generated table shares its prefix order and limits with the backend.
// Custom model IDs use the backend's generic model policy.
const modelCatalog = catalog.byteDanceVideoFamilies as {
  families: { prefixes: string[]; capabilities: ByteDanceVideoCapabilities }[]
  defaultCapabilities: ByteDanceVideoCapabilities
}

type XAIVideoCapabilities = { resolutions: readonly string[] }
const xaiCatalog = catalog.providers.find((provider) => provider.apiFormat === 'xaiVideo') as {
  genericCapabilities: XAIVideoCapabilities
  knownModels: Partial<Record<string, XAIVideoCapabilities>>
}

export function xaiVideoResolutions(modelId: string): readonly string[] {
  return xaiCatalog.knownModels[modelId]?.resolutions ?? xaiCatalog.genericCapabilities.resolutions
}

export function resolveByteDanceVideoCapabilities(modelId: string): ByteDanceVideoCapabilities {
  const family = modelCatalog.families.find(({ prefixes }) =>
    prefixes.some((prefix) => modelId.startsWith(prefix)),
  )
  return family?.capabilities ?? modelCatalog.defaultCapabilities
}

export function byteDanceVideoDefaults(modelId: string): Options<'byteDanceVideo'> {
  const capabilities = resolveByteDanceVideoCapabilities(modelId)
  return {
    ...defaultOptions('byteDanceVideo'),
    duration: capabilities.defaultDuration,
    resolution: capabilities.defaultResolution,
    generateAudio: capabilities.defaultGenerateAudio,
  }
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
    omniReferenceTaskType: capabilities.omniReferenceTaskType ? options.omniReferenceTaskType ?? 'auto' : 'auto',
    outputFormat: capabilities.outputFormats.includes(String(options.outputFormat)) ? options.outputFormat : 'mp4',
    priority: capabilities.priority ? options.priority ?? 0 : 0,
  }
}
