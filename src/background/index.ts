import type { RuntimeRequest } from '@shared/messages';
import { ContentMessageType, RuntimeMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import { coerceArrayBuffer, serializeArrayBuffer } from '@shared/utils/binaryTransfer';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { fetchBinaryResource, fetchDocumentHtml } from './fetch';

const LAST_SOURCE_TAB_ID_KEY = 'lastSourceTabId';

async function ensureContentScript(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['./content.bundle.js'],
  });
}

async function fetchBinaryViaContentScript(tabId: number, url: string, referrer?: string) {
  await ensureContentScript(tabId);
  return browser.tabs.sendMessage(tabId, {
    type: ContentMessageType.FetchBinary,
    url,
    referrer,
  });
}

async function fetchBinaryViaPageWorld(tabId: number, url: string, referrer?: string) {
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
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        bytes: await response.arrayBuffer(),
        mime: response.headers.get('content-type') || 'image/jpeg',
        finalUrl: response.url || fetchUrl,
      };
    },
    args: [url, referrer],
  });

  return results[0]?.result;
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

browser.runtime.onMessage.addListener(async (message: RuntimeRequest) => {
  switch (message.type) {
    case RuntimeMessageType.GetSourceContext: {
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
      await ensureContentScript(message.tabId);
      const scan = await browser.tabs.sendMessage(message.tabId, {
        type: ContentMessageType.ScanPage,
      });
      return { scan };
    }

    case RuntimeMessageType.FetchDocument:
      return {
        html: await fetchDocumentHtml(message.url),
      };

    case RuntimeMessageType.FetchBinary:
      if (message.tabId) {
        try {
          const pageWorldResource = await fetchBinaryViaPageWorld(message.tabId, message.url, message.referrer);
          if (!pageWorldResource) {
            throw new Error('Page-world fetch returned no result.');
          }
          return {
            resource: serializeBinaryResource(await validateFetchedResource(pageWorldResource)),
          };
        } catch {
          try {
            const contentResource = await fetchBinaryViaContentScript(message.tabId, message.url, message.referrer);
            return {
              resource: serializeBinaryResource(await validateFetchedResource(contentResource)),
            };
          } catch {
            // Fall back to extension-context fetch for cross-origin/CDN cases.
          }
        }
      }
      return {
        resource: serializeBinaryResource(await fetchBinaryResource(message.url, { referrer: message.referrer })),
      };

    case RuntimeMessageType.CaptureImage: {
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
