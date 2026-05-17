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

export function isPlaceholderImageUrl(input: string): boolean {
  if (!input) return true;
  if (input.startsWith('data:image/svg+xml')) return true;
  if (input.startsWith('data:image/gif;base64,R0lGOD')) return true;
  if (input.includes('data:image/png;base64,iVBORw0KGgoAAAANS')) return true;
  return /\/cdn-cgi\/mirage\/|rocket-loader|cloudflare-static/i.test(input);
}

export function isKnownImageProxyUrl(input: string): boolean {
  const parsed = safeUrl(input);
  if (!parsed) return false;
  return (
    /\/_next\/image(?:\/|$)/i.test(parsed.pathname) ||
    /\/cdn-cgi\/image(?:\/|$)/i.test(parsed.pathname) ||
    /^i\d+\.wp\.com$/i.test(parsed.hostname)
  );
}

// Hosts/host-suffixes that are known to sit behind Cloudflare hotlink / bot
// protection or require the page's session cookies to deliver image bytes.
// When the source URL matches, SafeImage skips the native <img> attempt and
// goes straight to the fetch cascade (background DNR + content-script).
const PROTECTED_IMAGE_HOST_PATTERNS: RegExp[] = [
  /(?:^|\.)asuracomic\.net$/i,
  /(?:^|\.)asurascans?\.(?:com|net)$/i,
  /(?:^|\.)flamecomics?\.(?:xyz|com|net|io)$/i,
  /(?:^|\.)astral-?manga\.(?:fr|com|net)$/i,
  /(?:^|\.)raijin-?scans?\.(?:fr|com|net)$/i,
  /(?:^|\.)rimu-?scans?\.(?:fr|com|net)$/i,
  /(?:^|\.)poseidon-?scans?\.(?:co|com|net|fr)$/i,
  /(?:^|\.)en-?thunderscans?\.com$/i,
  /(?:^|\.)sushiscan\.(?:fr|net|com|su)$/i,
  /(?:^|\.)scan-?manga\.com$/i,
  /(?:^|\.)mangaball\.net$/i,
  /(?:^|\.)mangabuddy\.com$/i,
  /(?:^|\.)mangago\.me$/i,
  /(?:^|\.)utoon\.net$/i,
  /(?:^|\.)manhwaclan\.com$/i,
  /(?:^|\.)vymanga\.com$/i,
  /(?:^|\.)kunmanga\.com$/i,
  /(?:^|\.)arenascan\.com$/i,
  /(?:^|\.)amiactuallythestrongest\.com$/i,
  /(?:^|\.)ibecamethemalelead\.com$/i,
  /(?:^|\.)manhuaus\.com$/i,
  /(?:^|\.)mangaread\.org$/i,
  /(?:^|\.)galaxymanga\.io$/i,
  /(?:^|\.)everythingmoe\.com$/i,
  // Known CDN sub-hosts used by the families above.
  /(?:^|\.)gg\.asuracomic\.net$/i,
  /(?:^|\.)cdn\.flamecomics\.(?:xyz|com|net|io)$/i,
];

export function isProtectedImageHost(input: string): boolean {
  const parsed = safeUrl(input);
  if (!parsed) return false;
  return PROTECTED_IMAGE_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
}

export function shouldPreserveImageProxyUrl(input: string): boolean {
  const parsed = safeUrl(input);
  if (!parsed) return false;
  return /\/_next\/image(?:\/|$)/i.test(parsed.pathname);
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

function unwrapSingleProxiedImageUrl(input: string): string {
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

export function unwrapProxiedImageUrl(input: string): string {
  let current = input;

  for (let depth = 0; depth < 3; depth += 1) {
    const next = unwrapSingleProxiedImageUrl(current);
    if (next === current) {
      return current;
    }
    current = next;
  }

  return current;
}
