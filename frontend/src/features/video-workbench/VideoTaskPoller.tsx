import { useEffect, useRef } from 'react'

import { ApiClientError, queryVideoTask } from '../../api/client'
import {
  listActiveVideoTasks,
  type StoredVideoTask,
  updateConversation,
  updateVideoTask,
} from '../../storage/db'
import { effectiveKey } from '../../storage/settings'
import { useSettingsStore } from '../../stores/settings-store'

const baseIntervalMs = 5000
const maxIntervalMs = 30000

export function VideoTaskPoller() {
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    let disposed = false

    const tick = async () => {
      const tasks = await listActiveVideoTasks()
      if (disposed) return
      await Promise.all(tasks.map((task) => pollIfDue(task, inFlight.current)))
    }

    void tick()
    const timer = window.setInterval(() => void tick(), baseIntervalMs)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])

  return null
}

async function pollIfDue(task: StoredVideoTask, inFlight: Set<string>): Promise<void> {
  if (!task.upstreamTaskId || inFlight.has(task.id)) return
  const interval = Math.min(
    baseIntervalMs * 2 ** Math.min(task.pollFailures, 3),
    maxIntervalMs,
  )
  if (task.lastPolledAt && Date.now() - Date.parse(task.lastPolledAt) < interval) return

  const settings = useSettingsStore.getState().settings
  const key = effectiveKey(settings, task.apiFormat)
  if (!key) return

  inFlight.add(task.id)
  try {
    const response = await queryVideoTask(
      {
        apiFormat: task.apiFormat,
        baseUrl: task.baseUrl,
        taskId: task.upstreamTaskId,
      },
      key,
    )
    const result = response.task
    await updateVideoTask(task.id, {
      status: result.status,
      previousStatus: result.status,
      progress: result.progress ?? null,
      modelId: result.modelId ?? task.modelId,
      videoUrl: result.output?.videoUrl ?? null,
      lastFrameUrl: result.output?.lastFrameUrl ?? null,
      duration: result.output?.duration ?? null,
      error: result.error
        ? { code: result.error.code, message: result.error.message }
        : null,
      pollFailures: 0,
      lastPolledAt: new Date().toISOString(),
    })
    await updateConversation(task.conversationId, {})
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询视频任务失败。'
    const code = error instanceof ApiClientError ? error.code : 'pollingFailed'
    await updateVideoTask(task.id, {
      status: 'pollingError',
      previousStatus: task.status === 'pollingError' ? task.previousStatus : task.status,
      error: { code, message },
      pollFailures: task.pollFailures + 1,
      lastPolledAt: new Date().toISOString(),
    })
  } finally {
    inFlight.delete(task.id)
  }
}
