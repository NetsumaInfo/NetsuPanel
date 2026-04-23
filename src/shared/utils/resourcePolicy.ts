const SUPPORTED_FETCH_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

const SUPPORTED_RENDER_IMAGE_MIMES = new Set([
  ...SUPPORTED_FETCH_IMAGE_MIMES,
  'image/svg+xml',
]);

const ALLOWED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'x-requested-with',
]);

function normalizeMime(mime: string): string {
  return mime.split(';')[0]?.trim().toLowerCase() || '';
}

export function isSupportedFetchedImageMime(mime: string): boolean {
  return SUPPORTED_FETCH_IMAGE_MIMES.has(normalizeMime(mime));
}

export function isSafeRenderableImageSrc(src: string): boolean {
  if (!src) return false;
  if (/^blob:/i.test(src)) return true;
  if (/^data:/i.test(src)) {
    const match = src.match(/^data:([^;,]+)/i);
    return Boolean(match?.[1] && SUPPORTED_RENDER_IMAGE_MIMES.has(normalizeMime(match[1])));
  }

  try {
    const parsed = new URL(src);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeHttpUrl(value: string | undefined, maxLength = 4096): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function sanitizeRequestHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;

  const nextHeaders = Object.entries(headers).reduce<Record<string, string>>((accumulator, [rawName, rawValue]) => {
    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim();

    if (!ALLOWED_REQUEST_HEADERS.has(name) || !value || value.length > 256 || /[\r\n]/.test(value)) {
      return accumulator;
    }

    accumulator[name] = value;
    return accumulator;
  }, {});

  return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
}
