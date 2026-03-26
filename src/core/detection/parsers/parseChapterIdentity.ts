import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';

/**
 * parseChapterIdentity.ts
 *
 * Extracts chapter/volume number and a normalized label from a text and URL.
 * Supports manga, light novels, web novels, and generic serial content.
 *
 * Inspired by NetsuShelf (WebToEpub fork) extractChapterNumber logic:
 * - Multiple regex patterns tried in order
 * - URL path and query string parsing
 * - Support for volumes, tomes, arcs, parts, books, seasons
 */

// ────────────────────────────────────────────────────────────
// Chapter number extraction patterns
// Order matters: more specific patterns first
// ────────────────────────────────────────────────────────────

/** Primary: label-based chapter identifier (e.g. "Chapter 12", "Ch.5.5") */
const CHAPTER_RE =
  /(chapter|chapitre|chap|ch\.?|episode|ep\.?|capitulo|cap\.?|capitolo|raw)\s*[#:–—-]?\s*([0-9]+(?:\.[0-9]+)?)/i;

/** Volume/Tome identifier in the label */
const VOLUME_RE =
  /(volume|vol\.?|tome|book|bk\.?|partie|part|season|arc)\s*[#:–—-]?\s*([0-9]+(?:\.[0-9]+)?)/i;

/** Simple numeric prefix (e.g. "#42 Title", "42. Title") — NetsuShelf pattern */
const NUMERIC_PREFIX_RE = /^#?([0-9]{1,5}(?:\.[0-9]+)?)\s*[.:-]/;

/** Bare number at word boundary — last resort within text */
const NUMERIC_RE = /(^|[^a-z0-9])([0-9]{1,4}(?:\.[0-9]+)?)(?=[^a-z0-9]|$)/i;

/** URL query key names that directly encode the chapter/episode number */
const DIRECT_QUERY_KEYS = [
  'chapter', 'chap', 'ch', 'episode', 'ep', 'episode_no', 'ep_no', 'chapter_no',
] as const;

/** URL path patterns where a number following a keyword is the chapter number */
const CHAPTER_PATH_PATTERNS = [
  // Explicit keyword + number: /chapter-12/, /ch_5.5/, /episode-3/
  /(?:^|\/)(?:chapter|chapitre|chap|ch|episode|ep|capitulo|capitolo|cap|raw)[-_/ ]*([0-9]+(?:\.[0-9]+)?)(?=$|[/?#._-])/i,
  // Pure numeric segment at end of path (before optional read/page suffix)
  /(?:^|\/)([0-9]+(?:\.[0-9]+)?)(?=$|\/(?:all-pages?|read|viewer|page-\d+)|[?#])/i,
] as const;

/** Markers that indicate a "reader-type" path (makes bare numerics more reliable) */
const READER_PATH_RE = /(viewer|episode|chapter|chapitre|read|scan|detail|ch)/i;

// ────────────────────────────────────────────────────────────
// NetsuShelf-inspired: prologue / epilogue / special episode labels
// These get numeric assignments to maintain ordering
// ────────────────────────────────────────────────────────────

const SPECIAL_LABEL_MAP: Record<string, number> = {
  prologue: 0,
  prolog: 0,
  intro: 0,
  introduction: 0,
  preface: 0,
  foreword: 0,
};

function specialLabelToNumber(text: string): number | null {
  const lower = text.trim().toLowerCase();
  for (const [key, val] of Object.entries(SPECIAL_LABEL_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Export types
// ────────────────────────────────────────────────────────────

export interface ParsedChapterIdentity {
  label: string;
  chapterNumber: number | null;
  volumeNumber: number | null;
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

function looksLikeReaderPath(pathname: string): boolean {
  return READER_PATH_RE.test(pathname);
}

function extractNumericValue(value: string): number | null {
  const match = value.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function parseFromQuery(url: string): number | null {
  try {
    const parsed = new URL(url);

    // Explicit chapter/episode query params
    for (const key of DIRECT_QUERY_KEYS) {
      const value = parsed.searchParams.get(key);
      if (value) return extractNumericValue(value);
    }

    // Generic "no" param on reader-like paths (Naver, Daum, Kakao, etc.)
    const genericNo = parsed.searchParams.get('no');
    if (
      genericNo &&
      looksLikeReaderPath(parsed.pathname) &&
      (parsed.searchParams.has('titleId') ||
        parsed.searchParams.has('title_no') ||
        /detail|viewer|episode|read/i.test(parsed.pathname))
    ) {
      return extractNumericValue(genericNo);
    }
  } catch {
    // ignore URL parse errors
  }

  return null;
}

function parseFromPath(url: string): number | null {
  // Try query string first (most explicit)
  const fromQuery = parseFromQuery(url);
  if (fromQuery !== null) return fromQuery;

  const decoded = decodeURIComponent(url);

  // Try known path patterns
  for (const pattern of CHAPTER_PATH_PATTERNS) {
    const match = decoded.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  // Build a "slug" from the last 2 URL segments and try chapter regex
  const slug = decoded
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/[-_]+/g, ' ');

  const chapterMatch = slug.match(CHAPTER_RE);
  if (chapterMatch) return Number(chapterMatch[2]);

  // Last resort: bare number in a reader-like path
  if (!looksLikeReaderPath(decoded)) return null;

  const numberMatch = slug.match(NUMERIC_RE);
  return numberMatch ? Number(numberMatch[2]) : null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Parse chapter number, volume number, and normalized label from
 * a chapter link text and/or URL.
 *
 * Strategy (in priority order):
 * 1. Label regex patterns (CHAPTER_RE, VOLUME_RE, NUMERIC_PREFIX_RE)
 * 2. Special labels (prologue=0, etc.)
 * 3. URL query string key matching
 * 4. URL path pattern matching
 * 5. Bare number in reader-like paths (heuristic)
 */
export function parseChapterIdentity(label: string, url: string): ParsedChapterIdentity {
  const fallbackLabel = safeDecodeURIComponent(url.split('/').filter(Boolean).pop() || url);
  const normalizedLabel = stripChapterLabelMetadata(
    compactWhitespace(label || fallbackLabel)
  );

  // 1. Extract chapter number from label
  const chapterMatch = normalizedLabel.match(CHAPTER_RE);
  const volumeMatch = normalizedLabel.match(VOLUME_RE);

  if (chapterMatch) {
    return {
      label: normalizedLabel,
      chapterNumber: Number(chapterMatch[2]),
      volumeNumber: volumeMatch ? Number(volumeMatch[2]) : null,
    };
  }

  // 2. NetsuShelf-style: numeric prefix (#42, "42.")
  const numPrefixMatch = normalizedLabel.match(NUMERIC_PREFIX_RE);
  if (numPrefixMatch) {
    return {
      label: normalizedLabel,
      chapterNumber: Number(numPrefixMatch[1]),
      volumeNumber: volumeMatch ? Number(volumeMatch[2]) : null,
    };
  }

  // 3. Special labels (prologue, introduction, etc.)
  const specialNumber = specialLabelToNumber(normalizedLabel);
  if (specialNumber !== null) {
    return {
      label: normalizedLabel,
      chapterNumber: specialNumber,
      volumeNumber: volumeMatch ? Number(volumeMatch[2]) : null,
    };
  }

  // 4. URL-based extraction
  return {
    label: normalizedLabel,
    chapterNumber: parseFromPath(url),
    volumeNumber: volumeMatch ? Number(volumeMatch[2]) : null,
  };
}

// ────────────────────────────────────────────────────────────
// NetsuShelf-style: normalize URL for comparison
// removeTrailingSlash + removeAnchor + strip protocol
// ────────────────────────────────────────────────────────────

/**
 * Normalize a URL for duplicate detection (inspired by NetsuShelf normalizeUrlForCompare).
 * Removes protocol, trailing slashes, and anchors.
 */
export function normalizeUrlForCompare(url: string): string {
  const noAnchor = url.split('#')[0];
  const noTrailingSlash = noAnchor.endsWith('/') ? noAnchor.slice(0, -1) : noAnchor;
  const protocolMatch = noTrailingSlash.match(/^[a-z]+:\/\/(.*)/i);
  return protocolMatch ? protocolMatch[1] : noTrailingSlash;
}
