"""
backend/app/routes/translation.py — Multi-language translation router.
Uses the `translate` package (Translator) as primary engine, with automatic language detection
and fallback to Google Translate GTX service.
Supports translating interview questions and candidate answers in regional languages (Telugu, Hindi, Tamil, etc.) into English.
"""

import json
import logging
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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


def _perform_translation(text: str, source_lang: str = "auto", target_lang: str = "en") -> Dict[str, Any]:
    """
    Translates text to target_lang using `translate` package (Translator) first,
    falling back to Google Translate GTX if needed.
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

    # 1. Primary: Use `translate` package (Translator)
    if Translator is not None:
        try:
            from_l = "autodetect" if source_lang in ("auto", None, "", "autodetect") else source_lang
            translator = Translator(to_lang=target_lang, from_lang=from_l)
            translated_result = translator.translate(cleaned)
            if translated_result:
                is_diff = translated_result.strip().lower() != cleaned.lower()
                return {
                    "original_text": text,
                    "translated_text": translated_result,
                    "source_lang": source_lang if source_lang != "auto" else "detected",
                    "source_lang_name": "English (Translated)",
                    "target_lang": target_lang,
                    "is_translated": is_diff,
                }
        except Exception as exc:
            err_str = str(exc).upper()
            if "DISTINCT" in err_str:
                # Text is already in target language (English)
                return {
                    "original_text": text,
                    "translated_text": cleaned,
                    "source_lang": target_lang,
                    "source_lang_name": "English",
                    "target_lang": target_lang,
                    "is_translated": False,
                }
            logger.warning(f"Translator from `translate` package raised {exc}, attempting fallback...")

    # 2. Fallback: Google Translate GTX
    try:
        encoded_text = urllib.parse.quote(cleaned)
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={encoded_text}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
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

            lang_name = LANGUAGE_NAMES.get(detected_code, detected_code.capitalize())

            return {
                "original_text": text,
                "translated_text": translated_text,
                "source_lang": detected_code,
                "source_lang_name": lang_name,
                "target_lang": target_lang,
                "is_translated": True,
            }
    except Exception as e:
        logger.warning(f"Translation fallback failed: {e}")
        return {
            "original_text": text,
            "translated_text": cleaned,
            "source_lang": "unknown",
            "source_lang_name": "Unknown",
            "target_lang": target_lang,
            "is_translated": False,
            "error": str(e),
        }


@router.post("/api/translate")
@router.post("/admin/translate")
def translate_text(req: TranslateRequest):
    """
    Translate text into English or target language using `translate` package.
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
    Translate multiple texts in a single batch request.
    """
    results = []
    for txt in req.texts:
        res = _perform_translation(
            text=txt,
            source_lang=req.source_lang or "auto",
            target_lang=req.target_lang or "en"
        )
        results.append(res)
    return {"results": results, "count": len(results)}


@router.post("/api/translate/qa")
@router.post("/admin/translate/qa")
def translate_qa(req: QATranslateRequest):
    """
    Translate both questions and candidate answers in batch using `translate` package.
    """
    translated_items = []
    for pair in req.items:
        trans_q = None
        trans_a = None

        if pair.question_text and pair.question_text.strip():
            res_q = _perform_translation(pair.question_text, target_lang=req.target_lang or "en")
            trans_q = res_q.get("translated_text") or pair.question_text

        if pair.answer_text and pair.answer_text.strip():
            res_a = _perform_translation(pair.answer_text, target_lang=req.target_lang or "en")
            trans_a = res_a.get("translated_text") or pair.answer_text

        translated_items.append({
            "id": pair.id,
            "original_question_text": pair.question_text,
            "question_text": trans_q or pair.question_text,
            "original_answer_text": pair.answer_text,
            "answer_text": trans_a or pair.answer_text,
            "is_translated": True,
        })

    return {"items": translated_items, "count": len(translated_items)}
