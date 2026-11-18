"""
ai_schemas.py -- Strict Pydantic v2 output models for all AI operations.

These replace the fragile extract_json() regex hack used throughout the app.
Every AI call now returns a type-safe, validated Python object.
"""

from __future__ import annotations
from typing import List, Union, Optional, Dict, Any
from pydantic import BaseModel, Field


class ResumeAnalysis(BaseModel):
    skills: List[str] = Field(default_factory=list)
    projects: List[str] = Field(default_factory=list)
    tools_and_technologies: List[str] = Field(default_factory=list)
    experience_level: str = "Unknown"
    domains: List[str] = Field(default_factory=list)
    important_keywords: List[str] = Field(default_factory=list)

    def to_dict(self) -> dict:
        return self.model_dump()


class InterviewQuestion(BaseModel):
    id: int = 1
    question: str
    difficulty: str = "Medium"
    type: str = "General"
    category: str = "General"

    def to_dict(self) -> dict:
        return self.model_dump()


class AnswerScore(BaseModel):
    is_relevant: bool = True
    key_facts_required: List[str] = Field(default_factory=list)
    facts_mentioned_by_candidate: List[str] = Field(default_factory=list)
    corrected_answer: str = "N/A"
    content_score: int = Field(default=0, ge=0, le=100)
    relevance_score: int = Field(default=0, ge=0, le=100)
    time_score: int = Field(default=0, ge=0, le=100)
    overall_score: int = Field(default=0, ge=0, le=100)
    clarity_score: int = Field(default=50, ge=0, le=100)
    technical_depth_score: int = Field(default=50, ge=0, le=100)
    confidence_score: int = Field(default=50, ge=0, le=100)
    feedback: str = "No feedback available."
    keywords: List[str] = Field(default_factory=list)

    def to_dict(self) -> dict:
        return self.model_dump()


class InterviewSummary(BaseModel):
    recommendation: str = "Borderline"
    strengths: str = "Unable to generate."
    weaknesses: str = "Unable to generate."
    communication_score: int = Field(default=50, ge=0, le=100)
    communication_reasoning: str = "N/A"
    skills_score: int = Field(default=50, ge=0, le=100)
    skills_reasoning: str = "N/A"
    competencies_score: int = Field(default=50, ge=0, le=100)
    competencies_reasoning: str = "N/A"
    personality_score: int = Field(default=50, ge=0, le=100)
    personality_reasoning: str = "N/A"
    culture_fit_score: int = Field(default=50, ge=0, le=100)
    culture_fit_reasoning: str = "N/A"
    job_success_score: int = Field(default=50, ge=0, le=100)
    job_success_reasoning: str = "N/A"
    detected_accent: str = "Unknown"

    def to_dict(self) -> dict:
        return self.model_dump()


class FollowupQuestion(BaseModel):
    id: int = 1
    question: str
    difficulty: str = "Medium"
    type: str = "Follow-up"
    category: str = "Deep Dive"

    def to_dict(self) -> dict:
        return self.model_dump()


class RecruiterQuestionItem(BaseModel):
    id: Union[int, str] = 1
    question: str = Field(..., description="The interview question text to ask verbally.")
    quick_summary: str = Field(..., description="1-sentence core concept for 2-second glanceability.")
    key_points: List[str] = Field(default_factory=list, description="2 to 4 must-mention concepts.")
    model_answer: str = Field(..., description="Complete, authoritative model answer.")
    category: str = Field(default="Core Technical")
    difficulty: str = Field(default="Medium")
    question_type: str = Field(default="discussion", description="Type: 'discussion', 'coding', or 'case_study'")
    coding_task: Optional[Dict[str, Any]] = Field(default=None, description="Optional coding challenge payload for Monaco editor.")
    case_study: Optional[Dict[str, Any]] = Field(default=None, description="Optional scenario-based case study narrative.")

    def to_dict(self) -> dict:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()


try:
    RecruiterQuestionItem.model_rebuild()
except Exception:
    pass


print("[OK] ai_schemas.py loaded | 6 Pydantic AI output models ready")
