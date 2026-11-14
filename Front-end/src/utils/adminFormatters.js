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


/**
 * Formats AI feedback from the Recruiter / Hiring Manager point of view (3rd person evaluation)
 * instead of coaching suggestions addressed to the candidate ("You did...", "To strengthen your answer...").
 */
export const formatFeedbackForRecruiter = (fb) => {
  if (!fb || typeof fb !== 'string') return fb || '';
  let cleaned = fb.trim();
  const transformations = [
    [/\bYou did a good job introducing yourself\b/gi, 'Candidate introduced themselves effectively'],
    [/\bYou did a good job (?:of )?asking\s+several questions\b/gi, 'Candidate asked relevant questions'],
    [/\bYou did a good job (?:of )?asking\b/gi, 'Candidate asked relevant questions regarding'],
    [/\bYou did a good job (?:of )?/gi, 'Candidate demonstrated competence in '],
    [/\bYou did well to\b/gi, 'Candidate successfully'],
    [/\bYou did not\b/gi, 'Candidate did not'],
    [/\bYou didn't\b/gi, 'Candidate did not'],
    [/\bTo strengthen your answer,?\s*(?:explicitly\s+)?(?:state|mention)?\s*(?:why)?\b/gi, 'Recruiter Note: Probe why'],
    [/\bTo improve your answer,?\s*\b/gi, 'Evaluation Gap: '],
    [/\bIn future,?\s*try to\s*\b/gi, 'Recruiter Recommendation: Probe whether candidate can '],
    [/\bIn future,?\s*\b/gi, 'In follow-up rounds, '],
    [/\bThis will help (?:the )?interviewers?\s+(?:quickly )?understand\b/gi, 'This would demonstrate to interviewers'],
    [/\bwhat you're curious about\b/gi, 'candidate motivation'],
    [/\bwhat you are curious about\b/gi, 'candidate motivation'],
    [/\bTry to\b/gi, 'Candidate should'],
    [/\bMake sure to\b/gi, 'Candidate needs to'],
    [/\bBe sure to\b/gi, 'Candidate needs to'],
    [/\bYour answer was\b/gi, 'Candidate response was'],
    [/\byour answer\b/gi, "the candidate's answer"],
    [/\byour response\b/gi, "the candidate's response"],
    [/\byour explanation\b/gi, "the candidate's explanation"],
    [/\byour education\b/gi, 'their education'],
    [/\byour enthusiasm\b/gi, 'their enthusiasm'],
    [/\byour past experiences\b/gi, 'their past experience'],
    [/\byour experience\b/gi, 'their experience'],
    [/\byour skills\b/gi, 'their skills'],
    [/\byour career goals\b/gi, 'their career goals'],
    [/\byour role\b/gi, 'the role'],
    [/\byour\b/gi, 'their'],
    [/\byourself\b/gi, 'themselves'],
    [/\bYou demonstrated\b/gi, 'Candidate demonstrated'],
    [/\bYou explained\b/gi, 'Candidate explained'],
    [/\bYou mentioned\b/gi, 'Candidate mentioned'],
    [/\bYou provided\b/gi, 'Candidate provided'],
    [/\bYou answered\b/gi, 'Candidate answered'],
    [/\bYou articulated\b/gi, 'Candidate articulated'],
    [/\bYou covered\b/gi, 'Candidate covered'],
    [/\bYou struggled\b/gi, 'Candidate struggled'],
    [/\bYou missed\b/gi, 'Candidate missed'],
    [/\bexcites you\b/gi, 'excites them'],
    [/\bhow you will\b/gi, 'how they will'],
    [/\bhow you would\b/gi, 'how they would'],
    [/\bhow you\b/gi, 'how they'],
    [/\bwhat you\b/gi, 'what they'],
    [/\bthat you\b/gi, 'that they'],
    [/\byou will\b/gi, 'they will'],
    [/\byou would\b/gi, 'they would'],
    [/\byou are\b/gi, 'they are'],
    [/\byou have\b/gi, 'they have'],
    [/\byou can\b/gi, 'they can'],
    [/\bYou should\b/gi, 'Candidate should'],
    [/\bYou could\b/gi, 'Candidate could'],
    [/\bYou can\b/gi, 'Candidate can'],
    [/\bYou are\b/gi, 'Candidate is'],
    [/\bYou were\b/gi, 'Candidate was'],
    [/\bYou have\b/gi, 'Candidate has'],
    [/\bYou\b/gi, 'Candidate'],
    [/\byou\b/gi, 'the candidate']
  ];
  for (const [pattern, repl] of transformations) {
    cleaned = cleaned.replace(pattern, repl);
  }
  return cleaned;
};
