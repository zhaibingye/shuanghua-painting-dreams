import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

import type { ApiFormat, MediaKind, VideoApiFormat } from './settings'

export type StoredTaskError = {
  code: string
  message: string
}

export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'succeeded'
  | 'failed'
  | 'stopped'
  | 'interrupted'

export type StoredConversation = {
  id: string
  title: string
  mediaKind: MediaKind
  apiFormat: ApiFormat
  baseUrl: string
  modelId: string
  activeImageAssetId: string | null
  createdAt: string
  updatedAt: string
}

export type GeminiProviderPart =
  | {
      kind: 'text'
      text: string
      thought: boolean
      thoughtSignature: string | null
    }
  | {
      kind: 'image'
      imageId: string
      thought: boolean
      thoughtSignature: string | null
    }

export type MessageProviderState =
  | {
      type: 'gemini'
      parts: GeminiProviderPart[]
      includeThoughts: boolean
    }
  | {
      type: 'openaiResponses'
      responseId: string | null
      store: false
      imageCalls: {
        callId: string
        status: 'completed'
        imageId: string
        prompt: string | null
      }[]
    }

export type StoredMessage = {
  id: string
  conversationId: string
  mediaKind: MediaKind
  role: 'user' | 'assistant'
  status: MessageStatus
  text: string
  attachmentAssetIds: string[]
  outputAssetIds: string[]
  providerState: MessageProviderState | null
  optionsSnapshot: Record<string, unknown>
  taskId: string | null
  error: StoredTaskError | null
  createdAt: string
  updatedAt: string
}

export type StoredMediaAsset = {
  id: string
  conversationId: string
  messageId: string
  mediaKind: 'image'
  role: 'input' | 'output'
  blob: Blob | null
  url: string | null
  filename: string | null
  mimeType: string | null
  width: number | null
  height: number | null
  revisedPrompt: string | null
  thought: boolean
  createdAt: string
}

export type StoredVideoStatus =
  | 'submitting'
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'pollingError'

export type StoredVideoTask = {
  id: string
  conversationId: string
  userMessageId: string
  assistantMessageId: string
  apiFormat: VideoApiFormat
  operation: 'generation' | 'extension' | 'byteDanceContinuation'
  upstreamTaskId: string | null
  parentTaskId: string | null
  baseUrl: string
  modelId: string
  prompt: string
  requestSnapshot: Record<string, unknown>
  status: StoredVideoStatus
  previousStatus: Exclude<StoredVideoStatus, 'pollingError'> | null
  progress: number | null
  videoUrl: string | null
  lastFrameUrl: string | null
  duration: number | null
  error: StoredTaskError | null
  pollFailures: number
  createdAt: string
  updatedAt: string
  lastPolledAt: string | null
}

interface ShuanghuaDb extends DBSchema {
  conversations: {
    key: string
    value: StoredConversation
    indexes: {
      updatedAt: string
      mediaKind: MediaKind
      apiFormat: ApiFormat
    }
  }
  messages: {
    key: string
    value: StoredMessage
    indexes: {
      conversationId: string
      createdAt: string
      status: MessageStatus
    }
  }
  assets: {
    key: string
    value: StoredMediaAsset
    indexes: {
      conversationId: string
      messageId: string
    }
  }
  videoTasks: {
    key: string
    value: StoredVideoTask
    indexes: {
      conversationId: string
      assistantMessageId: string
      createdAt: string
      apiFormat: VideoApiFormat
      status: StoredVideoStatus
    }
  }
}

const databaseName = 'shuanghua-workspace'
const databaseVersion = 2
const changeEvent = 'shuanghua-db-change'
let databasePromise: Promise<IDBPDatabase<ShuanghuaDb>> | null = null

