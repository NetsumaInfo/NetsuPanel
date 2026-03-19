const RESERVED = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFileName(input: string): string {
  const cleaned = input.replace(RESERVED, '').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned || 'download';
}

export function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
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
