"""
backend/app/routes/translation.py — Multi-language translation router.
Uses the `translate` package (Translator) as primary engine, with automatic language detection
and fallback to Google Translate GTX service.
Supports translating interview questions and candidate answers in regional languages (Telugu, Hindi, Tamil, etc.) into English.
"""

import os
import json
import logging
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    import groq
except ImportError:
    groq = None

try:
    from translate import Translator
except ImportError:
    Translator = None

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Translation"])

# Language code to friendly name map
LANGUAGE_NAMES: Dict[str, str] = {
    "auto": "Auto Detect",
    "te": "Telugu",
    "hi": "Hindi",
    "ta": "Tamil",
    "kn": "Kannada",
    "ml": "Malayalam",
    "bn": "Bengali",
    "mr": "Marathi",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "ur": "Urdu",
    "or": "Odia",
    "as": "Assamese",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "zh": "Chinese",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "id": "Indonesian",
    "ms": "Malay",
    "th": "Thai",
    "nl": "Dutch",
    "pl": "Polish",
    "sv": "Swedish",
    "el": "Greek",
    "he": "Hebrew",
    "en": "English",
}


class TranslateRequest(BaseModel):
    text: str = Field(..., description="Text to translate")
    target_lang: Optional[str] = Field("en", description="Target language code (default: en)")
    source_lang: Optional[str] = Field("auto", description="Source language code (default: auto)")


class BatchTranslateRequest(BaseModel):
    texts: List[str] = Field(..., description="List of texts to translate")
    target_lang: Optional[str] = Field("en", description="Target language code (default: en)")
    source_lang: Optional[str] = Field("auto", description="Source language code (default: auto)")


class QAPair(BaseModel):
    id: Optional[str] = None
    question_text: Optional[str] = None
    answer_text: Optional[str] = None


class QATranslateRequest(BaseModel):
    items: List[QAPair] = Field(..., description="List of question-answer pairs")
    target_lang: Optional[str] = Field("en", description="Target language code")


def _get_groq_client():
    if not groq:
        return None
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEYS", "").split(",")[0].strip()
    if not api_key:
        return None
    try:
        return groq.Groq(api_key=api_key)
    except Exception as e:
        logger.warning(f"Failed to initialize Groq client for translation: {e}")
        return None


