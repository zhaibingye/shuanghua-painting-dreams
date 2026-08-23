import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearWorkspace,
  completeImageMessage,
  createTurn,
  deleteConversation,
  getAssets,
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
