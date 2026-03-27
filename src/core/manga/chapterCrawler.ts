import type {
  ChapterItem,
  ChapterLinkCandidate,
  ImageCandidate,
  ImageCollectionResult,
  PageIdentity,
  PageScanResult,
} from '@shared/types';
import { unwrapProxiedImageUrl } from '@shared/utils/url';
import { collectStaticDocumentImages } from '@core/detection/collectors/staticDocumentImageCollector';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { detectPaginatedReader, crawlPaginatedChapter } from '@core/detection/collectors/paginatedReaderCollector';
import { collectInlineScriptImages } from '@core/detection/collectors/inlineScriptCollector';
import { collectJsonEmbeddedImages } from '@core/detection/collectors/jsonEmbeddedCollector';
import { scanPageDocument } from '@core/detection/scanPage';
import { isLikelyDecorative } from '@core/detection/pipeline/scoreImageCandidate';

export interface ChapterCrawlerDependencies {
  fetchDocument(url: string, options?: { referrer?: string; tabId?: number }): Promise<string>;
  scanPage?(url: string, options?: { referrer?: string; tabId?: number }): Promise<PageScanResult>;
}

const DEFAULT_LINEAR_CHAPTER_LIMIT = 64;
const DEFAULT_DISCOVERY_TIME_BUDGET_MS = 7_000;
const SVG_URL_RE = /^data:image\/svg\+xml/i;
const RASTER_HINT_RE = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i;