function database(): Promise<IDBPDatabase<ShuanghuaDb>> {
  databasePromise ??= openDB<ShuanghuaDb>(databaseName, databaseVersion, {
    upgrade(db) {
      for (const storeName of [...db.objectStoreNames]) db.deleteObjectStore(storeName)

      const conversations = db.createObjectStore('conversations', { keyPath: 'id' })
      conversations.createIndex('updatedAt', 'updatedAt')
      conversations.createIndex('mediaKind', 'mediaKind')
      conversations.createIndex('apiFormat', 'apiFormat')

      const messages = db.createObjectStore('messages', { keyPath: 'id' })
      messages.createIndex('conversationId', 'conversationId')
      messages.createIndex('createdAt', 'createdAt')
      messages.createIndex('status', 'status')

      const assets = db.createObjectStore('assets', { keyPath: 'id' })
      assets.createIndex('conversationId', 'conversationId')
      assets.createIndex('messageId', 'messageId')

      const videoTasks = db.createObjectStore('videoTasks', { keyPath: 'id' })
      videoTasks.createIndex('conversationId', 'conversationId')
      videoTasks.createIndex('assistantMessageId', 'assistantMessageId')
      videoTasks.createIndex('createdAt', 'createdAt')
      videoTasks.createIndex('apiFormat', 'apiFormat')
      videoTasks.createIndex('status', 'status')
    },
  })
  return databasePromise
}

function notifyChange(): void {
  window.dispatchEvent(new CustomEvent(changeEvent))
}

export function subscribeDatabaseChanges(listener: () => void): () => void {
  window.addEventListener(changeEvent, listener)
  return () => window.removeEventListener(changeEvent, listener)
}

export async function putConversation(conversation: StoredConversation): Promise<void> {
  const db = await database()
  await db.put('conversations', conversation)
  notifyChange()
}

export async function getConversation(id: string): Promise<StoredConversation | undefined> {
  const db = await database()
  return db.get('conversations', id)
}

export async function listConversations(): Promise<StoredConversation[]> {
  const db = await database()
  const conversations = await db.getAllFromIndex('conversations', 'updatedAt')
  return conversations.reverse()
}

export async function updateConversation(
  id: string,
  patch: Partial<StoredConversation>,
): Promise<void> {
  const db = await database()
  const current = await db.get('conversations', id)
  if (!current) return
  await db.put('conversations', {
    ...current,
    ...patch,
    id,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  })
  notifyChange()
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await database()
  const transaction = db.transaction(
    ['conversations', 'messages', 'assets', 'videoTasks'],
    'readwrite',
  )
  const messageKeys = await transaction.objectStore('messages').index('conversationId').getAllKeys(id)
  const assetKeys = await transaction.objectStore('assets').index('conversationId').getAllKeys(id)
  const taskKeys = await transaction.objectStore('videoTasks').index('conversationId').getAllKeys(id)
  for (const key of messageKeys) await transaction.objectStore('messages').delete(key)
  for (const key of assetKeys) await transaction.objectStore('assets').delete(key)
  for (const key of taskKeys) await transaction.objectStore('videoTasks').delete(key)
  await transaction.objectStore('conversations').delete(id)
  await transaction.done
  notifyChange()
}

