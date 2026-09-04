export interface RestTimerState {
  planned_seconds: number
  ends_at_ms: number | null
  paused_remaining_seconds: number | null
}

export function start_rest_timer(
  planned_seconds: number,
  now_ms: number,
): RestTimerState {
  const safe_seconds = Math.max(0, Math.round(planned_seconds))

  return {
    planned_seconds: safe_seconds,
    ends_at_ms: now_ms + safe_seconds * 1000,
    paused_remaining_seconds: null,
  }
}

export function rest_seconds_remaining(
  timer: RestTimerState,
  now_ms: number,
): number {
  if (timer.ends_at_ms === null) {
    return Math.max(0, timer.paused_remaining_seconds ?? 0)
  }

  return Math.max(0, Math.ceil((timer.ends_at_ms - now_ms) / 1000))
}

export function pause_rest_timer(
  timer: RestTimerState,
  now_ms: number,
): RestTimerState {
  if (timer.ends_at_ms === null) return timer

  return {
    ...timer,
    ends_at_ms: null,
    paused_remaining_seconds: rest_seconds_remaining(timer, now_ms),
  }
}

export function resume_rest_timer(
  timer: RestTimerState,
  now_ms: number,
): RestTimerState {
  if (timer.ends_at_ms !== null) return timer

  const remaining = Math.max(0, timer.paused_remaining_seconds ?? 0)

  return {
    ...timer,
    ends_at_ms: now_ms + remaining * 1000,
    paused_remaining_seconds: null,
  }
}

export function add_rest_seconds(
  timer: RestTimerState,
  seconds: number,
): RestTimerState {
  const addition = Math.max(0, Math.round(seconds))

  if (timer.ends_at_ms !== null) {
    return {
      ...timer,
      ends_at_ms: timer.ends_at_ms + addition * 1000,
    }
  }

  return {
    ...timer,
    paused_remaining_seconds:
      Math.max(0, timer.paused_remaining_seconds ?? 0) + addition,
  }
}

export function reset_rest_timer(
  timer: RestTimerState,
  now_ms: number,
): RestTimerState {
  return start_rest_timer(timer.planned_seconds, now_ms)
}