function isSvgLikeUrl(url: string): boolean {
  return SVG_URL_RE.test(url) || /\.svg(?:$|[?#])/i.test(url);
}

function isRasterPreviewCandidate(item: ImageCandidate): boolean {
  if (!item.url || item.url.startsWith('content://')) return false;
  if (isSvgLikeUrl(item.url) || isSvgLikeUrl(item.previewUrl || '')) return false;
  if (isLikelyDecorative(item.url)) return false;

  const hasDimensions = item.width > 0 && item.height > 0;
  if (hasDimensions && Math.max(item.width, item.height) < 120) return false;

  return true;
}

function normalizePreviewCollection(
  collection: ImageCollectionResult,
  chapterUrl: string
): ImageCollectionResult {
  const items = collection.items
    .filter(isRasterPreviewCandidate)
    .map((item) => {
      const normalizedUrl = unwrapProxiedImageUrl(item.url);
      const normalizedPreviewUrl = unwrapProxiedImageUrl(item.previewUrl || item.url);
      return {
        ...item,
        url: normalizedUrl,
        previewUrl: normalizedPreviewUrl,
        canonicalUrl: normalizedUrl.split('#')[0],
        querylessUrl: normalizedUrl.split('#')[0].split('?')[0],
        familyKey: normalizedUrl.split('#')[0].split('?')[0],
        referrer: item.referrer || chapterUrl,
        origin: 'static-html' as const,
        captureStrategy: 'network' as const,
      };
    });

  return {
    ...collection,
    items,
  };
}

function sortPreviewItems(items: ImageCandidate[]): ImageCandidate[] {
  return [...items].sort((left, right) => {
    if (left.pageNumber !== null && right.pageNumber !== null && left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }
    if (left.top !== right.top) return left.top - right.top;
    if (left.domIndex !== right.domIndex) return left.domIndex - right.domIndex;
    return right.score - left.score;
  });
}

function mergePreviewCollections(...collections: Array<ImageCollectionResult | null | undefined>): ImageCollectionResult | null {
  const available = collections.filter((collection): collection is ImageCollectionResult => Boolean(collection));
  if (available.length === 0) {
    return null;
  }

  const merged = new Map<string, ImageCandidate>();
  const diagnostics = [];
  let totalCandidates = 0;

  for (const collection of available) {
    totalCandidates += collection.totalCandidates;
    diagnostics.push(...collection.diagnostics);
    for (const item of collection.items) {
      const key = item.querylessUrl || item.canonicalUrl || item.url;
      const existing = merged.get(key);
      if (!existing || item.score > existing.score) {
        merged.set(key, item);
      }
    }
  }

  return {
    items: sortPreviewItems([...merged.values()]),
    totalCandidates,
    diagnostics,
  };
}

function parseRemoteDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function buildPageIdentity(url: string, document: Document): PageIdentity {
  const parsed = new URL(url);
  return {
    url,
    title: document.title || url,
    host: parsed.host,
    pathname: parsed.pathname,
  };
}

function collectRemoteImageCandidates(document: Document, baseUrl: string) {
  const merged = [
    ...collectStaticDocumentImages(document, baseUrl),
    ...collectJsonEmbeddedImages(document, baseUrl),
    ...collectInlineScriptImages(document, baseUrl),
  ];

  const normalized = merged.map((candidate) => {
    const nextUrl = unwrapProxiedImageUrl(candidate.url);
    return {
      ...candidate,
      url: nextUrl,
      previewUrl: candidate.previewUrl ? unwrapProxiedImageUrl(candidate.previewUrl) : nextUrl,
    };
  });

  const deduped = new Map<string, (typeof merged)[number]>();
  for (const candidate of normalized) {
    const key = candidate.url.split('#')[0];
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()];
}

function isListingPaginationUrl(url: string): boolean {
  return /\/page\/\d+(?:\/|$|\?)/i.test(url) || /[?&]page=\d+(?:$|&)/i.test(url);
}

function buildGuessedListingPageUrls(listingUrl: string, maxPages: number): string[] {
  const urls: string[] = [];
  try {
    const parsed = new URL(listingUrl);
    const normalizedBase = parsed.href.replace(/\/page\/\d+\/?$/i, '').replace(/[?#].*$/, '');
    for (let page = 2; page <= maxPages; page += 1) {
      urls.push(new URL(`page/${page}/`, normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`).href);
    }
  } catch {
    // ignore malformed URLs
  }
  return urls;
}

function toChapterItem(scan: PageScanResult, url: string): ChapterItem {
  const current = scan.manga.navigation.current;
  return {
    id: current?.id || url,
    url,
    canonicalUrl: url.split('#')[0],
    label: current?.label || scan.page.title,
    relation: current?.relation || 'candidate',
    chapterNumber: current?.chapterNumber ?? null,
    volumeNumber: current?.volumeNumber ?? null,
    score: current?.score ?? 0,
    previewStatus: 'idle',
    diagnostics: [],
  };
}

function chapterLinkToItem(chapter: ChapterLinkCandidate): ChapterItem {
  return {
    id: chapter.id,
    url: chapter.url,
    canonicalUrl: chapter.canonicalUrl,
    label: chapter.label,
    relation: chapter.relation,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
    score: chapter.score,
    previewStatus: 'idle',
    diagnostics: [],
  };
}

function addChapterItem(
  accumulator: Map<string, ChapterItem>,
  chapter: ChapterItem
): void {
  if (isListingPaginationUrl(chapter.url) || isListingPaginationUrl(chapter.canonicalUrl)) {
    return;
  }
  accumulator.set(chapter.canonicalUrl, mergeChapterItems(accumulator.get(chapter.canonicalUrl), chapter));
}

function mergeChapterItems(existing: ChapterItem | undefined, candidate: ChapterItem): ChapterItem {
  if (!existing) return candidate;
  return candidate.score > existing.score ? candidate : existing;
}

function sortChapterItems(items: ChapterItem[]): ChapterItem[] {
  const numbered = items.filter((item) => item.chapterNumber !== null);
  const useNumbers = numbered.length >= Math.max(2, Math.floor(items.length / 2));

  return [...items].sort((left, right) => {
    if (useNumbers && left.chapterNumber !== null && right.chapterNumber !== null && left.chapterNumber !== right.chapterNumber) {
      return left.chapterNumber - right.chapterNumber;
    }
    return right.score - left.score;
  });
}

async function scanRemotePage(
  url: string,
  dependencies: ChapterCrawlerDependencies,
  options: { referrer?: string; tabId?: number } = {}
): Promise<PageScanResult> {
  if (dependencies.scanPage) {
    return dependencies.scanPage(url, options);
  }
  const html = await dependencies.fetchDocument(url, options);
  const document = parseRemoteDocument(html);
  return scanPageDocument({
    document,
    page: buildPageIdentity(url, document),
    origin: 'static-html',
    imageCandidates: collectRemoteImageCandidates(document, url),
  });
}

interface LinearWalkContext {
  maxLinearSteps: number;
  deadline: number;
}

function extractListingPaginationUrls(document: Document, listingUrl: string): string[] {
  let parsedListing: URL;
  try {
    parsedListing = new URL(listingUrl);
  } catch {
    return [];
  }

  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      [
        '.pagination a[href]',
        '.wp-pagenavi a[href]',
        '.page-numbers a[href]',
        'a.page-numbers[href]',
        '.select-pagination a[href]',
        '.chapter-pagination a[href]',
        '.listing-chapters_wrap a[href*="/page/"]',
        '.main.version-chap a[href*="/page/"]',
      ].join(', ')
    )
  );

  const seen = new Set<string>();
  const results: Array<{ url: string; page: number }> = [];

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript')) continue;

    let resolved: string;
    try {
      const parsed = new URL(href, listingUrl);
      if (parsed.host !== parsedListing.host) continue;
      const pageMatch = parsed.pathname.match(/\/page\/(\d+)(?:\/|$)/i);
      if (!pageMatch) continue;
      resolved = parsed.href;
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      results.push({ url: resolved, page: Number(pageMatch[1]) });
    } catch {
      // ignore malformed URLs
    }
  }

  return results
    .sort((left, right) => left.page - right.page)
    .map((entry) => entry.url);
}

function mergeRawChapterCandidatesFromDocument(
  document: Document,
  pageUrl: string,
  accumulator: Map<string, ChapterItem>
): void {
  const rawCandidates = collectChapterLinks(document, pageUrl, pageUrl);
  for (const candidate of rawCandidates) {
    if (candidate.relation === 'listing') continue;
    if (candidate.chapterNumber === null && !/(chapter|chapitre|episode|ep|ch\.?)/i.test(candidate.label)) {
      continue;
    }
    addChapterItem(accumulator, chapterLinkToItem(candidate));
  }
}

async function walkLinearDirection(
  startUrl: string | undefined,
  direction: 'previous' | 'next',
  dependencies: ChapterCrawlerDependencies,
  accumulator: Map<string, ChapterItem>,
  options: { referrer?: string; tabId?: number },
  context: LinearWalkContext
): Promise<void> {
  const visited = new Set<string>();
  let currentUrl = startUrl;
  let remaining = context.maxLinearSteps;

  while (currentUrl && !visited.has(currentUrl) && remaining > 0 && Date.now() <= context.deadline) {
    visited.add(currentUrl);
    try {
      const scan = await scanRemotePage(currentUrl, dependencies, options);
      const item = toChapterItem(scan, currentUrl);
      addChapterItem(accumulator, item);
      currentUrl =
        direction === 'previous'
          ? scan.manga.navigation.previous?.url
          : scan.manga.navigation.next?.url;
      remaining -= 1;
    } catch {
      // Some hosts block scripted HTTP fetches (403/anti-bot). Keep already discovered chapters.
      break;
    }
  }
}

export interface DiscoverChapterOptions {
  referrer?: string;
  tabId?: number;
  maxLinearSteps?: number;
  maxDurationMs?: number;
  includeListingFetch?: boolean;
  maxListingPages?: number;
}

export function seedChaptersFromScan(scan: PageScanResult): ChapterItem[] {
  return sortChapterItems(
    scan.manga.chapters
      .map(chapterLinkToItem)
      .filter((chapter) => !isListingPaginationUrl(chapter.url))
  );
}

export async function discoverChapters(
  initialScan: PageScanResult,
  dependencies: ChapterCrawlerDependencies,
  options: DiscoverChapterOptions = {}
): Promise<ChapterItem[]> {
  const accumulator = new Map<string, ChapterItem>();
  const remoteScanCache = new Map<string, Promise<PageScanResult>>();
  const fetchOptions: { referrer?: string; tabId?: number } = {};
  if (options.referrer) {
    fetchOptions.referrer = options.referrer;
  }
  if (typeof options.tabId === 'number') {
    fetchOptions.tabId = options.tabId;
  }
  const context: LinearWalkContext = {
    maxLinearSteps: Math.max(0, options.maxLinearSteps ?? DEFAULT_LINEAR_CHAPTER_LIMIT),
    deadline: Date.now() + Math.max(500, options.maxDurationMs ?? DEFAULT_DISCOVERY_TIME_BUDGET_MS),
  };

  const getRemoteScan = (url: string, options: { referrer?: string; tabId?: number } = {}) => {
    const cacheKey = `${url}::${options.referrer || ''}::${options.tabId ?? ''}`;
    const existing = remoteScanCache.get(cacheKey);
    if (existing) return existing;
    const task = scanRemotePage(url, dependencies, options);
    remoteScanCache.set(cacheKey, task);
    return task;
  };

  initialScan.manga.chapters.forEach((chapter) => {
    addChapterItem(accumulator, chapterLinkToItem(chapter));
  });

  const listingUrl = initialScan.manga.navigation.listing?.url;
  if ((options.includeListingFetch ?? true) && listingUrl && Date.now() <= context.deadline) {
    try {
      const listingScan = await getRemoteScan(listingUrl, fetchOptions);
      listingScan.manga.chapters.forEach((chapter) => {
        addChapterItem(accumulator, chapterLinkToItem(chapter));
      });

      // Some chapter lists are paginated (/page/2, /page/3...). Fetch additional listing pages.
      const listingHtml = await dependencies.fetchDocument(listingUrl, fetchOptions);
      const listingDoc = parseRemoteDocument(listingHtml);
      mergeRawChapterCandidatesFromDocument(listingDoc, listingUrl, accumulator);
      const listingPages = extractListingPaginationUrls(listingDoc, listingUrl).slice(
        0,
        Math.max(0, options.maxListingPages ?? 8)
      );

      for (const listingPageUrl of listingPages) {
        if (Date.now() > context.deadline) break;
        try {
          const pagedScan = await getRemoteScan(listingPageUrl, {
            ...fetchOptions,
            referrer: listingUrl,
          });
          pagedScan.manga.chapters.forEach((chapter) => {
            addChapterItem(accumulator, chapterLinkToItem(chapter));
          });
          const pagedHtml = await dependencies.fetchDocument(listingPageUrl, {
            ...fetchOptions,
            referrer: listingUrl,
          });
          const pagedDoc = parseRemoteDocument(pagedHtml);
          mergeRawChapterCandidatesFromDocument(pagedDoc, listingPageUrl, accumulator);
        } catch {
          // keep partial chapter discovery
        }
      }
    } catch {
      // Keep chapter list from initial scan when listing fetch is denied.
    }
  }

  const numberedChapters = [...accumulator.values()].filter((chapter) => chapter.chapterNumber !== null);
  const minChapterNumber = numberedChapters.length > 0
    ? Math.min(...numberedChapters.map((chapter) => chapter.chapterNumber as number))
    : null;
  const shouldProbeGuessedListingPages = Boolean(
    listingUrl &&
    (minChapterNumber === null || minChapterNumber > 1) &&
    Date.now() <= context.deadline
  );

  if (shouldProbeGuessedListingPages && listingUrl) {
    const guessedPages = buildGuessedListingPageUrls(
      listingUrl,
      Math.max(2, options.maxListingPages ?? 8)
    );
    for (const listingPageUrl of guessedPages) {
      if (Date.now() > context.deadline) break;
      try {
        const pagedScan = await getRemoteScan(listingPageUrl, {
          ...fetchOptions,
          referrer: listingUrl,
        });
        pagedScan.manga.chapters.forEach((chapter) => {
          addChapterItem(accumulator, chapterLinkToItem(chapter));
        });
        const pagedHtml = await dependencies.fetchDocument(listingPageUrl, {
          ...fetchOptions,
          referrer: listingUrl,
        });
        const pagedDoc = parseRemoteDocument(pagedHtml);
        mergeRawChapterCandidatesFromDocument(pagedDoc, listingPageUrl, accumulator);
      } catch {
        // Ignore guessed listing pages that do not exist or are blocked.
      }
    }
  }

  await Promise.all([
    walkLinearDirection(initialScan.manga.navigation.previous?.url, 'previous', dependencies, accumulator, fetchOptions, context),
    walkLinearDirection(initialScan.manga.navigation.next?.url, 'next', dependencies, accumulator, fetchOptions, context),
  ]);

  return sortChapterItems([...accumulator.values()]);
}

export async function loadChapterPreview(
  chapterUrl: string,
  dependencies: ChapterCrawlerDependencies,
  options: { referrer?: string; tabId?: number } = {}
): Promise<ImageCollectionResult> {
  let liveBest: ImageCollectionResult | null = null;

  if (dependencies.scanPage) {
    try {
      const liveScan = await dependencies.scanPage(chapterUrl, options);
      const liveManga = normalizePreviewCollection(liveScan.manga.currentPages, chapterUrl);
      const liveGeneral = normalizePreviewCollection(liveScan.general, chapterUrl);
      liveBest = mergePreviewCollections(liveManga, liveGeneral);
    } catch {
      // Fall back to static HTML fetch below when the live DOM scan path fails.
    }
  }

  try {
    const html = await dependencies.fetchDocument(chapterUrl, options);
    const doc = parseRemoteDocument(html);
    const scan = scanPageDocument({
      document: doc,
      page: buildPageIdentity(chapterUrl, doc),
      origin: 'static-html',
      imageCandidates: collectRemoteImageCandidates(doc, chapterUrl),
    });

    const mangaResult = normalizePreviewCollection(scan.manga.currentPages, chapterUrl);
    const generalResult = normalizePreviewCollection(scan.general, chapterUrl);

    let paginatedResult: ImageCollectionResult | null = null;
    const paginatedInfo = detectPaginatedReader(doc, chapterUrl);
    const looksLikeImageUrl = (url: string): boolean =>
      RASTER_HINT_RE.test(url) ||
      /\/cdn-cgi\/image\//i.test(url) ||
      /\/_next\/image/i.test(url);
    if (paginatedInfo.isPaginatedReader && paginatedInfo.totalPages && paginatedInfo.totalPages > 1) {
      const fetchDoc = async (url: string, opts?: { referrer?: string }) =>
        dependencies.fetchDocument(url, { referrer: opts?.referrer || chapterUrl });

      const allImageUrls = await crawlPaginatedChapter(paginatedInfo, fetchDoc, chapterUrl);
      const validImageUrls = allImageUrls.filter((url) => looksLikeImageUrl(url) && !isSvgLikeUrl(url));
      const minimumExpected = Math.min(2, paginatedInfo.totalPages);
      if (validImageUrls.length >= minimumExpected) {
        const paginatedItems = validImageUrls.map((url, i) => ({
          id: `paginated-${i}`,
          url,
          previewUrl: url,
          referrer: chapterUrl,
          canonicalUrl: url.split('?')[0],
          querylessUrl: url.split('?')[0],
          captureStrategy: 'network' as const,
          sourceKind: 'paginated-crawl',
          origin: 'static-html' as const,
          width: 0,
          height: 0,
          area: 0,
          domIndex: i,
          top: i * 100,
          left: 0,
          altText: `Page ${i + 1}`,
          titleText: '',
          containerSignature: 'paginated-reader',
          familyKey: url.split('?')[0],
          visible: true,
          filenameHint: `page-${String(i + 1).padStart(3, '0')}`,
          extensionHint: url.match(/\.(jpe?g|png|webp|avif)/i)?.[1]?.toLowerCase() || 'jpg',
          pageNumber: i + 1,
          score: 100,
          diagnostics: [],
        }));
        paginatedResult = {
          items: paginatedItems,
          totalCandidates: paginatedItems.length,
          diagnostics: [{
            code: 'paginated-crawl',
            message: `${paginatedItems.length} images récupérées depuis ${paginatedInfo.totalPages} pages.`,
            level: 'info',
          }],
        };
      }
    }

    const merged = mergePreviewCollections(liveBest, mangaResult, generalResult, paginatedResult);
    if (merged && merged.items.length > 0) {
      return merged;
    }
  } catch (error) {
    if (liveBest && liveBest.items.length > 0) {
      return liveBest;
    }
    throw error;
  }

  if (liveBest && liveBest.items.length > 0) {
    return liveBest;
  }

  return {
    items: [],
    totalCandidates: 0,
    diagnostics: [{
      code: 'chapter-preview-empty',
      message: 'Aucune image de chapitre exploitable detectee.',
      level: 'warning',
    }],
  };
}
