"""
HireIQ Language & Accent Detection Service
Multi-tier detection engine:
1. LLM Semantic & Phonetic Analysis (when online)
2. Deterministic NLP Linguistic Marker & Colloquialism Parsing (offline)
3. Script / Unicode Frequency Analysis (multilingual offline)
4. Candidate Demographics & Geolocation Context (fallback when speech is brief or 0-answer session)
"""

import re
import unicodedata
from typing import Dict, Any, Optional, List

# ── 1. Unicode Script Analyzers ───────────────────────────────────────────

SCRIPT_RANGES = {
    "Devanagari (Hindi/Marathi)": (0x0900, 0x097F),
    "Bengali": (0x0980, 0x09FF),
    "Gurmukhi (Punjabi)": (0x0A00, 0x0A7F),
    "Gujarati": (0x0A80, 0x0AFF),
    "Odia": (0x0B00, 0x0B7F),
    "Tamil": (0x0B80, 0x0BFF),
    "Telugu": (0x0C00, 0x0C7F),
    "Kannada": (0x0C80, 0x0CFF),
    "Malayalam": (0x0D00, 0x0D7F),
    "Arabic/Urdu": (0x0600, 0x06FF),
    "Cyrillic (Russian)": (0x0400, 0x04FF),
    "CJK (Chinese/Japanese)": (0x4E00, 0x9FFF),
}

# ── 2. Linguistic Markers & Idioms ─────────────────────────────────────────

INDIAN_ENGLISH_MARKERS = [
    r"\bdoubt\b", r"\bdoubts\b", r"\bprepone\b", r"\bpassed\s+out\b", r"\bpassout\b",
    r"\bnative\s+place\b", r"\brevert\s+back\b", r"\bdo\s+the\s+needful\b", r"\bupgradation\b",
    r"\bdo\s+one\s+thing\b", r"\btoday\s+morning\b", r"\byesterday\s+night\b", r"\bout\s+of\s+station\b",
    r"\bitself\b", r"\bonly\b", r"\bbatchmate\b", r"\bfresher\b", r"\blakh\b", r"\bcrore\b",
    r"\blpa\b", r"\brupees\b", r"\bb\.?tech\b", r"\bmca\b", r"\bbca\b", r"\bcse\b",
    r"\biit\b", r"\bnit\b", r"\bbits\b", r"\bjntu\b", r"\banna\s+univ\w*\b", r"\bvtu\b",
    r"\bhyderabad\b", r"\bbengaluru\b", r"\bbangalore\b", r"\bpune\b", r"\bmumbai\b",
    r"\bdelhi\b", r"\bnoida\b", r"\bgurgaon\b", r"\bgurugram\b", r"\bchennai\b", r"\bkolkata\b"
]

US_ENGLISH_MARKERS = [
    r"\bgotten\b", r"\bmath\b", r"\bcolor\b", r"\bcenter\b", r"\bprogram\b",
    r"\bsemester\b", r"\bundergrad\b", r"\bcollege\b", r"\bgpa\b", r"\bapartment\b",
    r"\bzip\s*code\b", r"\bcell\s*phone\b", r"\btraffic\s*circle\b", r"\bsidewalk\b",
    r"\bfall\s+semester\b", r"\bspring\s+semester\b"
]

UK_ENGLISH_MARKERS = [
    r"\bmaths\b", r"\bwhilst\b", r"\bamongst\b", r"\bcolour\b", r"\bcentre\b",
    r"\bprogramme\b", r"\buni\b", r"\bcv\b", r"\bpostcode\b", r"\bmobile\s*phone\b",
    r"\bcheers\b", r"\bbrilliant\b", r"\bfortnight\b", r"\blorry\b", r"\bpavement\b"
]

AU_ENGLISH_MARKERS = [
    r"\bg'?day\b", r"\bmate\b", r"\barvo\b", r"\bheaps\s+of\b", r"\breckon\b",
    r"\buni\b", r"\bfooty\b"
]

ROMANIZED_HINDI_WORDS = [
    "haan", "nahi", "kripya", "dhanyawad", "mera", "meri", "mere", "mujhe", "hum",
    "aap", "karna", "hona", "theek", "achha", "kya", "kyun", "kaise", "samajh",
    "batana", "bolna", "kaam", "puchna", "bhai", "yaar"
]

