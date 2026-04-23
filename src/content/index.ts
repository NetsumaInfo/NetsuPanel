import type { CapturedImageResult, FetchBinaryResult, PageIdentity, RawImageCandidate } from '@shared/types';
import type { ContentRequest } from '@shared/messages';
import { ContentMessageType } from '@shared/messages';
import { browser } from '@shared/browser';
import { assertDecodableImage, validateBinaryImage } from '@shared/utils/imageBinary';
import { normalizeHttpUrl, sanitizeRequestHeaders } from '@shared/utils/resourcePolicy';
import { collectLiveDomImages, type CapturableNode } from '@core/detection/collectors/liveDomImageCollector';
import { collectStaticDocumentImages } from '@core/detection/collectors/staticDocumentImageCollector';
import { extractMadaraPageInfo, parseMadaraAjaxChapterHtml } from '@core/detection/collectors/madaraAjaxChapterCollector';
import { scanPageDocument } from '@core/detection/scanPage';

declare global {
  interface Window {
    __netsuPanelInitialized__?: boolean;
  }
}

const capturableRegistry = new Map<string, CapturableNode>();
const FETCH_RETRY_DELAYS = [200, 500, 1200];
const STABILIZE_DELAYS = [60, 120, 220, 360, 500];
const LAZY_SCROLL_WAIT_MS = 120;
const LAZY_SETTLE_WAIT_MS = 260;
const RECHECK_DELAY_MS = 160;
const MAX_LAZY_SCROLL = 120000;
const MAX_LAZY_STEPS = 24;
const MAX_LAZY_PASSES = 3;
const MAX_SCAN_DURATION_MS = 6500;
const HYDRATE_SETTLE_WAIT_MS = 220;

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

function pickLazyImageSource(image: HTMLImageElement): string | null {
  const sourceAttributes = [
    'data-cfsrc',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-url',
    'data-wpfc-original-src',
    'data-lazy',
    'data-lazy-original',
    'data-original-src',
    'data-full',
    'data-hi-res',
    'data-image',
    'data-pagespeed-lazy-src',
  ];

  for (const attribute of sourceAttributes) {
    const value = image.getAttribute(attribute) || '';
    if (!value || isPlaceholderSrc(value)) continue;
    return value;
  }

  return null;
}

async function eagerlyHydrateImages(): Promise<void> {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  let touched = false;

  for (const image of images) {
    image.loading = 'eager';
    image.decoding = 'async';

    const currentSrc = image.currentSrc || image.src || '';
    const preferredSrc = pickLazyImageSource(image);
    if ((!currentSrc || isPlaceholderSrc(currentSrc) || image.naturalWidth === 0) && preferredSrc && preferredSrc !== currentSrc) {
      image.src = preferredSrc;
      touched = true;
    }
  }

  if (touched || images.some((image) => !image.complete || image.naturalWidth === 0)) {
    await sleep(HYDRATE_SETTLE_WAIT_MS);
  }
}

function getScrollElement(): HTMLElement {
  return (document.scrollingElement || document.documentElement || document.body) as HTMLElement;
}

function isPlaceholderSrc(src: string): boolean {
  if (!src) return true;
  if (src.startsWith('data:image/svg+xml')) return true;
  if (src.startsWith('data:image/gif;base64,R0lGOD')) return true;
  if (src.includes('data:image/png;base64,iVBORw0KGgoAAAANS')) return true;
  return /\/cdn-cgi\/mirage\/|rocket-loader|cloudflare-static/i.test(src);
}

function countPotentialChapterSignals(): number {
  const seen = new Set<string>();
  const chapterHintRe = /(chapter|chapitre|chap|episode|ep|scan|read|viewer|lecture)/i;

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const anchor of anchors) {
    const href = anchor.href || anchor.getAttribute('href') || '';
    const label = anchor.textContent || anchor.getAttribute('aria-label') || '';
    if (!chapterHintRe.test(`${href} ${label}`)) continue;
    seen.add(href.split('#')[0]);
  }

  const dataTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-href], [data-url], [data-next], [data-prev]'));
  for (const element of dataTargets) {
    const raw =
      element.getAttribute('data-href') ||
      element.getAttribute('data-url') ||
      element.getAttribute('data-next') ||
      element.getAttribute('data-prev') ||
      '';
    if (!raw || !chapterHintRe.test(raw)) continue;
    try {
      seen.add(new URL(raw, location.href).href.split('#')[0]);
    } catch {
      // Ignore malformed candidates.
    }
  }

  return seen.size;
}

