import { create } from 'zustand'

export type RuntimePartialImage = {
  imageIndex: number
  partialImageIndex: number | null
  blob: Blob
}

export type RuntimeImageTask = {
  id: string
  conversationId: string
  assistantMessageId: string
  status: 'pending' | 'streaming'
  text: string
  partials: Record<string, RuntimePartialImage>
}

type ImageTaskState = {
  tasks: Record<string, RuntimeImageTask>
  register: (task: RuntimeImageTask) => void
  markStreaming: (taskId: string) => void
  setText: (taskId: string, text: string) => void
  setPartial: (taskId: string, partial: RuntimePartialImage) => void
  clearPartial: (taskId: string, imageIndex: number) => void
  remove: (taskId: string) => void
}

export const useImageTaskStore = create<ImageTaskState>((set) => ({
  tasks: {},
  register: (task) =>
    set((state) => ({
      tasks: { ...state.tasks, [task.id]: task },
    })),
  markStreaming: (taskId) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, status: 'streaming' },
        },
      }
    }),
  setText: (taskId, text) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, text },
        },
      }
    }),
  setPartial: (taskId, partial) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            partials: {
              ...task.partials,
              [String(partial.imageIndex)]: partial,
            },
          },
        },
      }
    }),
  clearPartial: (taskId, imageIndex) =>
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || !(String(imageIndex) in task.partials)) return state
      const partials = Object.fromEntries(
        Object.entries(task.partials).filter(([key]) => key !== String(imageIndex)),
      )
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, partials },
        },
      }
    }),
  remove: (taskId) =>
    set((state) => {
      if (!(taskId in state.tasks)) return state
      const tasks = Object.fromEntries(
        Object.entries(state.tasks).filter(([key]) => key !== taskId),
      )
      return { tasks }
    }),
}))

export function taskForConversation(
  tasks: Record<string, RuntimeImageTask>,
  conversationId: string,
): RuntimeImageTask | null {
  return Object.values(tasks).find((task) => task.conversationId === conversationId) ?? null
}

export function taskForMessage(
  tasks: Record<string, RuntimeImageTask>,
  assistantMessageId: string,
): RuntimeImageTask | null {
  return Object.values(tasks).find((task) => task.assistantMessageId === assistantMessageId) ?? null
}
