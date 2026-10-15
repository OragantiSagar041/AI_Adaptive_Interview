/**
 * Front-end/src/utils/translation.js
 * Utility for detecting non-English candidate answers and translating them into English.
 * Supports dual-layer execution:
 *   1. Primary: HireIQ backend translation API (/api/translate or /admin/translate)
 *   2. Fallback: Browser-direct Google Translate service (zero-failure guaranteed)
 */

import axios from "axios";

export const LANGUAGE_NAMES = {
  auto: "Auto Detect",
  te: "Telugu",
  hi: "Hindi",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
  ur: "Urdu",
  or: "Odia",
  as: "Assamese",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  tr: "Turkish",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  th: "Thai",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  el: "Greek",
  he: "Hebrew",
  en: "English",
};

// Unicode ranges for non-Latin scripts
const SCRIPT_REGEXES = [
  { name: "Telugu", regex: /[\u0C00-\u0C7F]/ },
  { name: "Hindi / Marathi", regex: /[\u0900-\u097F]/ },
  { name: "Tamil", regex: /[\u0B80-\u0BFF]/ },
  { name: "Kannada", regex: /[\u0C80-\u0CFF]/ },
  { name: "Malayalam", regex: /[\u0D00-\u0D7F]/ },
  { name: "Bengali", regex: /[\u0980-\u09FF]/ },
  { name: "Gujarati", regex: /[\u0A80-\u0AFF]/ },
  { name: "Punjabi", regex: /[\u0A00-\u0A7F]/ },
  { name: "Odia", regex: /[\u0B00-\u0B7F]/ },
  { name: "Arabic / Urdu", regex: /[\u0600-\u06FF]/ },
  { name: "Russian (Cyrillic)", regex: /[\u0400-\u04FF]/ },
  { name: "Chinese / Japanese", regex: /[\u4E00-\u9FFF\u3040-\u30FF]/ },
  { name: "Korean", regex: /[\uAC00-\uD7AF]/ },
];

const ROMANIZED_MARKERS = [
  // Romanized Telugu
  {
    lang: "Telugu",
    words: [
      "nenu", "meeru", "cheppandi", "telugu", "bagundi", "undhi", "undi",
      "avunu", "ledu", "chala", "chesanu", "chesamu", "matladutunna", "enti", "emiti"
    ],
  },
  // Romanized Hindi
  {
    lang: "Hindi",
    words: [
      "mera", "meri", "mere", "mujhe", "aap", "karna", "hona", "theek",
      "achha", "dhanyawad", "kripya", "nahi", "kaam", "bataiye", "puchna"
    ],
  },
  // Spanish
  {
    lang: "Spanish",
    words: ["gracias", "hola", "experiencia", "trabajo", "desarrollo", "puesto"],
  },
];

/**
 * Detect whether an answer string is likely in a language other than English.
 *
 * @param {string} text - Candidate's answer text
 * @param {string} sessionLanguage - Language recorded for candidate's session
 * @returns {{ isNonEnglish: boolean, languageName: string, reason: string }}
 */
