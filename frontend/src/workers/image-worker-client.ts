import type {
  ImageWorkerRequest,
  ImageWorkerResponse,
  ProcessedBlob,
  ProcessedFile,
} from './image.worker'

type PendingRequest = {
  resolve: (value: ProcessedBlob | ProcessedFile) => void
  reject: (reason: Error) => void
}

let worker: Worker | null = null
const pending = new Map<string, PendingRequest>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' })
  worker.addEventListener('message', (event: MessageEvent<ImageWorkerResponse>) => {
    const request = pending.get(event.data.id)
    if (!request) return
    pending.delete(event.data.id)
    if (event.data.ok) request.resolve(event.data.result)
    else request.reject(new Error(event.data.error))
  })
  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || '图片 Worker 发生错误')
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  })
  return worker
}

function send(message: ImageWorkerRequest): Promise<ProcessedBlob | ProcessedFile> {
  return new Promise((resolve, reject) => {
    pending.set(message.id, { resolve, reject })
    getWorker().postMessage(message)
  })
}

export async function fileToDataUrl(file: File): Promise<ProcessedFile> {
  const result = await send({ id: crypto.randomUUID(), type: 'fileToDataUrl', file })
  if (!('dataUrl' in result)) throw new Error('图片 Worker 返回了错误类型')
  return result
}

export async function base64ToBlob(
  base64Data: string,
  mimeType: string,
): Promise<ProcessedBlob> {
  const result = await send({
    id: crypto.randomUUID(),
    type: 'base64ToBlob',
    base64Data,
    mimeType,
  })
  if (!('blob' in result)) throw new Error('图片 Worker 返回了错误类型')
  return result
}