function getLoadingSignals() {
  const scrollElement = getScrollElement();
  const images = Array.from(document.querySelectorAll('img'));
  const loadedImages = images.filter((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0).length;

  return {
    imageCount: images.length,
    loadedImages,
    chapterSignals: countPotentialChapterSignals(),
    scrollHeight: scrollElement.scrollHeight,
  };
}

async function expandLazySections(): Promise<void> {
  const textOf = (element: Element): string =>
    `${(element.textContent || '').trim()} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`.trim();

  const clickables = Array.from(
    document.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], a[role="button"]')
  );
  const chapterTabRe = /\b(chapitres?|chapters?)\b/i;
  const expandRe = /\b(load more|show more|voir plus|afficher plus|plus de chapitres|more chapters)\b/i;

  for (const element of clickables) {
    const hint = textOf(element);
    if (!hint || !chapterTabRe.test(hint)) continue;

    const ariaSelected = element.getAttribute('aria-selected');
    const dataState = element.getAttribute('data-state');
    const isActive = ariaSelected === 'true' || dataState === 'active';
    if (isActive) continue;

    element.click();
    await sleep(140);
    break;
  }

  for (const element of clickables) {
    const hint = textOf(element);
    if (!hint || !expandRe.test(hint)) continue;
    element.click();
    await sleep(160);
  }
}

// Scroll through the page to trigger lazy-loading, then scroll back
async function triggerLazyLoading(): Promise<void> {
  const originalScrollY = window.scrollY;
  const step = Math.max(Math.floor(window.innerHeight * 0.7), 320);
  const scrollElement = getScrollElement();
  const maxScroll = Math.min(scrollElement.scrollHeight, MAX_LAZY_SCROLL);
  const maxSteps = Math.max(4, Math.min(MAX_LAZY_STEPS, Math.ceil(maxScroll / step)));
  let position = 0;

  for (let index = 0; index < maxSteps && position < maxScroll; index += 1) {
    position = Math.min(position + step, maxScroll);
    window.scrollTo({ top: position, behavior: 'instant' as ScrollBehavior });
    await sleep(LAZY_SCROLL_WAIT_MS);
  }
  window.scrollTo({ top: originalScrollY, behavior: 'instant' as ScrollBehavior });
  await sleep(LAZY_SETTLE_WAIT_MS);
}

function shouldForceLazyHydration(page: PageIdentity): boolean {
  const scrollElement = getScrollElement();
  if (scrollElement.scrollHeight > Math.max(window.innerHeight * 1.75, 2400)) {
    return true;
  }

  const lazyHintText = `${page.url} ${page.title} ${page.pathname}`.toLowerCase();
  if (/(chapter|chapitre|episode|gallery|galerie|catalogue|manga|manhwa|comic|webtoon)/i.test(lazyHintText)) {
    return true;
  }

  return Boolean(
    document.querySelector(
      [
        'img[loading="lazy"]',
        'img[data-src]',
        'img[data-srcset]',
        'img[data-nimg]',
        '[data-nimg]',
        '[role="tab"]',
        '[class*="chapter"]',
        '[class*="gallery"]',
      ].join(', ')
    )
  );
}

async function hydratePageContent(page: PageIdentity, canContinue: () => boolean): Promise<void> {
  if (!shouldForceLazyHydration(page) || !canContinue()) {
    return;
  }

  await eagerlyHydrateImages();
  let previousSignals = getLoadingSignals();

  for (let pass = 0; pass < MAX_LAZY_PASSES && canContinue(); pass += 1) {
    await expandLazySections();
    await triggerLazyLoading();
    await eagerlyHydrateImages();
    await stabilizePage();

    const nextSignals = getLoadingSignals();
    const progressed =
      nextSignals.imageCount > previousSignals.imageCount ||
      nextSignals.loadedImages > previousSignals.loadedImages ||
      nextSignals.chapterSignals > previousSignals.chapterSignals ||
      nextSignals.scrollHeight > previousSignals.scrollHeight + 96;

    previousSignals = nextSignals;
    if (!progressed) {
      break;
    }
  }
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

  // Also count noscript candidates as good coverage (Cloudflare hides images here)
  const noscriptLoaded = candidates.filter((candidate) => candidate.sourceKind === 'noscript-img');

  return candidates.length < 8 || (dimensioned.length < 4 && noscriptLoaded.length < 3) || liveDomLoaded.length < 3;
}