def _perform_translation(text: str, source_lang: str = "auto", target_lang: str = "en") -> Dict[str, Any]:
    """
    Translates text to target_lang using Google Chrome Extension API (clients5) as primary,
    Groq AI as high-fidelity fallback, and Google GTX as tertiary engine.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return {
            "original_text": text or "",
            "translated_text": "",
            "source_lang": "en",
            "source_lang_name": "English",
            "target_lang": target_lang,
            "is_translated": False,
        }

    # 1. Primary Engine: Google Chrome Translation API (clients5) - fast, reliable, no 429 errors
    try:
        url = "https://clients5.google.com/translate_a/t"
        resp = requests.get(
            url,
            params={
                "client": "dict-chrome-ex",
                "sl": source_lang or "auto",
                "tl": target_lang,
                "q": cleaned
            },
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=8
        )
        if resp.status_code == 200:
            data = resp.json()
            translated_text = ""
            detected_code = source_lang or "auto"
            if isinstance(data, list) and len(data) > 0:
                if isinstance(data[0], list):
                    translated_text = "".join([part[0] for part in data if isinstance(part, list) and len(part) > 0 and part[0]])
                    if len(data[0]) > 1 and isinstance(data[0][1], str):
                        detected_code = data[0][1].strip().lower()
                elif isinstance(data[0], str):
                    translated_text = data[0]
                    if len(data) > 1 and isinstance(data[1], str):
                        detected_code = data[1].strip().lower()

            if translated_text and translated_text.strip():
                is_diff = translated_text.strip().lower() != cleaned.lower()
                if is_diff or target_lang in ("en", detected_code):
                    return {
                        "original_text": text,
                        "translated_text": translated_text.strip(),
                        "source_lang": detected_code,
                        "source_lang_name": LANGUAGE_NAMES.get(detected_code, "Detected"),
                        "target_lang": target_lang,
                        "is_translated": True,
                    }
    except Exception as e:
        logger.warning(f"clients5 translation error for '{cleaned[:30]}': {e}")

    # 2. Secondary Engine: Groq AI Translation (qwen3.8-27b)
    gclient = _get_groq_client()
    if gclient:
        try:
            target_name = LANGUAGE_NAMES.get(target_lang, target_lang)
            res = gclient.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=[
                    {
                        "role": "system",
                        "content": f"You are a professional multilingual translator for interview questions and answers. Translate the following text directly and accurately into {target_name}. Preserve technical terms where appropriate. Output ONLY the translated text without explanations, greetings, notes, or markdown formatting."
                    },
                    {"role": "user", "content": cleaned}
                ],
                temperature=0.1,
                max_tokens=1000
            )
            trans_ai = res.choices[0].message.content.strip()
            if trans_ai:
                return {
                    "original_text": text,
                    "translated_text": trans_ai,
                    "source_lang": source_lang or "auto",
                    "source_lang_name": LANGUAGE_NAMES.get(source_lang, "Original"),
                    "target_lang": target_lang,
                    "is_translated": True,
                }
        except Exception as e:
            logger.warning(f"Groq translation fallback failed: {e}")

    # 3. Tertiary Engine: Google Translate GTX
    try:
        encoded_text = urllib.parse.quote(cleaned)
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={encoded_text}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw_body = resp.read().decode("utf-8")
            data = json.loads(raw_body)
            segments = []
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                for part in data[0]:
                    if isinstance(part, list) and len(part) > 0 and part[0]:
                        segments.append(part[0])
            translated_text = "".join(segments) if segments else cleaned
            detected_code = "auto"
            if len(data) > 2 and isinstance(data[2], str):
                detected_code = data[2].strip().lower()
            elif len(data) > 1 and isinstance(data[1], str):
                detected_code = data[1].strip().lower()

            is_diff = translated_text.strip().lower() != cleaned.lower()
            if is_diff or target_lang in ("en", detected_code):
                return {
                    "original_text": text,
                    "translated_text": translated_text,
                    "source_lang": detected_code,
                    "source_lang_name": LANGUAGE_NAMES.get(detected_code, detected_code.capitalize()),
                    "target_lang": target_lang,
                    "is_translated": True,
                }
    except Exception as e:
        logger.warning(f"Google GTX translation failed: {e}")

    # 4. Final fallback
    return {
        "original_text": text,
        "translated_text": cleaned,
        "source_lang": "unknown",
        "source_lang_name": "Unknown",
        "target_lang": target_lang,
        "is_translated": False,
    }


@router.post("/api/translate")
@router.post("/admin/translate")
def translate_text(req: TranslateRequest):
    """
    Translate text into target language using high-accuracy multi-engine translation.
    """
    try:
        result = _perform_translation(
            text=req.text,
            source_lang=req.source_lang or "auto",
            target_lang=req.target_lang or "en"
        )
        return result
    except Exception as e:
        logger.error(f"Error in translate_text endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@router.post("/api/translate/batch")
@router.post("/admin/translate/batch")
def translate_batch(req: BatchTranslateRequest):
    """
    Translate multiple texts in a single batch request in parallel.
    """
    target = req.target_lang or "en"
    src = req.source_lang or "auto"

    def _t(txt: str):
        return _perform_translation(text=txt, source_lang=src, target_lang=target)

    with ThreadPoolExecutor(max_workers=min(10, max(1, len(req.texts)))) as executor:
        results = list(executor.map(_t, req.texts))

    return {"results": results, "count": len(results)}


@router.post("/api/translate/qa")
@router.post("/admin/translate/qa")
def translate_qa(req: QATranslateRequest):
    """
    Translate both questions and candidate answers concurrently with high reliability.
    """
    target = req.target_lang or "en"
    items = req.items or []

    def translate_pair(pair: QAPair) -> Dict[str, Any]:
        trans_q = pair.question_text
        trans_a = pair.answer_text

        if pair.question_text and pair.question_text.strip():
            res_q = _perform_translation(pair.question_text, target_lang=target)
            if res_q.get("is_translated") and res_q.get("translated_text"):
                trans_q = res_q["translated_text"]

        if pair.answer_text and pair.answer_text.strip():
            res_a = _perform_translation(pair.answer_text, target_lang=target)
            if res_a.get("is_translated") and res_a.get("translated_text"):
                trans_a = res_a["translated_text"]

        is_any_translated = (trans_q != pair.question_text) or (trans_a != pair.answer_text)

        return {
            "id": pair.id,
            "original_question_text": pair.question_text,
            "question_text": trans_q or pair.question_text,
            "original_answer_text": pair.answer_text,
            "answer_text": trans_a or pair.answer_text,
            "is_translated": is_any_translated,
        }

    with ThreadPoolExecutor(max_workers=min(10, max(1, len(items)))) as executor:
        translated_items = list(executor.map(translate_pair, items))

    return {"items": translated_items, "count": len(translated_items)}
