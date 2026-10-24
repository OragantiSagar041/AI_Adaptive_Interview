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

/**
 * Returns human-readable relative time (e.g. "Just now", "2 hrs ago", "3 days ago").
 * Handles ISO timestamps as well as extracting timestamp from MongoDB ObjectId fallback.
 */
export function formatRelativeTime(dateValue, fallbackId) {
  let date = null

  if (dateValue) {
    date = parseDateStringToUtc(dateValue)
  }

  // Fallback to MongoDB ObjectId (first 8 hex chars represent creation timestamp in seconds)
  if ((!date || Number.isNaN(date.getTime())) && fallbackId && typeof fallbackId === 'string' && /^[0-9a-fA-F]{24}$/.test(fallbackId)) {
    try {
      const timestamp = parseInt(fallbackId.substring(0, 8), 16) * 1000
      date = new Date(timestamp)
    } catch (e) {
      // ignore
    }
  }

  if (!date || Number.isNaN(date.getTime())) {
    return 'Recently'
  }

  const now = Date.now()
  const diffMs = now - date.getTime()

  // Handle small clock skew
  if (diffMs < 60000) {
    return 'Just now'
  }

  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`
  }

  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) {
    return `${diffHrs} hr${diffHrs === 1 ? '' : 's'} ago`
  }

  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) {
    return '1 day ago'
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`
  }

  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} yr${diffYears === 1 ? '' : 's'} ago`
}