ROMANIZED_TELUGU_WORDS = [
    "enti", "emiti", "cheppandi", "garu", "meeru", "nenu", "bagundi", "avunu",
    "ledu", "chala", "ela", "undhi", "undi", "chesanu", "chesanu", "telugu"
]


def detect_script_language(text: str) -> Optional[str]:
    """Check if text contains characters from distinct non-Latin scripts."""
    if not text:
        return None
    counts = {name: 0 for name in SCRIPT_RANGES}
    for char in text:
        cp = ord(char)
        for name, (start, end) in SCRIPT_RANGES.items():
            if start <= cp <= end:
                counts[name] += 1
                break
    for name, cnt in counts.items():
        if cnt >= 5:
            if "Hindi/Marathi" in name:
                return "Hindi / Marathi"
            return name.split(" ")[0]
    return None


def detect_romanized_language(text: str) -> Optional[str]:
    """Check for romanized Indian/foreign language words in English text."""
    lower_text = text.lower()
    words = re.findall(r"\b\w+\b", lower_text)
    if not words:
        return None
    word_set = set(words)
    
    hindi_matches = sum(1 for w in ROMANIZED_HINDI_WORDS if w in word_set)
    if hindi_matches >= 3 or (len(words) < 15 and hindi_matches >= 2):
        return "Hindi (Hinglish)"
        
    telugu_matches = sum(1 for w in ROMANIZED_TELUGU_WORDS if w in word_set)
    if telugu_matches >= 3 or (len(words) < 15 and telugu_matches >= 2):
        return "Telugu"
        
    return None


def detect_english_accent_heuristic(text: str, candidate_profile: Optional[Dict[str, Any]] = None) -> str:
    """Analyze English text + demographics to determine regional English accent."""
    lower_text = text.lower() if text else ""
    
    ind_score = sum(1 for pattern in INDIAN_ENGLISH_MARKERS if re.search(pattern, lower_text, re.IGNORECASE))
    us_score = sum(1 for pattern in US_ENGLISH_MARKERS if re.search(pattern, lower_text, re.IGNORECASE))
    uk_score = sum(1 for pattern in UK_ENGLISH_MARKERS if re.search(pattern, lower_text, re.IGNORECASE))
    au_score = sum(1 for pattern in AU_ENGLISH_MARKERS if re.search(pattern, lower_text, re.IGNORECASE))

    # Demographics check
    if candidate_profile:
        phone = str(candidate_profile.get("candidate_phone") or candidate_profile.get("phone") or "")
        loc = str(candidate_profile.get("location") or "").lower()
        res_text = str(candidate_profile.get("resume_text") or candidate_profile.get("profile_text") or "").lower()
        
        # Indian indicators
        if (
            phone.startswith("+91")
            or any(w in loc for w in ["india", "telangana", "hyderabad", "bangalore", "bengaluru", "pune", "mumbai", "delhi", "noida", "chennai", "kolkata", "andhra", "karnataka", "maharashtra", "tamil nadu"])
            or ("+91" in res_text or "india" in res_text or "hyderabad" in res_text or "bengaluru" in res_text or "bangalore" in res_text or "pune" in res_text or "mumbai" in res_text or "delhi" in res_text)
        ):
            ind_score += 4
        elif (
            phone.startswith("+1")
            or any(w in loc for w in ["united states", "usa", "california", "texas", "new york", "seattle", "florida", "chicago", "san francisco"])
            or ("usa" in res_text or "united states" in res_text or "california" in res_text or "texas" in res_text)
        ):
            us_score += 4
        elif (
            phone.startswith("+44")
            or any(w in loc for w in ["united kingdom", "uk", "london", "manchester", "edinburgh", "birmingham"])
            or ("united kingdom" in res_text or " london" in res_text)
        ):
            uk_score += 4
        elif (
            phone.startswith("+61")
            or any(w in loc for w in ["australia", "sydney", "melbourne", "brisbane"])
            or ("australia" in res_text or "sydney" in res_text)
        ):
            au_score += 4

    scores = [
        ("Indian Accent", ind_score),
        ("American (US) Accent", us_score),
        ("British (UK) Accent", uk_score),
        ("Australian Accent", au_score)
    ]
    scores.sort(key=lambda x: x[1], reverse=True)
    
    if scores[0][1] >= 2:
        return scores[0][0]
    return "Neutral English Accent"


