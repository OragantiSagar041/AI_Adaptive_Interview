/**
 * useSEO — Dynamic per-page SEO hook for HireIQ
 *
 * Sets document.title, meta description, canonical, and OG/Twitter tags
 * dynamically for each page via React useEffect.
 *
 * Usage:
 *   useSEO({
 *     title: "AI Voice Recruiter | HireIQ",
 *     description: "Automate phone screening with AI voice agents...",
 *     path: "/voice-recruiter",
 *   });
 */
import { useEffect } from "react";

const SITE_NAME = "HireIQ";
const BASE_URL = "https://hireiq.co.in";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

/**
 * @param {object} options
 * @param {string} options.title         - Full page title (shown in browser tab + search results)
 * @param {string} options.description   - Meta description (max ~155 chars)
 * @param {string} [options.path]        - Canonical URL path (e.g. "/voice-recruiter"). Defaults to current path.
 * @param {string} [options.ogImage]     - OG image URL. Defaults to main OG image.
 * @param {string} [options.ogType]      - OG type. Defaults to "website".
 * @param {string[]} [options.keywords]  - Additional keywords array.
 * @param {boolean} [options.noIndex]    - If true, adds noindex (e.g. auth pages).
 */
export default function useSEO({
  title,
  description,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  keywords = [],
  noIndex = false,
} = {}) {
  useEffect(() => {
    const canonical = `${BASE_URL}${path || window.location.pathname}`;

    // ── Title ────────────────────────────────────────────────────────────────
    if (title) {
      document.title = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    }

    // ── Helper to set/create meta tags ───────────────────────────────────────
    const setMeta = (selector, content) => {
      if (!content) return;
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const attrMatch = selector.match(/\[([^=]+)="([^"]+)"\]/);
        if (attrMatch) el.setAttribute(attrMatch[1], attrMatch[2]);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel, href) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    // ── Meta description ─────────────────────────────────────────────────────
    setMeta('meta[name="description"]', description);

    // ── Robots ───────────────────────────────────────────────────────────────
    setMeta('meta[name="robots"]', noIndex ? "noindex, nofollow" : "index, follow");

    // ── Keywords ─────────────────────────────────────────────────────────────
    const defaultKeywords = [
      "AI recruitment", "AI interview", "automated hiring", "resume screening",
      "candidate scoring", "HireIQ",
    ];
    if (keywords.length > 0) {
      setMeta('meta[name="keywords"]', [...defaultKeywords, ...keywords].join(", "));
    }

    // ── Canonical ─────────────────────────────────────────────────────────────
    setLink("canonical", canonical);

    // ── Open Graph ────────────────────────────────────────────────────────────
    setMeta('meta[property="og:title"]', title ? `${title} | ${SITE_NAME}` : undefined);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:image"]', ogImage);
    setMeta('meta[property="og:type"]', ogType);

    // ── Twitter Card ──────────────────────────────────────────────────────────
    setMeta('meta[name="twitter:title"]', title ? `${title} | ${SITE_NAME}` : undefined);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="twitter:image"]', ogImage);

    // Cleanup on unmount: restore defaults
    return () => {
      document.title = `${SITE_NAME} — AI-Powered Interview & Recruitment Platform`;
      setMeta('meta[name="robots"]', "index, follow");
    };
  }, [title, description, path, ogImage, ogType, noIndex, keywords]);
}
