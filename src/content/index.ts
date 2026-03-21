import type { CapturedImageResult, FetchBinaryResult, PageIdentity } from '@shared/types';
import type { ContentRequest } from '@shared/messages';
import { ContentMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { collectLiveDomImages, type CapturableNode } from '@core/detection/collectors/liveDomImageCollector';
import { scanPageDocument } from '@core/detection/scanPage';

declare global {
  interface Window {
    __netsuPanelInitialized__?: boolean;
  }
}

const capturableRegistry = new Map<string, CapturableNode>();
const FETCH_RETRY_DELAYS = [200, 500, 1200];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stabilizePage(): Promise<void> {
  let lastCount = -1;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentCount = document.images.length;
    if (currentCount === lastCount) return;
    lastCount = currentCount;
    await sleep(450);
  }
}

function getPageIdentity(): PageIdentity {
  return {
    url: window.location.href,
    title: document.title || window.location.href,
    host: window.location.host,
    pathname: window.location.pathname,
  };
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

function normalizeReferrer(url: string, referrer?: string): string | undefined {
  if (!referrer) return undefined;

  try {
    const requestUrl = new URL(url);
    const referrerUrl = new URL(referrer);
    if (requestUrl.origin === referrerUrl.origin) {
      return referrerUrl.href;
    }
    return `${referrerUrl.origin}/`;
  } catch {
    return undefined;
  }
}

function getAcceptLanguageHeader(): string {
  const languages = navigator.languages?.filter(Boolean) || [];
  if (languages.length > 0) {
    return `${languages.slice(0, 2).join(',')},en;q=0.8`;
  }
  return navigator.language ? `${navigator.language},en;q=0.8` : 'en-US,en;q=0.8';
}

async function fetchBinaryFromPage(
  url: string,
  referrer?: string,
  headers?: Record<string, string>
): Promise<FetchBinaryResult> {
  const normalizedReferrer = normalizeReferrer(url, referrer);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FETCH_RETRY_DELAYS.length + 1; attempt += 1) {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        referrer: normalizedReferrer,
        referrerPolicy: 'no-referrer-when-downgrade',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': getAcceptLanguageHeader(),
          ...(headers || {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Binary fetch failed');
      if (attempt < FETCH_RETRY_DELAYS.length) {
        await sleep(FETCH_RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError || new Error('Binary payload is not a valid image.');
}

async function fetchDocumentFromPage(url: string, referrer?: string): Promise<string> {
  const normalizedReferrer = normalizeReferrer(url, referrer);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FETCH_RETRY_DELAYS.length + 1; attempt += 1) {
    try {
      const response = await fetch(url, {
        credentials: 'include',
        referrer: normalizedReferrer,
        referrerPolicy: 'no-referrer-when-downgrade',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': getAcceptLanguageHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Document fetch failed');
      if (attempt < FETCH_RETRY_DELAYS.length) {
        await sleep(FETCH_RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError || new Error('Document fetch failed');
}

async function captureNode(node: CapturableNode): Promise<CapturedImageResult> {
  if (node instanceof HTMLCanvasElement) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      node.toBlob((result) => {
        if (!result) {
          reject(new Error('Canvas capture failed'));
          return;
        }
        resolve(result);
      }, 'image/png');
    });
    return { bytes: await blobToArrayBuffer(blob), mime: blob.type || 'image/png' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(node.naturalWidth || node.width || 1, 1);
  canvas.height = Math.max(node.naturalHeight || node.height || 1, 1);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context unavailable');
  }

  context.drawImage(node, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Image capture failed'));
        return;
      }
      resolve(result);
    }, 'image/png');
  });

  return { bytes: await blobToArrayBuffer(blob), mime: blob.type || 'image/png' };
}

async function scanCurrentPage() {
  await stabilizePage();
  const page = getPageIdentity();
  let bestCollection = await collectLiveDomImages(page.url);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleep(400);
    const nextCollection = await collectLiveDomImages(page.url);
    if (nextCollection.candidates.length > bestCollection.candidates.length) {
      bestCollection = nextCollection;
    }
    if (bestCollection.candidates.length >= 12) {
      break;
    }
  }

  capturableRegistry.clear();
  bestCollection.capturables.forEach((value, key) => capturableRegistry.set(key, value));
  return scanPageDocument({
    document,
    page,
    origin: 'live-dom',
    imageCandidates: bestCollection.candidates,
  });
}

if (!window.__netsuPanelInitialized__) {
  window.__netsuPanelInitialized__ = true;

  browser.runtime.onMessage.addListener(async (message: ContentRequest) => {
    switch (message.type) {
      case ContentMessageType.ScanPage:
        return scanCurrentPage();

      case ContentMessageType.CaptureImage: {
        const node = capturableRegistry.get(message.candidateId);
        if (!node) {
          throw new Error(`Capturable candidate not found: ${message.candidateId}`);
        }
        return captureNode(node);
      }

      case ContentMessageType.FetchBinary:
        return fetchBinaryFromPage(message.url, message.referrer, message.headers);

      case ContentMessageType.FetchDocument:
        return {
          html: await fetchDocumentFromPage(message.url, message.referrer),
        };

      default:
        return undefined;
    }
  });
}
