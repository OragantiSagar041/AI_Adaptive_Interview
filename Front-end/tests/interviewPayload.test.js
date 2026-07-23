import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeInterviewQuestions,
  unwrapInterviewPayload,
} from '../src/pages/interview/interviewPayload.js'

test('unwraps nested production gateway envelopes without losing metadata', () => {
  const payload = unwrapInterviewPayload({
    status: 'ok',
    data: {
      request_id: 'req-1',
      result: {
        questions: [{ question_id: 42, question_text: 'Tell me about yourself' }],
      },
    },
  })

  assert.equal(payload.status, 'ok')
  assert.equal(payload.request_id, 'req-1')
  assert.equal(payload.questions.length, 1)
})

test('normalizes backend question aliases into the frontend contract', () => {
  const questions = normalizeInterviewQuestions({
    payload: {
      interview_questions: [
        { question_id: 'q-1', question_text: 'First?', question_type: 'Technical' },
        { question: 'Second?', category: 'Behavioral' },
        'Third?',
        { question_text: '   ' },
      ],
    },
  })

  assert.deepEqual(questions, [
    {
      question_id: 'q-1',
      question_text: 'First?',
      question_type: 'Technical',
      id: 'q-1',
      text: 'First?',
      type: 'Technical',
    },
    {
      question: 'Second?',
      category: 'Behavioral',
      id: 2,
      text: 'Second?',
      type: 'Behavioral',
    },
    {
      text: 'Third?',
      id: 3,
      type: 'Interview',
    },
  ])
})

test('accepts a single first_question fallback and rejects empty content', () => {
  assert.deepEqual(
    normalizeInterviewQuestions({ first_question: { id: 9, prompt: 'Begin' } }),
    [{ id: 9, prompt: 'Begin', text: 'Begin', type: 'Interview' }],
  )
  assert.deepEqual(normalizeInterviewQuestions(null), [])
})