function looksLikeReaderPage(page: PageIdentity): boolean {
  const hintText = `${page.url} ${page.pathname}`.toLowerCase();
  if (/(chapter|chapitre|episode|viewer|webtoon|scan|read|reader|manga|manhwa|manhua|comic)/i.test(hintText)) {
    return true;
  }

  // Check for noscript + img presence (Cloudflare Mirage lazy-load pattern)
  const hasNoscriptImages = document.querySelectorAll('noscript').length > 0 &&
    Array.from(document.querySelectorAll('noscript')).some(
      (ns) => (ns.textContent || '').includes('<img')
    );
  if (hasNoscriptImages) return true;

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

function isFetchableHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function shouldAvoidPageContextFetch(url: string, referrer?: string): boolean {
  if (!isFetchableHttpUrl(url)) {
    return true;
  }

  try {
    const requestUrl = new URL(url);
    const referrerUrl = referrer ? new URL(referrer) : new URL(location.href);
    return referrerUrl.protocol === 'https:' && requestUrl.protocol === 'http:';
  } catch {
    return false;
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
  const normalizedUrl = normalizeHttpUrl(url);
  const normalizedReferrer = normalizeHttpUrl(referrer) || undefined;
  if (!normalizedUrl || !isFetchableHttpUrl(normalizedUrl)) {
    throw new Error(`Unsupported URL scheme for binary fetch: ${url}`);
  }
  if (shouldAvoidPageContextFetch(normalizedUrl, normalizedReferrer)) {
    throw new Error(`Mixed content blocked in page context: ${normalizedUrl}`);
  }

  const effectiveReferrer = normalizeReferrer(normalizedUrl, normalizedReferrer);
  const sanitizedHeaders = sanitizeRequestHeaders(headers);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FETCH_RETRY_DELAYS.length + 1; attempt += 1) {
    try {
      const response = await fetch(normalizedUrl, {
        credentials: 'include',
        referrer: effectiveReferrer,
        referrerPolicy: 'no-referrer-when-downgrade',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': getAcceptLanguageHeader(),
          ...(sanitizedHeaders || {}),
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
        finalUrl: response.url || normalizedUrl,
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
  const normalizedUrl = normalizeHttpUrl(url);
  const normalizedReferrer = normalizeHttpUrl(referrer) || undefined;
  if (!normalizedUrl || !isFetchableHttpUrl(normalizedUrl)) {
    throw new Error(`Unsupported URL scheme for document fetch: ${url}`);
  }
  if (shouldAvoidPageContextFetch(normalizedUrl, normalizedReferrer)) {
    throw new Error(`Mixed content blocked in page context: ${normalizedUrl}`);
  }

  const effectiveReferrer = normalizeReferrer(normalizedUrl, normalizedReferrer);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < FETCH_RETRY_DELAYS.length + 1; attempt += 1) {
    try {
      const response = await fetch(normalizedUrl, {
        credentials: 'include',
        referrer: effectiveReferrer,
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

/** Fetch Madara chapter list via AJAX from within page context (bypasses Cloudflare) */
async function fetchMadaraChapters(
  ajaxUrl: string,
  mangaId: string,
  nonce?: string
): Promise<{ html: string } | { error: string }> {
  // Try multiple Madara AJAX action names with different parameter combinations
  const attempts: Array<() => FormData> = [
    () => {
      const fd = new FormData();
      fd.append('action', 'manga_get_chapters');
      fd.append('manga', mangaId);
      if (nonce) fd.append('_wpnonce', nonce);
      return fd;
    },
    () => {
      const fd = new FormData();
      fd.append('action', 'wp_manga_get_chapters');
      fd.append('manga_id', mangaId);
      if (nonce) fd.append('nonce', nonce);
      return fd;
    },
    () => {
      const fd = new FormData();
      fd.append('action', 'manga_get_chapters');
      fd.append('manga_id', mangaId);
      if (nonce) fd.append('_wpnonce', nonce);
      return fd;
    },
    () => {
      const fd = new FormData();
      fd.append('action', 'wp_manga_chapter_image_sitemap');
      fd.append('manga', mangaId);
      return fd;
    },
  ];

  let lastError = '';
  for (const buildFormData of attempts) {
    try {
      const response = await fetch(ajaxUrl, {
        method: 'POST',
        credentials: 'include',
        referrer: location.href,
        referrerPolicy: 'no-referrer-when-downgrade',
        body: buildFormData(),
      });

      if (response.ok) {
        const text = await response.text();
        // Validate that response looks like a chapter list, not an error
        if (text && text.trim().length > 10 && !text.trim().startsWith('{"success":false')) {
          return { html: text };
        }
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Fetch failed';
    }
  }

  // Last resort: scrape the current listing page HTML for chapters
  // (useful when AJAX is blocked but the page itself has chapters in DOM)
  try {
    const pageChaptersEl = document.querySelector(
      '#manga-chapters-holder, .listing-chapters_wrap, .main.version-chap'
    );
    if (pageChaptersEl) {
      const anchors = Array.from(pageChaptersEl.querySelectorAll<HTMLAnchorElement>('a[href]'));
      if (anchors.length > 0) {
        // Build a synthetic HTML response from DOM content
        const syntheticHtml = '<ul>' + anchors.map((a) =>
          `<li class="wp-manga-chapter"><a href="${a.href}">${a.textContent?.trim() || a.href}</a></li>`
        ).join('') + '</ul>';
        return { html: syntheticHtml };
      }
    }
  } catch {
    // ignore DOM scrape errors
  }

  return { error: lastError || 'All Madara AJAX attempts failed' };
}

async function scanCurrentPage() {
  const startedAt = Date.now();
  const isWithinBudget = () => Date.now() - startedAt < MAX_SCAN_DURATION_MS;

  await stabilizePage();

  const page = getPageIdentity();
  const readerPage = looksLikeReaderPage(page);
  await hydratePageContent(page, isWithinBudget);

  let collection = await collectLiveDomImages(page.url, {
    includeBackgroundCandidates: true,
    includeSvgCandidates: true,
    includeMediaCandidates: true,
    includeCssRuleCandidates: false,
    includeScriptCandidates: false,
  });
  let allCandidates = collection.candidates;

  if (readerPage && isLowCoverage(allCandidates) && isWithinBudget()) {
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

  if (isLowCoverage(allCandidates) && isWithinBudget()) {
    await sleep(RECHECK_DELAY_MS);
    const nextCollection = await collectLiveDomImages(page.url, {
      includeBackgroundCandidates: true,
      includeSvgCandidates: true,
      includeMediaCandidates: true,
      includeCssRuleCandidates: false,
      includeScriptCandidates: true,
    });
    allCandidates = mergeCandidates(allCandidates, nextCollection.candidates);
    mergeCollectionCapturables(collection.capturables, nextCollection.capturables);
  }

  if (allCandidates.length < 90 && isWithinBudget()) {
    allCandidates = mergeCandidates(allCandidates, collectStaticDocumentImages(document, page.url));
  }

  capturableRegistry.clear();
  collection.capturables.forEach((value, key) => capturableRegistry.set(key, value));

  // For Madara listing pages: auto-detect manga_id and attach chapter AJAX info
  // The actual AJAX call will be triggered by the adapter via the background/content message
  const madaraInfo = extractMadaraPageInfo(document, page.url);

  const result = scanPageDocument({
    document,
    page,
    origin: 'live-dom',
    imageCandidates: allCandidates,
  });

  // If this is a Madara listing page with a manga_id, fetch chapters via AJAX immediately
  if (madaraInfo.isMangaListingPage && madaraInfo.mangaId && madaraInfo.ajaxUrl) {
    try {
      const chapterResult = await fetchMadaraChapters(
        madaraInfo.ajaxUrl,
        madaraInfo.mangaId,
        madaraInfo.nonce || undefined
      );
      if ('html' in chapterResult && chapterResult.html) {
        const parsed = parseMadaraAjaxChapterHtml(chapterResult.html, page.url);
        if (parsed.length > 0) {
          // Inject AJAX-fetched chapters into the result
          const ajaxChapterLinks = parsed.map((entry, idx) => ({
            id: `madara-ajax-${idx}`,
            url: entry.url,
            canonicalUrl: entry.url.split('#')[0],
            label: entry.label,
            relation: 'candidate' as const,
            chapterNumber: entry.chapterNumber,
            volumeNumber: null,
            score: 95,
            containerSignature: 'madara:ajax-chapter-list',
            diagnostics: [],
          }));
          // Merge with existing chapters (AJAX result takes priority)
          const existingUrls = new Set(result.manga.chapters.map((c) => c.canonicalUrl));
          const newChapters = ajaxChapterLinks.filter((c) => !existingUrls.has(c.canonicalUrl));
          result.manga.chapters = [...ajaxChapterLinks, ...result.manga.chapters.filter(
            (c) => !ajaxChapterLinks.some((a) => a.canonicalUrl === c.canonicalUrl)
          )];
          void newChapters; // suppress unused warning
        }
      }
    } catch {
      // Non-blocking: keep chapters from static HTML scan
    }
  }

  return result;
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

      case ContentMessageType.FetchMadaraChapters:
        return fetchMadaraChapters(message.ajaxUrl, message.mangaId, message.nonce);

      default:
        return undefined;
    }
  });
}
