/**
 * Navigation must not tear down a workout or an in-progress gym editor when
 * Supabase returns new records. Those screens refresh their own durable state.
 */
export function should_remount_route_after_sync(pathname: string, applied: number): boolean {
  return applied > 0 && !pathname.startsWith('/workout/') && pathname !== '/gyms'
}

/** Workout start/resume is a home-screen action, not a global blocking modal. */
export function should_show_daily_session_prompt(pathname: string): boolean {
  return pathname === '/plan'
}