export async function listMessages(conversationId: string): Promise<StoredMessage[]> {
  const db = await database()
  const messages = await db.getAllFromIndex('messages', 'conversationId', conversationId)
  return messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function getMessage(id: string): Promise<StoredMessage | undefined> {
  const db = await database()
  return db.get('messages', id)
}

export async function updateMessage(
  id: string,
  patch: Partial<StoredMessage>,
): Promise<void> {
  const db = await database()
  const current = await db.get('messages', id)
  if (!current) return
  await db.put('messages', {
    ...current,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  })
  notifyChange()
}

export async function createTurn(options: {
  conversation: StoredConversation
  userMessage: StoredMessage
  assistantMessage: StoredMessage
  inputAssets: StoredMediaAsset[]
  videoTask?: StoredVideoTask
}): Promise<void> {
  const db = await database()
  const stores = options.videoTask
    ? (['conversations', 'messages', 'assets', 'videoTasks'] as const)
    : (['conversations', 'messages', 'assets'] as const)
  const transaction = db.transaction(stores, 'readwrite')
  await transaction.objectStore('conversations').put(options.conversation)
  await transaction.objectStore('messages').put(options.userMessage)
  await transaction.objectStore('messages').put(options.assistantMessage)
  for (const asset of options.inputAssets) await transaction.objectStore('assets').put(asset)
  if (options.videoTask) await transaction.objectStore('videoTasks').put(options.videoTask)
  await transaction.done
  notifyChange()
}

export async function completeImageMessage(options: {
  conversationId: string
  messageId: string
  text: string
  assets: StoredMediaAsset[]
  providerState: MessageProviderState | null
  activeImageAssetId: string | null
}): Promise<void> {
  const db = await database()
  const transaction = db.transaction(['conversations', 'messages', 'assets'], 'readwrite')
  const message = await transaction.objectStore('messages').get(options.messageId)
  const conversation = await transaction.objectStore('conversations').get(options.conversationId)
  if (!message || !conversation) {
    await transaction.done
    return
  }
  for (const asset of options.assets) await transaction.objectStore('assets').put(asset)
  const now = new Date().toISOString()
  await transaction.objectStore('messages').put({
    ...message,
    status: 'succeeded',
    text: options.text,
    outputAssetIds: options.assets.map((asset) => asset.id),
    providerState: options.providerState,
    error: null,
    updatedAt: now,
  })
  await transaction.objectStore('conversations').put({
    ...conversation,
    activeImageAssetId: options.activeImageAssetId ?? conversation.activeImageAssetId,
    updatedAt: now,
  })
  await transaction.done
  notifyChange()
}

export async function getAssets(ids: string[]): Promise<StoredMediaAsset[]> {
  const db = await database()
  const assets = await Promise.all(ids.map((id) => db.get('assets', id)))
  return assets.filter((asset): asset is StoredMediaAsset => asset !== undefined)
}

export async function putVideoTask(task: StoredVideoTask): Promise<void> {
  const db = await database()
  await db.put('videoTasks', task)
  notifyChange()
}

export async function getVideoTask(id: string): Promise<StoredVideoTask | undefined> {
  const db = await database()
  return db.get('videoTasks', id)
}

export async function getVideoTaskByMessage(
  assistantMessageId: string,
): Promise<StoredVideoTask | undefined> {
  const db = await database()
  return db.getFromIndex('videoTasks', 'assistantMessageId', assistantMessageId)
}

export async function updateVideoTask(
  id: string,
  patch: Partial<StoredVideoTask>,
): Promise<void> {
  const db = await database()
  const current = await db.get('videoTasks', id)
  if (!current) return
  await db.put('videoTasks', {
    ...current,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  })
  notifyChange()
}

export async function listActiveVideoTasks(): Promise<StoredVideoTask[]> {
  const db = await database()
  const tasks = await Promise.all(
    (['queued', 'processing', 'pollingError'] as const).map((status) =>
      db.getAllFromIndex('videoTasks', 'status', status),
    ),
  )
  return tasks.flat()
}

export async function markInterruptedImageMessages(): Promise<void> {
  const db = await database()
  const pendingGroups = await Promise.all(
    (['pending', 'streaming'] as const).map((status) =>
      db.getAllFromIndex('messages', 'status', status),
    ),
  )
  const imageMessages = pendingGroups
    .flat()
    .filter((message) => message.mediaKind === 'image' && message.role === 'assistant')
  if (imageMessages.length === 0) return
  const transaction = db.transaction('messages', 'readwrite')
  for (const message of imageMessages) {
    await transaction.store.put({
      ...message,
      status: 'interrupted',
      error: {
        code: 'requestInterrupted',
        message: '页面关闭或刷新导致图片请求中断。',
      },
      updatedAt: new Date().toISOString(),
    })
  }
  await transaction.done
  notifyChange()
}

export async function clearWorkspace(): Promise<void> {
  const db = await database()
  const transaction = db.transaction(
    ['conversations', 'messages', 'assets', 'videoTasks'],
    'readwrite',
  )
  await Promise.all([
    transaction.objectStore('conversations').clear(),
    transaction.objectStore('messages').clear(),
    transaction.objectStore('assets').clear(),
    transaction.objectStore('videoTasks').clear(),
  ])
  await transaction.done
  notifyChange()
}
