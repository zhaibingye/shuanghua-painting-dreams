import catalog from '../../api/generated/provider-catalog.json'
import type * as schemas from '../../api/generated/models'
import { defaultOptions, type Options } from '../../api/options'

const geminiCatalog = catalog.providers.find((provider) => provider.apiFormat === 'googleGeminiImage')
type GeminiImageCapabilities = { imageSizes: readonly string[]; thinkingLevels?: readonly string[] }

export function geminiImageCapabilities(modelId: string): GeminiImageCapabilities | undefined {
  return (geminiCatalog?.knownModels as Partial<Record<string, GeminiImageCapabilities>> | undefined)?.[modelId]
}

export function seedreamImageCapabilities(modelId: string) {
  return catalog.seedreamImageFamilies.find(({ prefix }) => modelId.startsWith(prefix))
}

export function normalizeSeedreamImageOptions(options: Record<string, unknown>, modelId: string): Record<string, unknown> {
  const capabilities = seedreamImageCapabilities(modelId)
  const layers = capabilities?.layers === true
  const splitLayers = layers && options.layerDecomposition === true
  const size = options.size
  let nextSize = size === 'auto' && !splitLayers ? '2K' : size
  if (capabilities && !capabilities.sizes.includes(String(size))) {
    if (splitLayers) {
      nextSize = 'auto'
    } else {
      const dimensions = typeof size === 'string' && /^[0-9]+x[0-9]+$/i.test(size)
        ? size.toLowerCase().split('x').map(Number) : []
      const [width = 0, height = 0] = dimensions
      const pixels = width * height
      if (pixels < capabilities.min_pixels || pixels > capabilities.max_pixels ||
          width > height * 16 || height > width * 16) nextSize = '2K'
    }
  }
  return {
    ...options,
    size: nextSize,
    sequentialImageGeneration: capabilities?.sequential === false ? 'disabled' : options.sequentialImageGeneration,
    webSearch: capabilities?.web_search === false ? false : options.webSearch,
    optimizePromptMode: capabilities?.fast_prompt === false ? 'standard' : options.optimizePromptMode,
    outputFormat: capabilities?.png_output === false && options.outputFormat === 'png'
      ? 'auto'
      : layers && !splitLayers && options.background === 'transparent' && options.outputFormat === 'jpeg'
        ? 'png' : options.outputFormat,
    background: layers && !splitLayers ? options.background : 'auto',
    layerDecomposition: splitLayers,
  }
}

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
