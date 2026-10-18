export type RunStatus = 'idle' | 'running' | 'cancelled' | 'completed'
export type RunState = { status: RunStatus; active: number; attempt: number }

export type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

type Options = {
  stageCount: number
  onChange: (state: RunState) => void
  startDelay?: number
  stepDelay?: number
  scheduler?: Scheduler
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createWorkflowRunner({ stageCount, onChange, startDelay = 200, stepDelay = 170, scheduler = defaultScheduler }: Options) {
  let state: RunState = { status: 'idle', active: -1, attempt: 0 }
  let handle: unknown = null
  let runId = 0
  let disposed = false

  const emit = (next: RunState) => {
    state = next
    if (!disposed) onChange(state)
  }

  const clearPending = () => {
    if (handle !== null) scheduler.clearTimeout(handle)
    handle = null
  }

  const schedule = (id: number, nextStage: number, delay: number) => {
    handle = scheduler.setTimeout(() => {
      if (id !== runId || state.status !== 'running') return
      handle = null
      const isLast = nextStage >= stageCount - 1
      emit({ ...state, active: nextStage, status: isLast ? 'completed' : 'running' })
      if (!isLast) schedule(id, nextStage + 1, stepDelay)
    }, delay)
  }

  const begin = () => {
    clearPending()
    runId += 1
    emit({ status: 'running', active: -1, attempt: state.attempt + 1 })
    if (stageCount <= 0) {
      emit({ ...state, status: 'completed' })
      return
    }
    schedule(runId, 0, startDelay)
  }

  return {
    getState: () => state,
    start() {
      if (state.status === 'running') return
      begin()
    },
    cancel() {
      if (state.status !== 'running') return
      clearPending()
      runId += 1
      emit({ ...state, status: 'cancelled' })
    },
    /** Retry restarts from the first stage; only valid after a cancelled run. */
    retry() {
      if (state.status !== 'cancelled') return
      begin()
    },
    reset() {
      clearPending()
      runId += 1
      emit({ status: 'idle', active: -1, attempt: state.attempt })
    },
    dispose() {
      clearPending()
      runId += 1
      disposed = true
    },
  }
}
