export function getComputedStatus(candidate) {
  const currentStatus = candidate.status || 'pending'
  if (currentStatus === 'pending' && candidate.expires_at) {
    if (new Date() > new Date(candidate.expires_at)) {
      return 'expired'
    }
  }
  return currentStatus
}

export function formatShortDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString()
}

export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatScore(score) {
  return `${Number(score || 0).toFixed(1)}/100`
}
