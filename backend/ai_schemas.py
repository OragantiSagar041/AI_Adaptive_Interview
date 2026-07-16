"""
ai_schemas.py -- Strict Pydantic v2 output models for all AI operations.

These replace the fragile extract_json() regex hack used throughout the app.
Every AI call now returns a type-safe, validated Python object.
"""

from __future__ import annotations
from typing import List
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
    corrected_answer: str = "N/A"
    key_facts_required: List[str] = Field(default_factory=list)
    facts_mentioned_by_candidate: List[str] = Field(default_factory=list)
    content_score: int = Field(default=0, ge=0, le=50)
    relevance_score: int = Field(default=0, ge=0, le=30)
    time_score: int = Field(default=0, ge=0, le=20)
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


print("[OK] ai_schemas.py loaded | 5 Pydantic AI output models ready")
