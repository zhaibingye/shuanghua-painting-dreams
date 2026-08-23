import { describe, expect, it } from 'vitest'

import {
  taskForConversation,
  taskForMessage,
  useImageTaskStore,
} from './image-task-store'

describe('image task runtime store', () => {
  it('keeps independent tasks and partial previews for multiple conversations', () => {
    const store = useImageTaskStore.getState()
    store.register({
      id: 'task-1',
      conversationId: 'conversation-1',
      assistantMessageId: 'assistant-1',
      status: 'pending',
      text: '',
      partials: {},
    })
    store.register({
      id: 'task-2',
      conversationId: 'conversation-2',
      assistantMessageId: 'assistant-2',
      status: 'pending',
      text: '',
      partials: {},
    })

    useImageTaskStore.getState().markStreaming('task-1')
    useImageTaskStore.getState().setText('task-1', 'working')
    useImageTaskStore.getState().setPartial('task-1', {
      imageIndex: 0,
      partialImageIndex: 1,
      blob: new Blob(['preview'], { type: 'image/png' }),
    })

    const tasks = useImageTaskStore.getState().tasks
    expect(taskForConversation(tasks, 'conversation-1')).toMatchObject({
      id: 'task-1',
      status: 'streaming',
      text: 'working',
    })
    expect(taskForMessage(tasks, 'assistant-2')?.id).toBe('task-2')
    expect(tasks['task-1']?.partials['0']?.partialImageIndex).toBe(1)
    expect(tasks['task-2']?.partials).toEqual({})

    useImageTaskStore.getState().clearPartial('task-1', 0)
    useImageTaskStore.getState().remove('task-1')
    useImageTaskStore.getState().remove('task-2')
    expect(useImageTaskStore.getState().tasks).toEqual({})
  })
})
