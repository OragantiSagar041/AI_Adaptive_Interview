import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from ai_schemas import ResumeAnalysis, AnswerScore, InterviewSummary, FollowupQuestion, InterviewQuestion

def test_resume_analysis_defaults():
    r = ResumeAnalysis()
    assert r.experience_level == "Unknown"
    assert isinstance(r.skills, list)
    assert r.to_dict()["experience_level"] == "Unknown"

def test_answer_score_validation():
    s = AnswerScore(
        content_score=40,
        relevance_score=20,
        time_score=15,
        overall_score=75,
        feedback="Great answer"
    )
    assert s.overall_score == 75
    assert s.content_score == 40
    assert s.feedback == "Great answer"

def test_answer_score_bounds():
    s = AnswerScore()
    assert s.content_score == 0
    assert s.clarity_score == 50

def test_interview_summary():
    summ = InterviewSummary(
        recommendation="Hire",
        communication_score=85
    )
    assert summ.recommendation == "Hire"
    assert summ.communication_score == 85

def test_followup_question():
    fq = FollowupQuestion(question="Why did you choose React?")
    assert fq.difficulty == "Medium"
    assert fq.question == "Why did you choose React?"

def test_interview_question():
    iq = InterviewQuestion(question="Explain CORS")
    assert iq.category == "General"
