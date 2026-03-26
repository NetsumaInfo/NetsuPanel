import type { RuntimeRequest } from '@shared/messages';
import { ContentMessageType, RuntimeMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import { coerceArrayBuffer, serializeArrayBuffer } from '@shared/utils/binaryTransfer';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { normalizeHttpUrl, sanitizeRequestHeaders } from '@shared/utils/resourcePolicy';
import { fetchBinaryResource, fetchDocumentHtml } from './fetch';

const LAST_SOURCE_TAB_ID_KEY = 'lastSourceTabId';

interface PageWorldBinaryResult {
  ok: boolean;
  bytes?: ArrayBuffer;
  mime?: string;
  finalUrl?: string;
  error?: string;
}

interface PageWorldDocumentResult {
  ok: boolean;
  html?: string;
  error?: string;
}

function isTrustedExtensionPageSender(sender: { id?: string; url?: string } | undefined): boolean {
  if (!sender?.id || sender.id !== browser.runtime.id) {
    return false;
  }

  const extensionRoot = browser.runtime.getURL('');
  return typeof sender.url === 'string' && sender.url.startsWith(extensionRoot);
}

function isFiniteTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown, maxLength = 4096): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldBypassTabFetch(url: string, referrer?: string): boolean {
  try {
    const requestUrl = new URL(url);
    if (!/^https?:$/i.test(requestUrl.protocol)) {
      return true;
    }
    if (!referrer) {
      return false;
    }
    const referrerUrl = new URL(referrer);
    return referrerUrl.protocol === 'https:' && requestUrl.protocol === 'http:';
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['./content.bundle.js'],
  });
}