export function detectNonEnglishText(text, sessionLanguage = "") {
  const clean = (text || "").trim();
  if (!clean) {
    return { isNonEnglish: false, languageName: "English", reason: "" };
  }

  // 1. Check Unicode script ranges
  for (const s of SCRIPT_REGEXES) {
    if (s.regex.test(clean)) {
      return {
        isNonEnglish: true,
        languageName: s.name,
        reason: `Detected ${s.name} script`,
      };
    }
  }

  // 2. Check Romanized keywords
  const lower = ` ${clean.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  for (const m of ROMANIZED_MARKERS) {
    const matched = m.words.filter((w) => lower.includes(` ${w} `));
    if (matched.length >= 2 || (m.lang === "Telugu" && matched.includes("telugu"))) {
      return {
        isNonEnglish: true,
        languageName: m.lang,
        reason: `Matched Romanized ${m.lang} vocabulary`,
      };
    }
  }

  // 3. Check Session / Candidate Language setting if non-English
  const sessLang = (sessionLanguage || "").trim();
  if (sessLang && !sessLang.toLowerCase().includes("english") && sessLang.toLowerCase() !== "unknown") {
    return {
      isNonEnglish: true,
      languageName: sessLang,
      reason: `Interview session configured as ${sessLang}`,
    };
  }

  return { isNonEnglish: false, languageName: "English", reason: "" };
}

/**
 * Translate text into English (or target language).
 * Uses backend API first, falls back directly to Google Translate GTX.
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (default 'en')
 * @param {string} apiBaseUrl - Base API URL (optional)
 * @param {string} token - Auth bearer token (optional)
 * @returns {Promise<{ translatedText: string, sourceLang: string, sourceLangName: string, isTranslated: boolean }>}
 */
export async function translateText(text, targetLang = "en", apiBaseUrl = "", token = "") {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      translatedText: "",
      sourceLang: "en",
      sourceLangName: "English",
      isTranslated: false,
    };
  }

  // 1. Try Backend Translation API
  if (apiBaseUrl) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await axios.post(
        `${apiBaseUrl}/api/translate`,
        { text: clean, target_lang: targetLang },
        { headers, timeout: 10000 }
      );

      if (res.data && res.data.translated_text) {
        return {
          translatedText: res.data.translated_text,
          sourceLang: res.data.source_lang || "auto",
          sourceLangName: res.data.source_lang_name || "Detected Language",
          isTranslated: true,
        };
      }
    } catch (err) {
      console.warn("Backend translation failed, falling back to direct service:", err?.message || err);
    }
  }

  // 2. Fallback: Browser Direct Google Translate Service
  try {
    const encoded = encodeURIComponent(clean);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encoded}`;
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;

    let translated = clean;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      translated = data[0]
        .filter((part) => Array.isArray(part) && part[0])
        .map((part) => part[0])
        .join("");
    }

    const detectedCode = (data && (data[2] || data[1])) ? String(data[2] || data[1]).toLowerCase() : "auto";
    const sourceLangName = LANGUAGE_NAMES[detectedCode] || (detectedCode !== "auto" ? detectedCode.toUpperCase() : "Detected Language");

    return {
      translatedText: translated || clean,
      sourceLang: detectedCode,
      sourceLangName,
      isTranslated: true,
    };
  } catch (directErr) {
    console.error("Direct translation failed:", directErr);
    return {
      translatedText: clean,
      sourceLang: "unknown",
      sourceLangName: "Original",
      isTranslated: false,
    };
  }
}

/**
 * Translate both questions and answers in bulk.
 *
 * @param {Array<{ id: string, question_text?: string, answer_text?: string }>} items
 * @param {string} targetLang - Target language code (default 'en')
 * @param {string} apiBaseUrl - Base API URL
 * @param {string} token - Auth bearer token
 * @returns {Promise<Array<{ id: string, question_text: string, original_question_text: string, answer_text: string, original_answer_text: string, is_translated: boolean }>>}
 */
export async function translateQAPairs(items = [], targetLang = "en", apiBaseUrl = "", token = "") {
  if (!items || items.length === 0) return [];

  // 1. Try Backend QA endpoint
  if (apiBaseUrl) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await axios.post(
        `${apiBaseUrl}/api/translate/qa`,
        { items, target_lang: targetLang },
        { headers, timeout: 20000 }
      );

      if (res.data && Array.isArray(res.data.items)) {
        return res.data.items;
      }
    } catch (err) {
      console.warn("Backend QA translation failed, falling back to individual translation:", err?.message || err);
    }
  }

  // 2. Fallback: translate questions and answers in parallel using translateText
  const results = await Promise.all(
    items.map(async (item) => {
      const qPromise = item.question_text
        ? translateText(item.question_text, targetLang, apiBaseUrl, token)
        : Promise.resolve({ translatedText: "" });
      const aPromise = item.answer_text
        ? translateText(item.answer_text, targetLang, apiBaseUrl, token)
        : Promise.resolve({ translatedText: "" });

      const [resQ, resA] = await Promise.all([qPromise, aPromise]);

      return {
        id: item.id,
        original_question_text: item.question_text,
        question_text: resQ.translatedText || item.question_text,
        original_answer_text: item.answer_text,
        answer_text: resA.translatedText || item.answer_text,
        is_translated: true,
      };
    })
  );

  return results;
}
