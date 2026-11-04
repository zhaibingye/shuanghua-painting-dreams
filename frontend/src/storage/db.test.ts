import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearWorkspace,
  completeImageMessage,
  createTurn,
  deleteConversation,
  getAssets,
  getConversation,
  getMessage,
  getVideoTask,
  putConversation,
  putVideoTask,
  updateConversation,
  updateMessage,
  updateVideoTask,
  type StoredVideoTask,
  listConversations,
  listMessages,
  type StoredConversation,
  type StoredMediaAsset,
  type StoredMessage,
} from './db'

beforeEach(async () => clearWorkspace())

describe('IndexedDB conversation workspace', () => {
  it('stores a turn atomically and deletes all related assets with the conversation', async () => {
    const now = new Date().toISOString()
    const conversation: StoredConversation = {
      id: 'conversation-1',
      title: 'snow',
      mediaKind: 'image',
      apiFormat: 'openaiImage',
      baseUrl: 'https://shapi.vip',
      modelId: 'gpt-image-2',
      activeImageAssetId: null,
      createdAt: now,
      updatedAt: now,
    }
    const user: StoredMessage = {
      id: 'user-1',
      conversationId: conversation.id,
      mediaKind: 'image',
      role: 'user',
      status: 'succeeded',
      text: 'snow',
      attachmentAssetIds: [],
      outputAssetIds: [],
      providerState: null,
      optionsSnapshot: {},
      taskId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    const assistant: StoredMessage = {
      ...user,
      id: 'assistant-1',
      role: 'assistant',
      status: 'pending',
      text: '',
      createdAt: new Date(Date.now() + 1).toISOString(),
    }
    await createTurn({ conversation, userMessage: user, assistantMessage: assistant, inputAssets: [] })

    const asset: StoredMediaAsset = {
      id: 'asset-1',
      conversationId: conversation.id,
      messageId: assistant.id,
      mediaKind: 'image',
      role: 'output',
      blob: new Blob(['image'], { type: 'image/png' }),
      url: null,
      filename: null,
      mimeType: 'image/png',
      width: 1,
      height: 1,
      revisedPrompt: null,
      thought: false,
      createdAt: now,
    }
    await completeImageMessage({
      conversationId: conversation.id,
      messageId: assistant.id,
      text: '',
      assets: [asset],
      providerState: null,
      activeImageAssetId: asset.id,
    })

    expect(await listConversations()).toHaveLength(1)
    expect((await listMessages(conversation.id))[1]?.status).toBe('succeeded')
    expect((await getAssets([asset.id]))[0]?.mimeType).toBe('image/png')

    await deleteConversation(conversation.id)
    expect(await listConversations()).toHaveLength(0)
    expect(await listMessages(conversation.id)).toHaveLength(0)
    expect(await getAssets([asset.id])).toHaveLength(0)
  })
})


function makeConversation(): StoredConversation {
  return {
    id: 'concurrent-conversation', title: 'original', mediaKind: 'video', apiFormat: 'xaiVideo',
    baseUrl: 'https://www.shapi.vip', modelId: 'grok-imagine-video', activeImageAssetId: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }
}

it('merges concurrent conversation updates without losing either patch', async () => {
  const conversation = makeConversation()
  await putConversation(conversation)
  await Promise.all([
    updateConversation(conversation.id, { title: 'renamed' }),
    updateConversation(conversation.id, { activeImageAssetId: 'new-image' }),
  ])
  expect(await getConversation(conversation.id)).toMatchObject({
    title: 'renamed', activeImageAssetId: 'new-image',
  })
})

it('does not resurrect a conversation deleted during an update', async () => {
  const conversation = makeConversation()
  await putConversation(conversation)
  await Promise.all([
    updateConversation(conversation.id, { title: 'late update' }),
    deleteConversation(conversation.id),
  ])
  expect(await getConversation(conversation.id)).toBeUndefined()
})

it('merges concurrent message and video-task updates', async () => {
  const conversation = makeConversation()
  const user: StoredMessage = {
    id: 'user', conversationId: conversation.id, mediaKind: 'video', role: 'user',
    status: 'succeeded', text: 'snow', attachmentAssetIds: [], outputAssetIds: [],
    providerState: null, optionsSnapshot: {}, taskId: null, error: null,
    createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
  }
  const assistant: StoredMessage = { ...user, id: 'assistant', role: 'assistant', status: 'pending' }
  const task: StoredVideoTask = {
    id: 'task', conversationId: conversation.id, userMessageId: user.id,
    assistantMessageId: assistant.id, apiFormat: 'xaiVideo', operation: 'generation',
    upstreamTaskId: 'upstream', parentTaskId: null, baseUrl: conversation.baseUrl,
    modelId: conversation.modelId, prompt: 'snow', requestSnapshot: {}, status: 'queued',
    previousStatus: null, progress: null, videoUrl: null, lastFrameUrl: null, duration: null,
    error: null, pollFailures: 0, createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt, lastPolledAt: null,
  }
  await createTurn({ conversation, userMessage: user, assistantMessage: assistant, inputAssets: [] })
  await putVideoTask(task)
  await Promise.all([
    updateMessage(assistant.id, { status: 'succeeded' }),
    updateMessage(assistant.id, { text: 'result' }),
    updateVideoTask(task.id, { status: 'processing' }),
    updateVideoTask(task.id, { progress: 50 }),
  ])
  expect(await getMessage(assistant.id)).toMatchObject({ status: 'succeeded', text: 'result' })
  expect(await getVideoTask(task.id)).toMatchObject({ status: 'processing', progress: 50 })
})