async function waitForTabReady(tabId: number, timeoutMs = 20_000): Promise<void> {
  const existing = await browser.tabs.get(tabId);
  if (existing.status === 'complete') {
    await sleep(600);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timed out waiting for tab ${tabId} to finish loading.`));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    browser.tabs.onUpdated.addListener(listener);
  });

  await sleep(900);
}

async function scanRemotePageInTemporaryTab(url: string, sourceTabId?: number): Promise<unknown> {
  let createdTabId: number | undefined;
  try {
    const createOptions: {
      url: string;
      active: false;
      openerTabId?: number;
      index?: number;
      windowId?: number;
    } = {
      url,
      active: false,
    };

    if (sourceTabId) {
      try {
        const sourceTab = await browser.tabs.get(sourceTabId);
        if (typeof sourceTab.windowId === 'number') createOptions.windowId = sourceTab.windowId;
        if (typeof sourceTab.index === 'number') createOptions.index = sourceTab.index + 1;
        if (typeof sourceTab.id === 'number') createOptions.openerTabId = sourceTab.id;
      } catch {
        // Ignore source-tab lookup failures and fall back to default tab creation.
      }
    }

    const createdTab = await browser.tabs.create(createOptions);
    if (!createdTab.id) {
      throw new Error('Temporary scan tab was created without an id.');
    }
    createdTabId = createdTab.id;
    const tempTabId = createdTab.id;

    await waitForTabReady(tempTabId);
    await ensureContentScript(tempTabId);
    const scan = await browser.tabs.sendMessage(tempTabId, {
      type: ContentMessageType.ScanPage,
    });
    return scan;
  } finally {
    if (createdTabId) {
      try {
        await browser.tabs.remove(createdTabId);
      } catch {
        // Ignore cleanup errors for temporary tabs.
      }
    }
  }
}

async function fetchBinaryViaContentScript(
  tabId: number,
  url: string,
  referrer?: string,
  headers?: Record<string, string>
) {
  await ensureContentScript(tabId);
  return browser.tabs.sendMessage(tabId, {
    type: ContentMessageType.FetchBinary,
    url,
    referrer,
    headers: sanitizeRequestHeaders(headers),
  });
}

async function fetchDocumentViaContentScript(tabId: number, url: string, referrer?: string) {
  await ensureContentScript(tabId);
  return browser.tabs.sendMessage(tabId, {
    type: ContentMessageType.FetchDocument,
    url,
    referrer,
  });
}

async function fetchBinaryViaPageWorld(
  tabId: number,
  url: string,
  referrer?: string,
  headers?: Record<string, string>
) {
  const sanitizedHeaders = sanitizeRequestHeaders(headers);
  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (fetchUrl: string, fetchReferrer?: string, requestHeaders?: Record<string, string>) => {
      function normalizeReferrer(targetUrl: string, candidate?: string): string | undefined {
        if (!candidate) return undefined;

        try {
          const requestUrl = new URL(targetUrl);
          const referrerUrl = new URL(candidate);
          if (requestUrl.origin === referrerUrl.origin) {
            return referrerUrl.href;
          }
          return `${referrerUrl.origin}/`;
        } catch {
          return undefined;
        }
      }

      const normalizedReferrer = normalizeReferrer(fetchUrl, fetchReferrer);
      const response = await fetch(fetchUrl, {
        credentials: 'include',
        referrer: normalizedReferrer,
        referrerPolicy: 'no-referrer-when-downgrade',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': `${navigator.language || 'en-US'},en;q=0.8`,
          ...(requestHeaders || {}),
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        bytes: await response.arrayBuffer(),
        mime: response.headers.get('content-type') || 'image/jpeg',
        finalUrl: response.url || fetchUrl,
      };
    },
    args: [url, referrer, sanitizedHeaders],
  });
  const result = results[0]?.result as PageWorldBinaryResult | undefined;
  if (!result?.ok || !result.bytes || !result.mime || !result.finalUrl) {
    throw new Error(result?.error || 'Page-world fetch returned no result.');
  }
  return {
    bytes: result.bytes,
    mime: result.mime,
    finalUrl: result.finalUrl,
  };
}

async function fetchDocumentViaPageWorld(tabId: number, url: string, referrer?: string) {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (fetchUrl: string, fetchReferrer?: string) => {
      function normalizeReferrer(targetUrl: string, candidate?: string): string | undefined {
        if (!candidate) return undefined;

        try {
          const requestUrl = new URL(targetUrl);
          const referrerUrl = new URL(candidate);
          if (requestUrl.origin === referrerUrl.origin) {
            return referrerUrl.href;
          }
          return `${referrerUrl.origin}/`;
        } catch {
          return undefined;
        }
      }

      const normalizedReferrer = normalizeReferrer(fetchUrl, fetchReferrer);
      const response = await fetch(fetchUrl, {
        credentials: 'include',
        referrer: normalizedReferrer,
        referrerPolicy: 'no-referrer-when-downgrade',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': `${navigator.language || 'en-US'},en;q=0.8`,
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        html: await response.text(),
      };
    },
    args: [url, referrer],
  });
  const result = results[0]?.result as PageWorldDocumentResult | undefined;
  if (!result?.ok || !result.html) {
    throw new Error(result?.error || 'Page-world document fetch returned no result.');
  }
  return {
    html: result.html,
  };
}

async function validateFetchedResource(resource: { bytes: unknown; mime: string; finalUrl: string }) {
  const bytes = coerceArrayBuffer(resource.bytes);
  const validation = validateBinaryImage(bytes, resource.mime);
  if (!validation.valid) {
    throw new Error(validation.reason || 'Binary payload is not a valid image.');
  }

  await assertDecodableImage(bytes, validation.mime);
  return {
    bytes,
    mime: validation.mime,
    finalUrl: resource.finalUrl,
  };
}

function serializeBinaryResource(resource: { bytes: ArrayBuffer; mime: string; finalUrl?: string }) {
  return {
    ...resource,
    bytes: serializeArrayBuffer(resource.bytes),
  };
}

async function openAppTab(sourceTabId: number): Promise<void> {
  await browser.storage.local.set({ [LAST_SOURCE_TAB_ID_KEY]: sourceTabId });
  const appUrl = browser.runtime.getURL(`app.html?tabId=${sourceTabId}`);
  await browser.tabs.create({ url: appUrl });
}

browser.action.onClicked.addListener(async (tab: { id?: number }) => {
  if (!tab.id) return;
  await openAppTab(tab.id);
});

browser.runtime.onMessage.addListener(async (message: RuntimeRequest, sender: unknown) => {
  if (!isTrustedExtensionPageSender(sender as { id?: string; url?: string } | undefined)) {
    return {
      error: 'Rejected runtime message from untrusted sender.',
    };
  }

  switch (message.type) {
    case RuntimeMessageType.GetSourceContext: {
      if (!isFiniteTabId(message.tabId)) {
        return { error: 'Invalid tab identifier.' };
      }
      const tab = await browser.tabs.get(message.tabId);
      return {
        context: {
          id: tab.id!,
          url: tab.url || '',
          title: tab.title || '',
          favIconUrl: tab.favIconUrl,
        },
      };
    }

    case RuntimeMessageType.ScanTab: {
      if (!isFiniteTabId(message.tabId)) {
        return { error: 'Invalid tab identifier.' };
      }
      await ensureContentScript(message.tabId);
      const scan = await browser.tabs.sendMessage(message.tabId, {
        type: ContentMessageType.ScanPage,
      });
      return { scan };
    }

    case RuntimeMessageType.ScanRemotePage: {
      if (!isNonEmptyString(message.url)) {
        return { error: 'Invalid scan URL.' };
      }
      if (message.tabId !== undefined && !isFiniteTabId(message.tabId)) {
        return { error: 'Invalid tab identifier.' };
      }
      if (!/^https?:\/\//i.test(message.url)) {
        return {
          error: `Unsupported URL scheme for remote scan: ${message.url}`,
        };
      }
      try {
        const scan = await scanRemotePageInTemporaryTab(message.url, message.tabId);
        return { scan };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Remote page scan failed',
        };
      }
    }

    case RuntimeMessageType.FetchDocument: {
      if (!isNonEmptyString(message.url)) {
        return { error: 'Invalid document URL.' };
      }
      if (message.referrer !== undefined && !isNonEmptyString(message.referrer)) {
        return { error: 'Invalid document referrer.' };
      }
      if (message.tabId !== undefined && !isFiniteTabId(message.tabId)) {
        return { error: 'Invalid tab identifier.' };
      }
      if (!/^https?:\/\//i.test(message.url)) {
        return {
          error: `Unsupported URL scheme for document fetch: ${message.url}`,
        };
      }
      try {
        if (message.tabId && !shouldBypassTabFetch(message.url, message.referrer)) {
          try {
            const pageWorldDocument = await fetchDocumentViaPageWorld(message.tabId, message.url, message.referrer);
            return { html: pageWorldDocument.html };
          } catch (pageWorldErr) {
            console.debug('[NetsuPanel] Page-world document fetch failed:', (pageWorldErr as Error).message);
            try {
              const contentDocument = await fetchDocumentViaContentScript(message.tabId, message.url, message.referrer);
              return {
                html: (contentDocument as { html: string }).html,
              };
            } catch (contentErr) {
              console.debug('[NetsuPanel] Content-script document fetch failed:', (contentErr as Error).message);
            }
          }
        }
        return {
          html: await fetchDocumentHtml(message.url, { referrer: message.referrer }),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Document fetch failed',
        };
      }
    }

    case RuntimeMessageType.FetchBinary: {
      if (!isNonEmptyString(message.url)) {
        return { error: 'Invalid binary URL.' };
      }
      if (message.referrer !== undefined && !isNonEmptyString(message.referrer)) {
        return { error: 'Invalid binary referrer.' };
      }
      if (message.tabId !== undefined && !isFiniteTabId(message.tabId)) {
        return { error: 'Invalid tab identifier.' };
      }
      const normalizedUrl = normalizeHttpUrl(message.url);
      const normalizedReferrer = normalizeHttpUrl(message.referrer);
      const sanitizedHeaders = sanitizeRequestHeaders(message.headers);
      if (!normalizedUrl) {
        return {
          error: `Unsupported URL scheme for binary fetch: ${message.url}`,
        };
      }
      try {
        if (message.tabId && !shouldBypassTabFetch(message.url, message.referrer)) {
          try {
            const pageWorldResource = await fetchBinaryViaPageWorld(
              message.tabId,
              normalizedUrl,
              normalizedReferrer || undefined,
              sanitizedHeaders
            );
            return {
              resource: serializeBinaryResource(await validateFetchedResource(pageWorldResource)),
            };
          } catch (pageWorldErr) {
            console.debug('[NetsuPanel] Page-world binary fetch failed:', (pageWorldErr as Error).message);
            try {
              const contentResource = await fetchBinaryViaContentScript(
                message.tabId,
                normalizedUrl,
                normalizedReferrer || undefined,
                sanitizedHeaders
              );
              return {
                resource: serializeBinaryResource(await validateFetchedResource(contentResource)),
              };
            } catch (contentErr) {
              console.debug('[NetsuPanel] Content-script binary fetch failed:', (contentErr as Error).message);
            }
          }
        }
        return {
          resource: serializeBinaryResource(
            await fetchBinaryResource(message.url, {
              referrer: normalizedReferrer || undefined,
              headers: sanitizedHeaders,
            })
          ),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Binary fetch failed',
        };
      }
    }

    case RuntimeMessageType.CaptureImage: {
      if (!isFiniteTabId(message.tabId) || !isNonEmptyString(message.candidateId, 512)) {
        return { error: 'Invalid capture request.' };
      }
      await ensureContentScript(message.tabId);
      const capture = await browser.tabs.sendMessage(message.tabId, {
        type: ContentMessageType.CaptureImage,
        candidateId: message.candidateId,
      });
      return {
        capture: serializeBinaryResource({
          ...(capture as { bytes: unknown; mime: string }),
          bytes: coerceArrayBuffer((capture as { bytes: unknown }).bytes),
        }),
      };
    }

    default:
      return undefined;
  }
});