def detect_language_and_accent_offline(
    text: str,
    candidate_profile: Optional[Dict[str, Any]] = None,
    interview_language: str = "English"
) -> Dict[str, str]:
    """Deterministic offline fallback for language & accent detection."""
    # 1. Check Unicode scripts
    script_lang = detect_script_language(text)
    if script_lang:
        accent_label = f"Native Accent"
        display_lang = script_lang.split(" ")[0] if "/" in script_lang else script_lang
        return {
            "language": display_lang,
            "accent": accent_label,
            "detected_accent": f"{display_lang} ({accent_label})"
        }
        
    # 2. Check Romanized regional speech
    roman_lang = detect_romanized_language(text)
    if roman_lang:
        accent_label = "Regional Dialect"
        return {
            "language": roman_lang,
            "accent": accent_label,
            "detected_accent": f"{roman_lang} ({accent_label})"
        }

    # 3. Determine base language (default to interview_language or English)
    base_lang = interview_language if interview_language and interview_language != "Unknown" else "English"
    
    if base_lang.lower() == "english":
        accent = detect_english_accent_heuristic(text, candidate_profile)
        combined = f"English ({accent})"
        return {
            "language": "English",
            "accent": accent,
            "detected_accent": combined
        }
    else:
        # Non-English base language (e.g. Hindi, Spanish, Telugu)
        accent = f"Native {base_lang} Accent"
        return {
            "language": base_lang,
            "accent": accent,
            "detected_accent": f"{base_lang} ({accent})"
        }


def detect_language_and_accent(
    text_or_answers: Any,
    candidate_profile: Optional[Dict[str, Any]] = None,
    interview_language: str = "English"
) -> Dict[str, str]:
    """
    Main entry point for Language and Accent Detection.
    Combines speech transcript, answer contents, candidate metadata, and LLM classification.
    Returns:
      {
        "language": "English",
        "accent": "Indian Accent",
        "detected_accent": "English (Indian Accent)"
      }
    """
    import json
    # Extract combined speech text from answers if list passed
    combined_text = ""
    if isinstance(text_or_answers, list):
        text_parts = []
        for a in text_or_answers:
            if isinstance(a, dict):
                t = a.get("answer_text") or a.get("transcript") or a.get("text") or ""
                if t.strip():
                    text_parts.append(t.strip())
            elif isinstance(a, str):
                if a.strip():
                    text_parts.append(a.strip())
        combined_text = " ".join(text_parts)
    elif isinstance(text_or_answers, str):
        combined_text = text_or_answers.strip()

    # Step 1: If speech text is sufficient, try LLM semantic detection
    if len(combined_text) >= 20:
        try:
            from app.services.services import chat_completion
            
            prompt = f"""You are an expert linguistic analyst evaluating a candidate's spoken interview response.
Identify:
1. "language": The primary spoken language (e.g., "English", "Hindi", "Telugu", "Tamil", "Spanish", "French", etc.).
2. "accent": The candidate's spoken accent / dialect (e.g., "Indian Accent", "Neutral Accent", "American (US) Accent", "British (UK) Accent", "Native Accent").
3. "detected_accent": A clean, human-readable combined string (e.g., "English (Indian Accent)" or "Hindi (Native)").

Spoken Transcript / Text:
\"\"\"{combined_text[:4000]}\"\"\"

Return ONLY valid JSON with keys "language", "accent", "detected_accent"."""

            raw = chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="openai/gpt-4o-mini",
                temperature=0.0,
                timeout=12
            )
            if raw:
                raw_clean = re.sub(r"```(?:json)?", "", raw).strip()
                data = json.loads(raw_clean)
                if data and data.get("language") and data.get("accent"):
                    lang = str(data.get("language")).strip().capitalize()
                    accent = str(data.get("accent")).strip()
                    detected_acc = str(data.get("detected_accent") or f"{lang} ({accent})").strip()
                    return {
                        "language": lang,
                        "accent": accent,
                        "detected_accent": detected_acc
                    }
        except Exception as e:
            print(f"⚠️ LLM language & accent detection error: {e}")

    # Step 2: Robust Offline Deterministic Engine
    return detect_language_and_accent_offline(
        text=combined_text,
        candidate_profile=candidate_profile,
        interview_language=interview_language
    )

    # Step 2: Robust Offline Deterministic Engine
    return detect_language_and_accent_offline(
        text=combined_text,
        candidate_profile=candidate_profile,
        interview_language=interview_language
    )
