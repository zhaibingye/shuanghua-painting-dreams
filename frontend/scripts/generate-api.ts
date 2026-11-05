import { readFile, writeFile } from 'node:fs/promises'
import { compile, type JSONSchema } from 'json-schema-to-typescript'

// OpenAPI 3.1 components are JSON Schemas. Strip display titles to keep property types inline.
const spec = JSON.parse(
  await readFile(new URL('../../backend/openapi.json', import.meta.url), 'utf8'),
  (key: string, value: unknown): unknown => {
    if (key === 'title') return undefined
    if (key === '$ref' && typeof value === 'string') {
      return value.replace('#/components/schemas/', '#/definitions/')
    }
    return value
  },
) as { components: { schemas: Record<string, JSONSchema> } }
const source = await compile({ definitions: spec.components.schemas }, 'ApiModels', {
  unreachableDefinitions: true,
  unknownAny: true,
  ignoreMinAndMaxItems: true,
  style: { singleQuote: true, semi: false },
  bannerComment: '/* Generated from backend/openapi.json. Run npm run api:generate to update. */',
})
await writeFile(new URL('../src/api/generated/models.ts', import.meta.url), source)
