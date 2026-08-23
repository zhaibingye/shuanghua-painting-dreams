import { describe, expect, it } from 'vitest'

import { imageFilename } from './download'

describe('imageFilename', () => {
  it('uses jpg for jpeg images', () => {
    const result = imageFilename('openaiImage', 'image/jpeg', 0, new Date('2026-01-02T03:04:05Z'))
    expect(result).toBe('shuanghua-openaiImage-20260102-030405-1.jpg')
  })
})
