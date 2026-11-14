export function clockMinutes(clock) {
  if (typeof clock !== 'string') return null
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(clock)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function displayClock(clock) {
  const minutes = clockMinutes(clock)
  if (minutes === null) return '—'
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2000, 0, 1, hour, minute))
}

export function scheduleError(start, end) {
  const startMinutes = clockMinutes(start)
  const endMinutes = clockMinutes(end)
  if (startMinutes === null || endMinutes === null) return 'missing'
  if (endMinutes <= startMinutes) return 'order'
  return null
}
