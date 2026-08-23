/// <reference lib="webworker" />

export type ImageWorkerRequest =
  | { id: string; type: 'fileToDataUrl'; file: File }
  | { id: string; type: 'base64ToBlob'; base64Data: string; mimeType: string }

export type ProcessedFile = {
  dataUrl: string
  mimeType: string
  width: number
  height: number
}

export type ProcessedBlob = {
  blob: Blob
  width: number | null
  height: number | null
}

export type ImageWorkerResponse =
  | { id: string; ok: true; result: ProcessedFile | ProcessedBlob }
  | { id: string; ok: false; error: string }

const worker = self as DedicatedWorkerGlobalScope

worker.addEventListener('message', (event: MessageEvent<ImageWorkerRequest>) => {
  void handleMessage(event.data)
})

async function handleMessage(message: ImageWorkerRequest): Promise<void> {
  try {
    if (message.type === 'fileToDataUrl') {
      const dataUrl = new FileReaderSync().readAsDataURL(message.file)
      const dimensions = await requiredDimensionsOf(message.file)
      respond({
        id: message.id,
        ok: true,
        result: {
          dataUrl,
          mimeType: message.file.type,
          width: dimensions.width,
          height: dimensions.height,
        },
      })
      return
    }

    const bytes = decodeBase64(message.base64Data)
    const blob = new Blob([bytes], { type: message.mimeType })
    const dimensions = await dimensionsOf(blob).catch(() => ({ width: null, height: null }))
    respond({ id: message.id, ok: true, result: { blob, ...dimensions } })
  } catch (error) {
    respond({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : '图片处理失败',
    })
  }
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  const chunkSize = 64 * 1024
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, binary.length)
    for (let index = offset; index < end; index += 1) bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function requiredDimensionsOf(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const dimensions = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dimensions
}

async function dimensionsOf(
  blob: Blob,
): Promise<{ width: number; height: number } | { width: null; height: null }> {
  return requiredDimensionsOf(blob)
}

function respond(message: ImageWorkerResponse): void {
  worker.postMessage(message)
}

export {}
