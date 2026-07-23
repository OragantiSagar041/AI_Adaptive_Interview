const CANDIDATE_SESSION_KEY = 'candidateSessionAuth'

export function setCandidateSessionAuth(token, linkId, interviewId) {
  if (!token) return
  sessionStorage.setItem(CANDIDATE_SESSION_KEY, JSON.stringify({ token, linkId, interviewId }))
}

export function getCandidateSessionToken() {
  try {
    return JSON.parse(sessionStorage.getItem(CANDIDATE_SESSION_KEY) || '{}').token || ''
  } catch {
    return ''
  }
}

export function clearCandidateSessionAuth() {
  sessionStorage.removeItem(CANDIDATE_SESSION_KEY)
}

export function withCandidateAuth(options = {}, explicitToken = '') {
  const token = explicitToken || getCandidateSessionToken()
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return { ...options, headers }
}

export function candidateFetch(url, options = {}, explicitToken = '') {
  return fetch(url, withCandidateAuth(options, explicitToken))
}
