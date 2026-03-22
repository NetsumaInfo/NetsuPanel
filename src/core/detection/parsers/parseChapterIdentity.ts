import { compactWhitespace } from '@shared/utils/strings';

const CHAPTER_RE = /(chapter|chapitre|chap|ch\.?|episode|ep\.?|capitulo|cap\.?|raw)\s*([0-9]+(?:\.[0-9]+)?)/i;
const VOLUME_RE = /(volume|vol\.?)\s*([0-9]+(?:\.[0-9]+)?)/i;
const NUMERIC_RE = /(^|[^a-z0-9])([0-9]{1,4}(?:\.[0-9]+)?)(?=[^a-z0-9]|$)/i;
const CHAPTER_PATH_PATTERNS = [
  /(?:^|\/)(?:chapter|chapitre|chap|ch|episode|ep|capitulo|capitolo|cap|raw)[-_/ ]*([0-9]+(?:\.[0-9]+)?)(?=$|[/?#._-])/i,
  /(?:^|\/)([0-9]+(?:\.[0-9]+)?)(?=$|\/(?:all-pages?|read|viewer|page-\d+)|[?#])/i,
] as const;

export interface ParsedChapterIdentity {
  label: string;
  chapterNumber: number | null;
  volumeNumber: number | null;
}

function parseFromPath(url: string): number | null {
  const decoded = decodeURIComponent(url);
  for (const pattern of CHAPTER_PATH_PATTERNS) {
    const match = decoded.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  const slug = decoded
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/[-_]+/g, ' ');
  const chapterMatch = slug.match(CHAPTER_RE);
  if (chapterMatch) return Number(chapterMatch[2]);
  const numberMatch = slug.match(NUMERIC_RE);
  return numberMatch ? Number(numberMatch[2]) : null;
}

export function parseChapterIdentity(label: string, url: string): ParsedChapterIdentity {
  const normalizedLabel = compactWhitespace(
    label || decodeURIComponent(url.split('/').filter(Boolean).pop() || url)
  );
  const chapterMatch = normalizedLabel.match(CHAPTER_RE);
  const volumeMatch = normalizedLabel.match(VOLUME_RE);

  return {
    label: normalizedLabel,
    chapterNumber: chapterMatch ? Number(chapterMatch[2]) : parseFromPath(url),
    volumeNumber: volumeMatch ? Number(volumeMatch[2]) : null,
  };
}
