import { describe, expect, it } from 'vitest'

import { isPublicHttpUrl } from './url'

describe('isPublicHttpUrl', () => {
  it.each(['https://example.com/image.png', 'http://cdn.example.com/path']) (
    'accepts %s',
    (value) => expect(isPublicHttpUrl(value)).toBe(true),
  )

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    '/relative',
    'http://localhost/image.png',
    'http://127.0.0.1/image.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/image.png',
    'https://user:password@example.com/image.png',
    '',
    123,
    null,
  ])(
    'rejects %s',
    (value) => expect(isPublicHttpUrl(value)).toBe(false),
  )
})
