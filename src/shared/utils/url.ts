export const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function safeUrl(input: string, baseUrl?: string): URL | null {
  try {
    return baseUrl ? new URL(input, baseUrl) : new URL(input);
  } catch {
    return null;
  }
}

export function resolveUrl(input: string, baseUrl?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Reject non-fetchable schemes immediately (causes crash in page-world fetch)
  if (/^(javascript|mailto|tel|sms|vbscript|data-url):/i.test(trimmed)) return null;
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;
  const parsed = safeUrl(trimmed, baseUrl);
  if (!parsed) return null;
  // Only allow http/https for resolved remote URLs
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'data:' && parsed.protocol !== 'blob:') return null;
  return parsed.href;
}

export function toQuerylessUrl(input: string): string {
  const parsed = safeUrl(input);
  if (!parsed) return input;
  return `${parsed.origin}${parsed.pathname}`;
}

export function buildFamilyKey(input: string): string {
  const parsed = safeUrl(input);
  if (!parsed) return input;
  const segments = parsed.pathname.split('/').filter(Boolean);
  const baseSegments = segments.slice(0, Math.max(0, segments.length - 1));
  return `${parsed.host}/${baseSegments.join('/')}`;
}

export function sameHost(a: string, b: string): boolean {
  const left = safeUrl(a);
  const right = safeUrl(b);
  return Boolean(left && right && left.host === right.host);
}
