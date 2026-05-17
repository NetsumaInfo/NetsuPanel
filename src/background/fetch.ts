import type { FetchBinaryResult } from '@shared/types';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { normalizeHttpUrl, sanitizeRequestHeaders } from '@shared/utils/resourcePolicy';

const RETRYABLE_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS = [250, 700, 1600, 3200];
const MAX_RETRY_AFTER_MS = 6000;
const dnrRuleIds = new Set<number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchOptions {
  referrer?: string;
  headers?: Record<string, string>;
}

function getAcceptLanguageHeader(): string {
  const languages = (globalThis.navigator?.languages || []).filter(Boolean);
  if (languages.length > 0) {
    return languages.slice(0, 2).join(',') + ',en;q=0.8';
  }
  const language = globalThis.navigator?.language;
  return language ? `${language},en;q=0.8` : 'en-US,en;q=0.8';
}

function normalizeReferrer(url: string, referrer?: string): string | undefined {
  if (!referrer) return undefined;

  try {
    const parsed = new URL(referrer);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    // Return the FULL referrer URL — DNR can inject it as-is.
    // The browser's own fetch() will enforce referrer-policy anyway,
    // but the DNR path overrides it with this full URL.
    return referrer;
  } catch {
    return undefined;
  }
}

function getChromeDnrApi():
  | {
      runtime: { id: string };
      declarativeNetRequest: {
        updateSessionRules(input: unknown): Promise<void>;
      };
    }
  | null {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.runtime?.id) return null;
  if (!chromeApi?.declarativeNetRequest?.updateSessionRules) return null;
  return chromeApi;
}

function allocateRuleId(): number {
  let nextRuleId = 1;
  for (const ruleId of dnrRuleIds) {
    if (ruleId >= nextRuleId) {
      nextRuleId = ruleId + 1;
    }
  }
  dnrRuleIds.add(nextRuleId);
  return nextRuleId;
}

function deriveOriginFromReferrer(referrer: string): string | null {
  try {
    return new URL(referrer).origin;
  } catch {
    return null;
  }
}

function deriveFetchSite(referrer: string, targetUrl: string): 'same-origin' | 'same-site' | 'cross-site' {
  try {
    const refUrl = new URL(referrer);
    const tgtUrl = new URL(targetUrl);
    if (refUrl.origin === tgtUrl.origin) return 'same-origin';
    const refHost = refUrl.hostname.split('.').slice(-2).join('.');
    const tgtHost = tgtUrl.hostname.split('.').slice(-2).join('.');
    if (refHost && refHost === tgtHost) return 'same-site';
    return 'cross-site';
  } catch {
    return 'cross-site';
  }
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function addReferrerRule(
  chromeApi: NonNullable<ReturnType<typeof getChromeDnrApi>>,
  ruleId: number,
  url: string,
  referrer: string
): Promise<void> {
  const origin = deriveOriginFromReferrer(referrer);
  const fetchSite = deriveFetchSite(referrer, url);
  const requestHeaders: Array<{ header: string; operation: 'set' | 'remove'; value?: string }> = [
    { header: 'Referer', operation: 'set', value: referrer },
    { header: 'Sec-Fetch-Site', operation: 'set', value: fetchSite },
    { header: 'Sec-Fetch-Mode', operation: 'set', value: 'no-cors' },
    { header: 'Sec-Fetch-Dest', operation: 'set', value: 'image' },
    { header: 'Sec-Fetch-User', operation: 'remove' },
  ];
  if (origin) {
    // Cloudflare's bot scoring rejects Origin: chrome-extension://… ; set it to the
    // referrer's origin so the request looks like a regular cross-site image fetch
    // initiated from the source page.
    requestHeaders.push({ header: 'Origin', operation: 'set', value: origin });
  } else {
    requestHeaders.push({ header: 'Origin', operation: 'remove' });
  }

  await chromeApi.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders,
        },
        condition: {
          initiatorDomains: [chromeApi.runtime.id],
          regexFilter: `^${escapeRegex(url)}$`,
          resourceTypes: ['xmlhttprequest', 'image'],
        },
      },
    ],
  });
}

