import type { FetchBinaryResult } from '@shared/types';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { normalizeHttpUrl, sanitizeRequestHeaders } from '@shared/utils/resourcePolicy';

const RETRYABLE_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS = [200, 500, 1200];
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
    const requestUrl = new URL(url);
    const referrerUrl = new URL(referrer);
    if (requestUrl.origin === referrerUrl.origin) {
      return referrerUrl.href;
    }
    // Mimic strict-origin policy for cross-origin resource requests.
    return `${referrerUrl.origin}/`;
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

async function addReferrerRule(
  chromeApi: NonNullable<ReturnType<typeof getChromeDnrApi>>,
  ruleId: number,
  url: string,
  referrer: string
): Promise<void> {
  await chromeApi.declarativeNetRequest.updateSessionRules({
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'Referer',
              operation: 'set',
              value: referrer,
            },
          ],
        },
        condition: {
          initiatorDomains: [chromeApi.runtime.id],
          urlFilter: url,
          resourceTypes: ['xmlhttprequest'],
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

async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    throw new Error(`Unsupported URL scheme for request: ${url}`);
  }

  let lastError: Error | null = null;
  const normalizedReferrer = normalizeReferrer(normalizedUrl, normalizeHttpUrl(options.referrer) || undefined);
  const sanitizedHeaders = sanitizeRequestHeaders(options.headers);

  for (let attempt = 0; attempt < RETRY_DELAYS.length + 1; attempt += 1) {
    try {
      const requestInit: RequestInit = {
        credentials: 'include',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': getAcceptLanguageHeader(),
          ...(sanitizedHeaders || {}),
        },
      };
      if (normalizedReferrer && !getChromeDnrApi()) {
        requestInit.referrer = normalizedReferrer;
        requestInit.referrerPolicy = 'no-referrer-when-downgrade';
      }
      const response = await fetchWithReferrerWorkaround(normalizedUrl, requestInit, normalizedReferrer);
      if (response.ok) {
        return response;
      }
      if (!RETRYABLE_STATUS.has(response.status)) {
        throw new Error(`HTTP ${response.status}`);
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Network error');
    }

    if (attempt < RETRY_DELAYS.length) {
      await sleep(RETRY_DELAYS[attempt]);
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

  await assertDecodableImage(bytes, validation.mime);
  return {
    bytes,
    mime: validation.mime,
    finalUrl: response.url || url,
  };
}
