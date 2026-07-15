export function getComputedStatus(candidate) {
  return candidate.status || 'pending'
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
