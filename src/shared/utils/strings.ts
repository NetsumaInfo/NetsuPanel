const RESERVED = /[<>:"/\\|?*\x00-\x1F]/g;
const CHAPTER_META_TAIL_RE =
  /(?:\s*[-|•·]?\s*)?(?:\d[\d\s.,]*\s*(?:vue|vues|view|views|lecture|lectures)|il y a\s+.+|just now|today|yesterday|premium|new)\b.*$/i;
const CHAPTER_GLUE_RE = /([!?])(\d[\d\s.,]*\s*(?:vue|vues|view|views))/gi;

export function sanitizeFileName(input: string): string {
  const cleaned = input.replace(RESERVED, '').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned || 'download';
}

export function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function stripChapterLabelMetadata(input: string): string {
  const normalized = compactWhitespace(input).replace(CHAPTER_GLUE_RE, '$1 $2');
  return normalized.replace(CHAPTER_META_TAIL_RE, '').trim();
}

export function slugify(input: string): string {
  return compactWhitespace(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

export function extractExtension(url: string): string {
  const match = url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  return match ? match[1].toLowerCase() : 'jpg';
}
