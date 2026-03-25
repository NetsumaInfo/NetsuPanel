import type { CapturedImageResult, FetchBinaryResult, PageIdentity, RawImageCandidate } from '@shared/types';
import type { ContentRequest } from '@shared/messages';
import { ContentMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { collectLiveDomImages, type CapturableNode } from '@core/detection/collectors/liveDomImageCollector';
import { collectStaticDocumentImages } from '@core/detection/collectors/staticDocumentImageCollector';
import { scanPageDocument } from '@core/detection/scanPage';

declare global {
  interface Window {
    __netsuPanelInitialized__?: boolean;
  }
}

const capturableRegistry = new Map<string, CapturableNode>();
const FETCH_RETRY_DELAYS = [200, 500, 1200];
const STABILIZE_DELAYS = [90, 130, 180, 240];
const LAZY_SCROLL_WAIT_MS = 45;
const RECHECK_DELAY_MS = 180;
const MAX_LAZY_SCROLL = 12000;
const MAX_LAZY_STEPS = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stabilizePage(): Promise<void> {
  let lastCount = -1;

  for (const delay of STABILIZE_DELAYS) {
    const images = document.querySelectorAll('img');
    const currentCount = images.length;
    if (currentCount === 0 && document.readyState === 'complete') {
      return;
    }
    const loadedCount = Array.from(images).filter(
      (img) => img.complete && img.naturalWidth > 0
    ).length;
    const minLoaded = currentCount > 0 ? Math.max(1, Math.floor(currentCount * 0.45)) : 0;
    if (currentCount === lastCount && loadedCount >= minLoaded) return;
    lastCount = currentCount;
    await sleep(delay);
  }
}

// Scroll through the page to trigger lazy-loading, then scroll back
async function triggerLazyLoading(): Promise<void> {
  const originalScrollY = window.scrollY;
  const step = Math.max(Math.floor(window.innerHeight * 0.7), 320);
  const maxScroll = Math.min(document.body.scrollHeight, MAX_LAZY_SCROLL);
  const maxSteps = Math.max(4, Math.min(MAX_LAZY_STEPS, Math.ceil(maxScroll / step)));
  let position = 0;

  for (let index = 0; index < maxSteps && position < maxScroll; index += 1) {
    position = Math.min(position + step, maxScroll);
    window.scrollTo({ top: position, behavior: 'instant' as ScrollBehavior });
    await sleep(LAZY_SCROLL_WAIT_MS);
  }
  window.scrollTo({ top: originalScrollY, behavior: 'instant' as ScrollBehavior });
  await sleep(80);
}

function mergeCandidates(
  existing: RawImageCandidate[],
  incoming: RawImageCandidate[]
): RawImageCandidate[] {
  const seenUrls = new Set(existing.map((c) => c.url));
  const merged = [...existing];
  for (const candidate of incoming) {
    if (!seenUrls.has(candidate.url)) {
      seenUrls.add(candidate.url);
      merged.push(candidate);
    }
  }
  return merged;
}

function isLowCoverage(candidates: RawImageCandidate[]): boolean {
  const dimensioned = candidates.filter((candidate) => candidate.width >= 160 && candidate.height >= 160);
  const liveDomLoaded = candidates.filter(
    (candidate) =>
      candidate.origin === 'live-dom' &&
      candidate.sourceKind !== 'inline-script' &&
      candidate.sourceKind !== 'json-embedded' &&
      candidate.width > 0 &&
      candidate.height > 0
  );

  return candidates.length < 8 || dimensioned.length < 4 || liveDomLoaded.length < 3;
}

function looksLikeReaderPage(page: PageIdentity): boolean {
  const hintText = `${page.url} ${page.pathname}`.toLowerCase();
  if (/(chapter|chapitre|episode|viewer|webtoon|scan|read|reader|manga|manhwa|manhua|comic)/i.test(hintText)) {
    return true;
  }

  return Boolean(
    document.querySelector(
      [
        '.reading-content',
        '.reader-area',
        '.chapter-content',
        '.wp-manga-chapter-img',
        '.page-break img',
        '#readerarea img',
        '#scansPlacement img',
        '.viewer_lst img',
      ].join(', ')
    )
  );
}

function mergeCollectionCapturables(target: Map<string, CapturableNode>, incoming: Map<string, CapturableNode>): void {
  incoming.forEach((value, key) => target.set(key, value));
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

  try {
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
  } catch {
    // Cross-origin image (Cloudflare / hotlink protection) taints canvas.
    // Fall back to credentials-bearing fetch from within page context.
    const src = (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src || '';
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const response = await fetch(src, {
        credentials: 'include',
        referrer: location.href,
        referrerPolicy: 'no-referrer-when-downgrade',
      });
      if (!response.ok) throw new Error(`captureNode network fallback: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      return { bytes, mime: response.headers.get('content-type') || 'image/jpeg' };
    }
    throw new Error('Canvas tainted and no network fallback URL available');
  }
}

async function scanCurrentPage() {
  await stabilizePage();

  const page = getPageIdentity();
  const readerPage = looksLikeReaderPage(page);
  let collection = await collectLiveDomImages(page.url, {
    includeBackgroundCandidates: false,
    includeSvgCandidates: false,
    includeMediaCandidates: true,
    includeCssRuleCandidates: false,
    includeScriptCandidates: true,
  });
  let allCandidates = collection.candidates;

  if (readerPage && isLowCoverage(allCandidates)) {
    await triggerLazyLoading();
    await sleep(RECHECK_DELAY_MS);
    const afterLazy = await collectLiveDomImages(page.url, {
      includeBackgroundCandidates: true,
      includeSvgCandidates: true,
      includeMediaCandidates: true,
      includeCssRuleCandidates: false,
      includeScriptCandidates: true,
    });
    allCandidates = mergeCandidates(allCandidates, afterLazy.candidates);
    mergeCollectionCapturables(collection.capturables, afterLazy.capturables);
  }

  if (isLowCoverage(allCandidates)) {
    await sleep(RECHECK_DELAY_MS);
    const nextCollection = await collectLiveDomImages(page.url, {
      includeBackgroundCandidates: true,
      includeSvgCandidates: false,
      includeMediaCandidates: true,
      includeCssRuleCandidates: false,
      includeScriptCandidates: true,
    });
    allCandidates = mergeCandidates(allCandidates, nextCollection.candidates);
    mergeCollectionCapturables(collection.capturables, nextCollection.capturables);
  }

  if (isLowCoverage(allCandidates)) {
    const cssCollection = await collectLiveDomImages(page.url, {
      includeBackgroundCandidates: false,
      includeSvgCandidates: false,
      includeMediaCandidates: false,
      includeCssRuleCandidates: true,
      includeScriptCandidates: false,
    });
    allCandidates = mergeCandidates(allCandidates, cssCollection.candidates);
    mergeCollectionCapturables(collection.capturables, cssCollection.capturables);
  }

  // Always merge static document images to maximize coverage for general mode
  allCandidates = mergeCandidates(allCandidates, collectStaticDocumentImages(document, page.url));

  capturableRegistry.clear();
  collection.capturables.forEach((value, key) => capturableRegistry.set(key, value));

  return scanPageDocument({
    document,
    page,
    origin: 'live-dom',
    imageCandidates: allCandidates,
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
