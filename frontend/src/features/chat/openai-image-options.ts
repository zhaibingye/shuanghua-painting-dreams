// Keep model capabilities aligned with backend/app/domain/openai_images.py.
// Official Image API docs verified 2026-10-21.
export const OPENAI_IMAGE_MODELS = [
  'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2',
  'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'chatgpt-image-latest',
] as const
export const OPENAI_IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export const OPENAI_STANDARD_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const
export const OPENAI_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21'] as const
export const OPENAI_RESOLUTION_TIERS = ['1K', '2K', '4K'] as const
export type OpenAIResolutionTier = (typeof OPENAI_RESOLUTION_TIERS)[number]
export type OpenAIAspectRatio = (typeof OPENAI_ASPECT_RATIOS)[number]

export function openAIResponsesImageModel(options: Record<string, unknown>): string {
  return typeof options.imageModel === 'string' ? options.imageModel : OPENAI_IMAGE_MODELS[0]
}

export function openAIImageCapabilities(modelId: string) {
  const family = modelId.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  return {
    qualities: family === 'gpt-image-2.5-sunburst' || family === 'gpt-image-2.5-flare'
      ? [...OPENAI_IMAGE_QUALITIES] : OPENAI_IMAGE_QUALITIES.slice(0, 4),
    customImageSize: ['gpt-image-2', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'].includes(family),
    inputFidelities: ['gpt-image-1', 'gpt-image-1.5'].includes(family)
      ? ['auto', 'low', 'high'] : family === 'gpt-image-1-mini' ? ['auto', 'low'] : ['auto'],
  }
}

// K tiers target a long edge of 1024 / 2048 / 3840. Clamp to the API's pixel
// budget, preserving the exact ratio and making both edges multiples of 16.
export function openAIImagePreset(ratio: OpenAIAspectRatio, tier: OpenAIResolutionTier): string {
  const [widthRatio = 1, heightRatio = 1] = ratio.split(':').map(Number)
  const divisor = gcd(widthRatio, heightRatio)
  const widthUnit = widthRatio / divisor * 16
  const heightUnit = heightRatio / divisor * 16
  const unitPixels = widthUnit * heightUnit
  const minScale = Math.ceil(Math.sqrt(655_360 / unitPixels))
  const maxScale = Math.min(
    Math.floor(3840 / Math.max(widthUnit, heightUnit)),
    Math.floor(Math.sqrt(8_294_400 / unitPixels)),
  )
  const target = { '1K': 1024, '2K': 2048, '4K': 3840 }[tier]
  const scale = Math.max(minScale, Math.min(maxScale, Math.round(target / Math.max(widthUnit, heightUnit))))
  return `${widthUnit * scale}x${heightUnit * scale}`
}

export function openAIImageAspectRatio(size: string): OpenAIAspectRatio {
  const [width = 0, height = 0] = size.toLowerCase().split('x').map(Number)
  return OPENAI_ASPECT_RATIOS.find((ratio) => {
    const [ratioWidth = 1, ratioHeight = 1] = ratio.split(':').map(Number)
    return width > 0 && height > 0 && width * ratioHeight === height * ratioWidth
  }) ?? '1:1'
}

export function openAIImageSizeError(size: string, modelId: string): string | undefined {
  if (size === 'auto') return undefined
  if (!/^[0-9]+[xX][0-9]+$/.test(size)) return '请输入 auto 或 WIDTHxHEIGHT。'
  const [width = 0, height = 0] = size.toLowerCase().split('x').map(Number)
  if (width <= 0 || height <= 0 || width > 3840 || height > 3840) return '每条边必须介于 1 和 3840 像素之间。'
  if (width % 16 || height % 16) return '宽和高必须是 16 的倍数。'
  if (Math.max(width, height) > 3 * Math.min(width, height)) return '长短边比例不能超过 3:1。'
  if (width * height < 655_360 || width * height > 8_294_400) return '总像素必须介于 655360 和 8294400 之间。'
  if (!openAIImageCapabilities(modelId).customImageSize && !OPENAI_STANDARD_SIZES.includes(size.toLowerCase() as typeof OPENAI_STANDARD_SIZES[number])) {
    return '当前模型仅支持 auto 和三种标准尺寸。'
  }
  return undefined
}

export function normalizeOpenAIImageOptions(options: Record<string, unknown>, modelId: string): Record<string, unknown> {
  const capabilities = openAIImageCapabilities(modelId)
  const quality = typeof options.quality === 'string' && capabilities.qualities.includes(options.quality as typeof OPENAI_IMAGE_QUALITIES[number])
    ? options.quality : 'auto'
  const inputFidelity = typeof options.inputFidelity === 'string' && capabilities.inputFidelities.includes(options.inputFidelity)
    ? options.inputFidelity : 'auto'
  return {
    ...options,
    quality,
    inputFidelity,
    size: !capabilities.customImageSize && typeof options.size === 'string' && !OPENAI_STANDARD_SIZES.includes(options.size as typeof OPENAI_STANDARD_SIZES[number])
      ? 'auto' : options.size,
    outputFormat: options.background === 'transparent' && options.outputFormat === 'jpeg' ? 'png' : options.outputFormat,
  }
}

export function experimentalImageSize(size: string): boolean {
  const [width = 0, height = 0] = size.toLowerCase().split('x').map(Number)
  return width * height > 2560 * 1440
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
