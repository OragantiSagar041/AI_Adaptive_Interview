export function getComputedStatus(candidate) {
  return candidate.status || 'pending'
}

const INDIAN_TIMEZONE = 'Asia/Kolkata'

export function formatShortDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-IN', { timeZone: INDIAN_TIMEZONE })
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = parseDateStringToUtc(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: INDIAN_TIMEZONE
  })
}

export function parseDateStringToUtc(value) {
  if (!value) return null
  const str = String(value).trim()
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/u.test(str)
  const isoLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/u
  const usDateLike = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/u

  if (hasTimezone) {
    return new Date(str.replace(' ', 'T'))
  }

  const usMatch = str.match(usDateLike)
  if (usMatch) {
    const [, month, day, year, hour, minute, second = '00'] = usMatch
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
  }

  if (isoLike.test(str)) {
    return new Date(str.replace(' ', 'T') + 'Z')
  }

  return new Date(str)
}

export function formatDateTimeMedium(value) {
  if (!value) return ''
  const date = parseDateStringToUtc(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: INDIAN_TIMEZONE
  })
}

export function formatScore(score) {
  return `${Number(score || 0).toFixed(1)}/100`
}
