import { z } from 'zod'

import catalog from './generated/provider-catalog.json'
import type * as models from './generated/models'

export type OptionFormat = keyof typeof catalog.options
export type Options<F extends OptionFormat> = Required<{
  googleGeminiImage: models.GeminiImageOptions
  openaiImage: models.OpenAIImageTurnOptions
  openaiResponsesImage: models.OpenAIResponsesImageOptions
  xaiImage: models.XAIImageOptions
  byteDanceImage: models.ByteDanceImageOptions
  byteDanceVideo: models.ByteDanceVideoOptions
  xaiVideo: models.XAIVideoOptions
  xaiVideoExtension: Pick<models.XAIVideoExtensionRequest, 'duration'>
}[F]>

export type OptionField = {
  type?: string
  title: string
  description?: string
  default: string | number | boolean | null
  anyOf?: { type: string; minLength?: number; maxLength?: number }[]
  enum?: string[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}

type OptionFields<F extends OptionFormat> = {
  [K in keyof (typeof catalog.options)[F]['properties']]: OptionField & (typeof catalog.options)[F]['properties'][K]
} & Record<string, OptionField>

export function optionFields<F extends OptionFormat>(format: F): OptionFields<F> {
  return catalog.options[format].properties as OptionFields<F>
}

// 生成的 JSON Schema 是唯一的字段、默认值和枚举来源。
function optionSchema(format: OptionFormat) {
  const fields: Record<string, OptionField> = optionFields(format)
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
      const textField = field.anyOf?.find((item) => item.type === 'string') ?? field
      let text = z.string()
      if (textField.minLength !== undefined) text = text.min(textField.minLength)
      if (textField.maxLength !== undefined) text = text.max(textField.maxLength)
      value = field.anyOf?.some((item) => item.type === 'null') ? text.nullable() : text
    }
    return [key, value.default(field.default)]
  }))
  return z.object(shape)
}

const schemas = Object.fromEntries(
  (Object.keys(catalog.options) as OptionFormat[]).map((format) => [format, optionSchema(format)]),
) as Record<OptionFormat, ReturnType<typeof optionSchema>>

export function parseOptions<F extends OptionFormat>(format: F, value: Record<string, unknown>): Options<F> {
  const result = schemas[format].safeParse(value)
  if (!result.success) {
    const message = result.error.issues.map((issue) => {
      const field = optionFields(format)[String(issue.path[0])]
      return `${field?.title ?? '生成参数'}无效：${issue.message}`
    }).join('；')
    throw new Error(message)
  }
  return result.data as Options<F>
}

export function defaultOptions<F extends OptionFormat>(format: F): Options<F> {
  return Object.fromEntries(Object.entries(optionFields(format)).map(([key, field]) => [key, field.default])) as Options<F>
}
