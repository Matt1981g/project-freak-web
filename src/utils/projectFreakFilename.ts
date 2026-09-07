function compact_date(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) {
    throw new Error('PROJECT FREAK filename date must be YYYY-MM-DD or ISO date-time.')
  }
  return `${match[1]}${match[2]}${match[3]}`
}

export function project_freak_time_stamp(value: string): string {
  const match = /T(\d{2}):(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}${match[2]}${match[3]}` : '000000'
}

export function project_freak_filename(
  date_value: string,
  description: string,
  extension: string,
): string {
  const clean_description = description
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!clean_description) {
    throw new Error('PROJECT FREAK filename description cannot be empty.')
  }

  const clean_extension = extension
    .trim()
    .replace(/^\.+/, '')
    .toLowerCase()

  if (!clean_extension || /[^a-z0-9]/.test(clean_extension)) {
    throw new Error('PROJECT FREAK filename extension is invalid.')
  }

  return `${compact_date(date_value)}_PROFREAK_${clean_description}.${clean_extension}`
}
