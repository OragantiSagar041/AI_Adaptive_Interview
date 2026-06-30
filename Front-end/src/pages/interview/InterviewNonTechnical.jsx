import React from 'react'
import { InterviewBase } from './InterviewBase'
import api from '../../utils/api'

export const InterviewNonTechnical = () => {

  const startRoundTwo = async ({
    verbalQuestionsLength,
    savedIndex,
    interviewId,
    setQuestions,
    setCurrentQuestionIndex,
    setCodingRoundLoading
  }) => {
    setCodingRoundLoading(true)
    try {
      const payload = await api.post(`/case-study/start`, { interview_id: interviewId }).then(r => r.data)

      const caseStudyQuestions = payload.case_study_round?.questions || []

      const formattedQs = caseStudyQuestions.map((q, idx) => {
        const text = `📁 CASE STUDY ROUND: ${q.skill_tested || 'Scenario'}\n\n${q.scenario}\n\nQuestion: ${q.question}`
        return {
          id: verbalQuestionsLength + idx + 1,
          text: text,
          question: text,
          type: 'case_study',
          category: 'Case Study',
          difficulty: 'Medium',
          caseStudyIndex: idx,
          evaluationCriteria: q.evaluation_criteria || []
        }
      })

      setQuestions(prev => [...prev, ...formattedQs])
      
      const targetIndex = (savedIndex !== null && savedIndex >= verbalQuestionsLength && savedIndex < verbalQuestionsLength + formattedQs.length) 
        ? savedIndex 
        : verbalQuestionsLength
      
      setCurrentQuestionIndex(targetIndex)
    } catch (err) {
      console.error('Case study round start failed:', err)
      throw err
    } finally {
      setCodingRoundLoading(false)
    }
  }

  return (
    <InterviewBase
      interviewType="Non-Technical"
      startRoundTwo={startRoundTwo}
      renderRoundTwoUI={null}
    />
  )
}
export default InterviewNonTechnical
