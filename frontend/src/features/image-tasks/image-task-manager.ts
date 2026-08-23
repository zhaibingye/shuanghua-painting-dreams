import { toast } from 'sonner'

import {
  ApiClientError,
  streamImageConversationTurn,
  type ImageConversationTurnRequest,
} from '../../api/client'
import {
  completeImageMessage,
  updateMessage,
  type MessageProviderState,
  type StoredMediaAsset,
} from '../../storage/db'
import { base64ToBlob } from '../../workers/image-worker-client'
import { providerStateFromStream } from '../chat/image-turn'
import { useImageTaskStore } from './image-task-store'

const controllers = new Map<string, AbortController>()

export type StartImageTaskOptions = {
  taskId: string
  conversationId: string
  assistantMessageId: string
  request: ImageConversationTurnRequest
  apiKey: string
}

export function startImageTask(options: StartImageTaskOptions): void {
  if (controllers.has(options.taskId)) {
    throw new Error(`图片任务 ${options.taskId} 已经存在。`)
  }
  const controller = new AbortController()
  controllers.set(options.taskId, controller)
  useImageTaskStore.getState().register({
    id: options.taskId,
    conversationId: options.conversationId,
    assistantMessageId: options.assistantMessageId,
    status: 'pending',
    text: '',
    partials: {},
  })
  void runImageTask(options, controller)
}

export function cancelImageTask(taskId: string): void {
  controllers.get(taskId)?.abort()
}

export function cancelConversationImageTasks(conversationId: string): void {
  const tasks = useImageTaskStore.getState().tasks
  for (const task of Object.values(tasks)) {
    if (task.conversationId === conversationId) cancelImageTask(task.id)
  }
}

async function runImageTask(
  options: StartImageTaskOptions,
  controller: AbortController,
): Promise<void> {
  const outputAssets: StoredMediaAsset[] = []
  const responseCalls: { callId: string; imageId: string; prompt: string | null }[] = []
  let textBuffer = ''

  try {
    await streamImageConversationTurn({
      request: options.request,
      apiKey: options.apiKey,
      signal: controller.signal,
      onEvent: async (event) => {
        if (event.type === 'turn.started') {
          useImageTaskStore.getState().markStreaming(options.taskId)
          await updateMessage(options.assistantMessageId, { status: 'streaming' })
          return
        }
        if (event.type === 'image.partial') {
          const partial = await base64ToBlob(event.base64Data, event.mimeType)
          useImageTaskStore.getState().setPartial(options.taskId, {
            imageIndex: event.index,
            partialImageIndex: event.partialImageIndex,
            blob: partial.blob,
          })
          return
        }
        if (event.type === 'text.delta') {
          textBuffer += event.delta
          useImageTaskStore.getState().setText(options.taskId, textBuffer)
          return
        }
        if (event.type === 'image.completed') {
          const processed = await base64ToBlob(event.image.base64Data, event.image.mimeType)
          const asset: StoredMediaAsset = {
            id: event.image.id,
            conversationId: options.conversationId,
            messageId: options.assistantMessageId,
            mediaKind: 'image',
            role: 'output',
            blob: processed.blob,
            url: null,
            filename: null,
            mimeType: event.image.mimeType,
            width: processed.width,
            height: processed.height,
            revisedPrompt: event.image.revisedPrompt,
            thought: event.image.thought,
            createdAt: new Date().toISOString(),
          }
          outputAssets.push(asset)
          useImageTaskStore.getState().clearPartial(options.taskId, event.index)
          const callId = event.providerMetadata?.callId
          if (typeof callId === 'string') {
            responseCalls.push({
              callId,
              imageId: asset.id,
              prompt:
                typeof event.providerMetadata?.prompt === 'string'
                  ? event.providerMetadata.prompt
                  : event.image.revisedPrompt,
            })
          }
          return
        }
        if (event.type === 'turn.completed') {
          if (outputAssets.length === 0) {
            throw new Error('图片流已结束，但没有收到任何最终图片。')
          }
          const providerState: MessageProviderState | null = providerStateFromStream({
            rawState: event.providerState,
            imageCalls: responseCalls,
          })
          const activeImage = outputAssets.find((asset) => !asset.thought)?.id ?? null
          await completeImageMessage({
            conversationId: options.conversationId,
            messageId: options.assistantMessageId,
            text: textBuffer,
            assets: outputAssets,
            providerState,
            activeImageAssetId: activeImage,
          })
        }
      },
    })
    toast.success(`已完成 ${outputAssets.filter((asset) => !asset.thought).length} 张图片`)
  } catch (error) {
    if (controller.signal.aborted) {
      await updateMessage(options.assistantMessageId, {
        status: 'stopped',
        text: textBuffer,
        error: null,
      })
    } else {
      const message = error instanceof Error ? error.message : '图片生成失败'
      const code = error instanceof ApiClientError ? error.code : 'imageRequestFailed'
      await updateMessage(options.assistantMessageId, {
        status: 'failed',
        text: textBuffer,
        error: { code, message },
      })
      toast.error(message)
    }
  } finally {
    controllers.delete(options.taskId)
    useImageTaskStore.getState().remove(options.taskId)
  }
}
