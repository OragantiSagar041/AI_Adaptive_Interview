export function unwrapInterviewPayload(value) {
  let payload = value
  for (let depth = 0; depth < 3; depth += 1) {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') break
    const nested = payload.data ?? payload.payload ?? payload.result
    if (!nested || typeof nested !== 'object') break
    // Preserve envelope metadata such as status/message while allowing the
    // actual response fields to win. Production gateways commonly wrap JSON.
    payload = Array.isArray(nested) ? nested : { ...payload, ...nested }
    if (!Array.isArray(payload)) {
      delete payload.data
      delete payload.payload
      delete payload.result
    }
  }
  return payload || {}
}

export function normalizeInterviewQuestions(payloadOrQuestions) {
  const payload = Array.isArray(payloadOrQuestions)
    ? payloadOrQuestions
    : unwrapInterviewPayload(payloadOrQuestions)
  const raw = Array.isArray(payload)
    ? payload
    : payload.questions ?? payload.interview_questions ?? payload.question_list ??
      (payload.first_question ? [payload.first_question] : [])

  return (Array.isArray(raw) ? raw : []).map((question, index) => {
    const item = typeof question === 'string' ? { text: question } : (question || {})
    return {
      ...item,
      id: item.id ?? item.question_id ?? index + 1,
      text: item.text ?? item.question_text ?? item.question ?? item.prompt ?? item.scenario ?? '',
      type: item.type ?? item.question_type ?? item.category ?? 'Interview'
    }
  }).filter(question => String(question.text).trim())
}
