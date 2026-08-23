const blockedHosts = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal'])

export function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    const host = url.hostname
      .toLowerCase()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/\.$/, '')
    if (blockedHosts.has(host) || host.endsWith('.localhost')) return false
    return isPublicLiteralAddress(host)
  } catch {
    return false
  }
}

function isPublicLiteralAddress(host: string): boolean {
  const ipv4 = parseIpv4(host)
  if (ipv4) return isPublicIpv4(ipv4)
  if (!host.includes(':')) return true

  const normalized = host.toLowerCase()
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('2001:db8:')
  ) {
    return false
  }
  if (normalized.startsWith('::ffff:')) {
    const mapped = parseIpv4(normalized.slice('::ffff:'.length))
    return mapped ? isPublicIpv4(mapped) : false
  }
  return true
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map(Number)
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null
  return octets as [number, number, number, number]
}

function isPublicIpv4([first, second]: [number, number, number, number]): boolean {
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (first === 192 && second === 168) return false
  if (first === 198 && (second === 18 || second === 19)) return false
  return true
}
