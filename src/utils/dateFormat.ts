const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function format_local_date_display(
  date_local: string | null | undefined,
  fallback = '—',
): string {
  if (!date_local) return fallback
  const match = LOCAL_DATE_PATTERN.exec(date_local)
  if (!match) return date_local
  return `${match[3]}/${match[2]}/${match[1]}`
}
