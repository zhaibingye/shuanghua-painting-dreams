import { z } from 'zod'

import catalog from './generated/provider-catalog.json'
import type { components } from './generated/schema'

export type ImageFormat = keyof typeof catalog.imageOptions
export type ImageOptions<F extends ImageFormat> = {
  googleGeminiImage: components['schemas']['GeminiImageOptions']
  openaiImage: components['schemas']['OpenAIImageTurnOptions']
  openaiResponsesImage: components['schemas']['OpenAIResponsesImageOptions']
  xaiImage: components['schemas']['XAIImageOptions']
  byteDanceImage: components['schemas']['ByteDanceImageOptions']
}[F]

export type OptionField = {
  type: string
  title: string
  description?: string
  default: string | number | boolean
  enum?: string[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}

export function imageOptionFields(format: ImageFormat): Record<string, OptionField> {
  return catalog.imageOptions[format].properties
}

// 生成的 JSON Schema 是唯一的字段、默认值和枚举来源。
function optionSchema(format: ImageFormat) {
  const fields = imageOptionFields(format)
  const shape = Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    let value: z.ZodType
    if (field.enum) value = z.enum(field.enum)
    else if (field.type === 'boolean') value = z.boolean()
    else if (field.type === 'integer') {
      let number = z.number().int()
      if (field.minimum !== undefined) number = number.min(field.minimum)
      if (field.maximum !== undefined) number = number.max(field.maximum)
      value = number
    } else {
      let text = z.string()
      if (field.minLength !== undefined) text = text.min(field.minLength)
      if (field.maxLength !== undefined) text = text.max(field.maxLength)
      value = text
    }
    return [key, value.default(field.default)]
  }))
  return z.object(shape)
}

const schemas = {
  googleGeminiImage: optionSchema('googleGeminiImage'),
  openaiImage: optionSchema('openaiImage'),
  openaiResponsesImage: optionSchema('openaiResponsesImage'),
  xaiImage: optionSchema('xaiImage'),
  byteDanceImage: optionSchema('byteDanceImage'),
}

export function parseImageOptions<F extends ImageFormat>(format: F, value: Record<string, unknown>): ImageOptions<F> {
  const result = schemas[format].safeParse(value)
  if (!result.success) {
    const message = result.error.issues.map((issue) => {
      const field = imageOptionFields(format)[String(issue.path[0])]
      return `${field?.title ?? '图片参数'}无效：${issue.message}`
    }).join('；')
    throw new Error(message)
  }
  return result.data as ImageOptions<F>
}

export function defaultImageOptions(format: ImageFormat): Record<string, unknown> {
  return Object.fromEntries(Object.entries(imageOptionFields(format)).map(([key, field]) => [key, field.default]))
}
