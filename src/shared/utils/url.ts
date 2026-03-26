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

function decodeHttpCandidate(value: string | null, baseOrigin?: string): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (/^https?:\/\//i.test(decoded)) return decoded;
    if (baseOrigin && decoded.startsWith('/')) {
      return new URL(decoded, baseOrigin).href;
    }
  } catch {
    // ignore decode errors
  }
  if (/^https?:\/\//i.test(value)) return value;
  if (baseOrigin && value.startsWith('/')) {
    return new URL(value, baseOrigin).href;
  }
  return null;
}

export function unwrapProxiedImageUrl(input: string): string {
  const parsed = safeUrl(input);
  if (!parsed) return input;
  const origin = `${parsed.protocol}//${parsed.host}`;

  const fromSearch =
    decodeHttpCandidate(parsed.searchParams.get('url'), origin) ||
    decodeHttpCandidate(parsed.searchParams.get('src'), origin);
  if (fromSearch) return fromSearch;

  const cloudflareMatch = parsed.pathname.match(/\/cdn-cgi\/image\/[^/]+\/(https?:\/\/.+)$/i);
  if (cloudflareMatch?.[1]) {
    return decodeHttpCandidate(cloudflareMatch[1], origin) || input;
  }

  const wordpressProxyHost = /^i\d+\.wp\.com$/i.test(parsed.hostname);
  if (wordpressProxyHost) {
    return `${parsed.protocol}//${parsed.pathname.replace(/^\/+/, '')}${parsed.search}${parsed.hash}`;
  }

  return parsed.href;
}
