import { describe, expect, it } from 'vitest'
import { createWorkflowRunner, type RunState, type Scheduler } from './workflow-runner'

function fakeScheduler() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  const scheduler: Scheduler = {
    setTimeout(fn, ms) {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout(handle) {
      timers.delete(handle as number)
    },
  }
  const advance = (ms: number) => {
    const target = now + ms
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0])
      now = due[1].at
      due[1].fn()
    }
    now = target
  }
  return { scheduler, advance, pending: () => timers.size }
}

function setup(stageCount = 4) {
  const clock = fakeScheduler()
  const states: RunState[] = []
  const runner = createWorkflowRunner({ stageCount, scheduler: clock.scheduler, onChange: s => states.push(s) })
  return { ...clock, runner, states }
}

describe('workflow runner', () => {
  it('runs through every stage and completes', () => {
    const { runner, advance } = setup()
    runner.start()
    advance(200)
    expect(runner.getState()).toMatchObject({ status: 'running', active: 0 })
    advance(170 * 3)
    expect(runner.getState()).toMatchObject({ status: 'completed', active: 3 })
  })

  it('ignores start while a run is in progress', () => {
    const { runner, advance } = setup()
    runner.start()
    advance(200)
    runner.start()
    expect(runner.getState().attempt).toBe(1)
    expect(runner.getState().active).toBe(0)
  })

  it('cancel stops progress and clears the pending timer', () => {
    const { runner, advance, pending } = setup()
    runner.start()
    advance(370)
    runner.cancel()
    const frozen = runner.getState()
    expect(frozen.status).toBe('cancelled')
    expect(pending()).toBe(0)
    advance(5000)
    expect(runner.getState()).toEqual(frozen)
  })

  it('retry restarts from the first stage as a new attempt', () => {
    const { runner, advance } = setup()
    runner.start()
    advance(370)
    runner.cancel()
    runner.retry()
    expect(runner.getState()).toMatchObject({ status: 'running', active: -1, attempt: 2 })
    advance(200)
    expect(runner.getState().active).toBe(0)
    advance(170 * 3)
    expect(runner.getState().status).toBe('completed')
  })

  it('does not let a cancelled run leak stale ticks into a retry', () => {
    const { runner, advance, pending } = setup()
    runner.start()
    advance(200)
    runner.cancel()
    runner.retry()
    expect(pending()).toBe(1)
    advance(200)
    expect(runner.getState().active).toBe(0)
  })

  it('retry is a no-op unless the run was cancelled', () => {
    const { runner } = setup()
    runner.retry()
    expect(runner.getState().status).toBe('idle')
  })

  it('reset returns to idle and cancels timers', () => {
    const { runner, advance, pending } = setup()
    runner.start()
    advance(200)
    runner.reset()
    expect(runner.getState()).toMatchObject({ status: 'idle', active: -1 })
    expect(pending()).toBe(0)
  })

  it('dispose stops timers and suppresses further updates', () => {
    const { runner, advance, pending, states } = setup()
    runner.start()
    advance(200)
    const count = states.length
    runner.dispose()
    advance(5000)
    expect(pending()).toBe(0)
    expect(states.length).toBe(count)
  })
})
