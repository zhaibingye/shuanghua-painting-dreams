export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function imageFilename(
  provider: string,
  mimeType: string,
  index: number,
  date = new Date(),
): string {
  const stamp = date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', '-')
    .slice(0, 15)
  const parsedExtension = mimeType.split('/')[1]
  const extension = mimeType === 'image/jpeg' ? 'jpg' : parsedExtension?.length ? parsedExtension : 'png'
  return `shuanghua-${provider}-${stamp}-${index + 1}.${extension}`
}