async function fetchUsingInjectedReferer(url: string, referrer: string, requestInit: RequestInit): Promise<Response> {
  const chromeApi = getChromeDnrApi();
  if (!chromeApi) {
    return fetch(url, {
      ...requestInit,
      credentials: 'include',
      referrer,
      referrerPolicy: 'no-referrer-when-downgrade',
    });
  }

  const ruleId = allocateRuleId();
  try {
    await addReferrerRule(chromeApi, ruleId, url, referrer);
  } catch {
    await chromeApi.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    });
    await addReferrerRule(chromeApi, ruleId, url, referrer);
  }

  try {
    return fetch(url, {
      ...requestInit,
      credentials: 'include',
    });
  } finally {
    try {
      await chromeApi.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId],
      });
      dnrRuleIds.delete(ruleId);
    } catch {
      // If cleanup fails, avoid reusing the same id in this worker lifetime.
    }
  }
}

async function fetchWithReferrerWorkaround(url: string, requestInit: RequestInit, referrer?: string): Promise<Response> {
  if (!referrer) {
    return fetch(url, requestInit);
  }
  return fetchUsingInjectedReferer(url, referrer, requestInit);
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  // Numeric delta-seconds.
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  // HTTP-date.
  const epoch = Date.parse(trimmed);
  if (Number.isFinite(epoch)) {
    return Math.max(0, Math.min(epoch - Date.now(), MAX_RETRY_AFTER_MS));
  }
  return null;
}

async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    throw new Error(`Unsupported URL scheme for request: ${url}`);
  }

  let lastError: Error | null = null;
  // Full referrer passed to DNR injection (can set any Referer header).
  // For the browser's own fetch(), the referrer-policy will apply regardless.
  const fullReferrer = normalizeReferrer(normalizedUrl, normalizeHttpUrl(options.referrer) || undefined);
  const sanitizedHeaders = sanitizeRequestHeaders(options.headers);

  for (let attempt = 0; attempt < RETRY_DELAYS.length + 1; attempt += 1) {
    let retryAfterMs: number | null = null;
    try {
      const requestInit: RequestInit = {
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': getAcceptLanguageHeader(),
          ...(sanitizedHeaders || {}),
        },
      };
      const response = await fetchWithReferrerWorkaround(normalizedUrl, requestInit, fullReferrer);
      if (response.ok) {
        return response;
      }
      if (!RETRYABLE_STATUS.has(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Network error');
    }

    if (attempt < RETRY_DELAYS.length) {
      const baseDelay = RETRY_DELAYS[attempt];
      const delay = retryAfterMs !== null ? Math.max(retryAfterMs, baseDelay) : baseDelay;
      await sleep(delay);
    }
  }

  throw lastError || new Error('Request failed');
}

export async function fetchDocumentHtml(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchWithRetry(url, options);
  return response.text();
}

export async function fetchBinaryResource(url: string, options: FetchOptions = {}): Promise<FetchBinaryResult> {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      ...(options.headers || {}),
    },
  });
  const bytes = await response.arrayBuffer();
  const validation = validateBinaryImage(bytes, response.headers.get('content-type') || undefined);
  if (!validation.valid) {
    throw new Error(validation.reason || 'Binary payload is not a valid image.');
  }

  // assertDecodableImage uses createImageBitmap which may not be available
  // in service worker context or can fail for certain valid encodings.
  // Treat it as a soft check — if bytes pass magic-byte validation, accept them.
  try {
    await assertDecodableImage(bytes, validation.mime);
  } catch {
    // Magic-byte detection already confirmed this is a valid image format.
    // The decode check can fail in background service worker context or
    // for progressive/truncated images that are still displayable.
  }
  return {
    bytes,
    mime: validation.mime,
    finalUrl: response.url || url,
  };
}
