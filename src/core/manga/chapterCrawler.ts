import type {
  ChapterItem,
  ChapterLinkCandidate,
  ImageCandidate,
  ImageCollectionResult,
  PageIdentity,
  PageScanResult,
  RawImageCandidate,
} from '@shared/types';
import { shouldPreserveImageProxyUrl, unwrapProxiedImageUrl } from '@shared/utils/url';
import { collectStaticDocumentImages } from '@core/detection/collectors/staticDocumentImageCollector';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { detectPaginatedReader, crawlPaginatedChapter } from '@core/detection/collectors/paginatedReaderCollector';
import { collectInlineScriptImages } from '@core/detection/collectors/inlineScriptCollector';
import { collectJsonEmbeddedImages } from '@core/detection/collectors/jsonEmbeddedCollector';
import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';
import { detectPageStrategy } from '@core/detection/pageStrategy';
import { scanPageDocument } from '@core/detection/scanPage';
import { isLikelyDecorative } from '@core/detection/pipeline/scoreImageCandidate';

export interface ChapterCrawlerDependencies {
  fetchDocument(url: string, options?: { referrer?: string; tabId?: number }): Promise<string>;
  scanPage?(url: string, options?: { referrer?: string; tabId?: number }): Promise<PageScanResult>;
}

const DEFAULT_LINEAR_CHAPTER_LIMIT = 64;
const DEFAULT_DISCOVERY_TIME_BUDGET_MS = 7_000;
const DEFAULT_LISTING_PAGE_LIMIT = 24;
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

function looksLikeChapterPreviewTarget(url: string, document?: Document): boolean {
  const text = `${url} ${document?.title || ''}`.toLowerCase();
  if (/(chapter|chapitre|episode|viewer|reader|read|scan|manga|manhwa|manhua|comic|webtoon)/i.test(text)) {
    return true;
  }

  return Boolean(
    document?.querySelector(
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

function normalizePreviewCollection(
  collection: ImageCollectionResult,
  chapterUrl: string
): ImageCollectionResult {
  const items = collection.items
    .filter(isRasterPreviewCandidate)
    .map((item) => {
      const normalizedUrl = unwrapProxiedImageUrl(item.url);
      const rawPreviewUrl = item.previewUrl || item.url;
      const preserveItemUrl = shouldPreserveImageProxyUrl(item.url);
      const displayUrl = preserveItemUrl ? item.url : normalizedUrl;
      const normalizedPreviewUrl = shouldPreserveImageProxyUrl(rawPreviewUrl)
        ? rawPreviewUrl
        : unwrapProxiedImageUrl(rawPreviewUrl);
      return {
        ...item,
        url: displayUrl,
        previewUrl: normalizedPreviewUrl,
        canonicalUrl: displayUrl.split('#')[0],
        querylessUrl: displayUrl.split('#')[0].split('?')[0],
        familyKey: displayUrl.split('#')[0].split('?')[0],
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

function collectRemoteImageCandidates(document: Document, baseUrl: string): RawImageCandidate[] {
  // Priority order:
  // 1. Runtime globals (ts_reader.run, chapterPages, __NEXT_DATA__) — most reliable for JS readers
  // 2. Static img tags with lazy-load data attributes
  // 3. JSON embedded in script tags
  // 4. Inline script URL extraction
  // 5. Noscript images (Cloudflare Mirage)
  const fromRuntime = collectFromRuntimeGlobals(document, baseUrl);
  const fromStatic = collectStaticDocumentImages(document, baseUrl);
  const fromJson = collectJsonEmbeddedImages(document, baseUrl);
  const fromScript = collectInlineScriptImages(document, baseUrl);
  const fromNoscript = collectNoscriptImages(document, baseUrl);

  const allCandidates = [...fromRuntime, ...fromStatic, ...fromJson, ...fromScript, ...fromNoscript];

  // Deduplicate by resolved URL
  const seen = new Set<string>();
  const deduped: RawImageCandidate[] = [];
  for (const candidate of allCandidates) {
    const key = candidate.url.split('#')[0];
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  }

  // Normalize proxied URLs
  return deduped.map((candidate) => {
    const nextUrl = shouldPreserveImageProxyUrl(candidate.url)
      ? candidate.url
      : unwrapProxiedImageUrl(candidate.url);
    const nextPreviewUrl = candidate.previewUrl
      ? (shouldPreserveImageProxyUrl(candidate.previewUrl) ? candidate.previewUrl : unwrapProxiedImageUrl(candidate.previewUrl))
      : nextUrl;
    return {
      ...candidate,
      url: nextUrl,
      previewUrl: nextPreviewUrl,
    };
  });
}


/** Extract image URLs from <noscript> tags (Cloudflare Mirage pattern) */
function collectNoscriptImages(document: Document, baseUrl: string): RawImageCandidate[] {
  const candidates: RawImageCandidate[] = [];
  const noscripts = Array.from(document.querySelectorAll('noscript'));
  let index = 0;

  for (const ns of noscripts) {
    const text = ns.textContent || '';
    if (!text.includes('<img')) continue;

    // Parse noscript HTML to extract img elements
    const wrapper = document.createElement('div');
    wrapper.innerHTML = text;
    const imgs = Array.from(wrapper.querySelectorAll<HTMLImageElement>('img'));

    for (const img of imgs) {
      const src =
        img.getAttribute('data-cfsrc') ||
        img.getAttribute('data-src') ||
        img.getAttribute('src') ||
        '';
      if (!src || src.startsWith('data:')) continue;

      let resolved = src;
      try { resolved = new URL(src, baseUrl).href; } catch { continue; }
      if (!RASTER_HINT_RE.test(resolved)) continue;

      const width = Number(img.getAttribute('width')) || 1080;
      const height = Number(img.getAttribute('height')) || 1560;

      candidates.push({
        id: `noscript-img-${index++}`,
        url: resolved,
        previewUrl: resolved,
        referrer: baseUrl,
        captureStrategy: 'network',
        sourceKind: 'noscript-img',
        origin: 'static-html',
        width,
        height,
        domIndex: index,
        top: index,
        left: 0,
        altText: img.alt || '',
        titleText: '',
        containerSignature: 'noscript',
        visible: true,
        diagnostics: [],
      });
    }
  }

  return candidates;
}

/** Build RawImageCandidates from runtime globals (ts_reader, chapterPages, imglist, __NEXT_DATA__) */
function collectFromRuntimeGlobals(document: Document, baseUrl: string): RawImageCandidate[] {
  const globals = collectRuntimeMangaGlobals(document);
  const urls = [
    ...globals.tsReaderImages,
    ...globals.chapterPages,
    ...globals.mangagoImages,
    ...globals.nextDataImages,
  ];

  const seen = new Set<string>();
  const candidates: RawImageCandidate[] = [];

  for (let i = 0; i < urls.length; i++) {
    let url = urls[i];
    try { url = new URL(url, baseUrl).href; } catch { continue; }
    if (seen.has(url)) continue;
    if (!RASTER_HINT_RE.test(url) && !/\/_next\/image|^\/cdn-cgi\/image/.test(url)) continue;
    seen.add(url);

    candidates.push({
      id: `runtime-global-${i}`,
      url,
      previewUrl: url,
      referrer: baseUrl,
      captureStrategy: 'network',
      sourceKind: 'inline-script',
      origin: 'static-html',
      width: 0,
      height: 0,
      domIndex: i,
      top: i,
      left: 0,
      altText: '',
      titleText: '',
      containerSignature: 'runtime-global',
      visible: true,
      diagnostics: [],
    });
  }

  return candidates;
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

function scanStaticPageHtml(url: string, html: string): PageScanResult {
  const document = parseRemoteDocument(html);
  return scanPageDocument({
    document,
    page: buildPageIdentity(url, document),
    origin: 'static-html',
    imageCandidates: collectRemoteImageCandidates(document, url),
  });
}

function scanStaticChapterListing(url: string, document: Document): PageScanResult {
  return scanPageDocument({
    document,
    page: buildPageIdentity(url, document),
    origin: 'static-html',
    imageCandidates: [],
  });
}

function hasUsefulRemoteScanSignals(scan: PageScanResult): boolean {
  const navigation = scan.manga.navigation;
  return (
    scan.manga.chapters.length > 1 ||
    scan.manga.currentPages.items.length >= 3 ||
    Boolean(navigation.previous || navigation.next || navigation.listing)
  );
}

function mergeChaptersFromScan(scan: PageScanResult, accumulator: Map<string, ChapterItem>): void {
  scan.manga.chapters.forEach((chapter) => {
    addChapterItem(accumulator, chapterLinkToItem(chapter));
  });
  if (scan.manga.navigation.previous) {
    addChapterItem(accumulator, chapterLinkToItem(scan.manga.navigation.previous));
  }
  if (scan.manga.navigation.next) {
    addChapterItem(accumulator, chapterLinkToItem(scan.manga.navigation.next));
  }
}

async function scanRemotePage(
  url: string,
  dependencies: ChapterCrawlerDependencies,
  options: { referrer?: string; tabId?: number } = {}
): Promise<PageScanResult> {
  let staticScan: PageScanResult | null = null;
  let staticError: unknown = null;
  try {
    const html = await dependencies.fetchDocument(url, options);
    staticScan = scanStaticPageHtml(url, html);
    if (!dependencies.scanPage || hasUsefulRemoteScanSignals(staticScan)) {
      return staticScan;
    }
  } catch (error) {
    staticError = error;
  }

  if (dependencies.scanPage) {
    try {
      return await dependencies.scanPage(url, options);
    } catch (error) {
      if (staticScan) return staticScan;
      if (staticError) throw staticError;
      throw error;
    }
  }

  if (staticError) throw staticError;
  throw new Error(`Unable to scan remote page: ${url}`);
}

interface LinearWalkContext {
  maxLinearSteps: number;
  deadline: number;
}

function findSmallChapterNumberGaps(items: ChapterItem[]): Array<{ left: ChapterItem; right: ChapterItem }> {
  const numbered = sortChapterItems(items)
    .filter((chapter) => chapter.chapterNumber !== null && chapter.relation !== 'listing');
  const gaps: Array<{ left: ChapterItem; right: ChapterItem }> = [];

  for (let index = 0; index < numbered.length - 1; index += 1) {
    const left = numbered[index];
    const right = numbered[index + 1];
    const leftNumber = left.chapterNumber as number;
    const rightNumber = right.chapterNumber as number;
    const gap = rightNumber - leftNumber;
    if (gap > 1 && gap <= 3 && Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) {
      gaps.push({ left, right });
    }
  }

  return gaps;
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
      const queryPage =
        parsed.searchParams.get('page') ||
        parsed.searchParams.get('paged') ||
        parsed.searchParams.get('p');
      const pageNumber = pageMatch ? Number(pageMatch[1]) : Number(queryPage);
      if (!Number.isFinite(pageNumber) || pageNumber <= 1) continue;
      resolved = parsed.href;
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      results.push({ url: resolved, page: pageNumber });
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

  const fetchAndMergeListingPage = async (
    pageUrl: string,
    requestOptions: { referrer?: string; tabId?: number }
  ): Promise<Document | null> => {
    try {
      const html = await dependencies.fetchDocument(pageUrl, requestOptions);
      const doc = parseRemoteDocument(html);
      const scan = scanStaticChapterListing(pageUrl, doc);
      mergeChaptersFromScan(scan, accumulator);
      mergeRawChapterCandidatesFromDocument(doc, pageUrl, accumulator);
      return doc;
    } catch {
      return null;
    }
  };

  const listingUrl = initialScan.manga.navigation.listing?.url;
  if ((options.includeListingFetch ?? true) && listingUrl && Date.now() <= context.deadline) {
    const beforeListingCount = accumulator.size;
    const listingDoc = await fetchAndMergeListingPage(listingUrl, fetchOptions);

    if (!listingDoc && dependencies.scanPage && Date.now() <= context.deadline) {
      try {
        const listingScan = await getRemoteScan(listingUrl, fetchOptions);
        mergeChaptersFromScan(listingScan, accumulator);
      } catch {
        // Keep chapter list from initial scan when listing live scan is denied.
      }
    }

    if (listingDoc) {
      const listingPages = extractListingPaginationUrls(listingDoc, listingUrl).slice(
        0,
        Math.max(0, options.maxListingPages ?? DEFAULT_LISTING_PAGE_LIMIT)
      );

      for (const listingPageUrl of listingPages) {
        if (Date.now() > context.deadline) break;
        await fetchAndMergeListingPage(listingPageUrl, {
          ...fetchOptions,
          referrer: listingUrl,
        });
      }
    }

    if (accumulator.size === beforeListingCount && dependencies.scanPage && Date.now() <= context.deadline) {
      try {
        const listingScan = await getRemoteScan(listingUrl, fetchOptions);
        mergeChaptersFromScan(listingScan, accumulator);
      } catch {
        // keep partial chapter discovery
      }
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
      Math.max(2, options.maxListingPages ?? DEFAULT_LISTING_PAGE_LIMIT)
    );
    for (const listingPageUrl of guessedPages) {
      if (Date.now() > context.deadline) break;
      await fetchAndMergeListingPage(listingPageUrl, {
        ...fetchOptions,
        referrer: listingUrl,
      });
    }
  }

  const smallGaps = findSmallChapterNumberGaps([...accumulator.values()]).slice(0, 4);
  for (const gap of smallGaps) {
    if (Date.now() > context.deadline) break;

    try {
      const rightScan = await getRemoteScan(gap.right.url, {
        ...fetchOptions,
        referrer: gap.left.url,
      });
      mergeChaptersFromScan(rightScan, accumulator);
    } catch {
      // Try the other side of the gap below.
    }

    if (Date.now() > context.deadline) break;

    try {
      const leftScan = await getRemoteScan(gap.left.url, {
        ...fetchOptions,
        referrer: gap.right.url,
      });
      mergeChaptersFromScan(leftScan, accumulator);
    } catch {
      // Keep the listing result when reader navigation is blocked.
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
  // ── Step 1: Fetch the HTML (always) ─────────────────────────────────────────
  let html = '';
  let htmlFetchError: unknown = null;
  try {
    html = await dependencies.fetchDocument(chapterUrl, options);
  } catch (err) {
    htmlFetchError = err;
  }

  // ── Step 2: Analyze the HTML to choose the extraction strategy ───────────────
  const strategy = html ? detectPageStrategy(html, chapterUrl) : null;
  // Only trigger live scan when static extraction is clearly insufficient:
  // - No HTML at all
  // - Explicitly detected as live-dom (SPA with empty mount)
  // - Cloudflare with ZERO noscript images (total blockage)
  // Conservative: default to static-html and let live scan be a last resort.
  const needsLiveScan = !strategy ||
    (strategy.strategy === 'live-dom' && strategy.staticImageCount === 0) ||
    (strategy.strategy === 'cloudflare' && strategy.staticImageCount === 0);

  // ── Step 3: Live DOM scan (only when static is clearly insufficient) ─────────
  let liveBest: ImageCollectionResult | null = null;
  if (needsLiveScan && dependencies.scanPage) {
    try {
      const liveScan = await dependencies.scanPage(chapterUrl, options);
      const liveManga = normalizePreviewCollection(liveScan.manga.currentPages, chapterUrl);
      const liveGeneral = normalizePreviewCollection(liveScan.general, chapterUrl);
      const merged = mergePreviewCollections(liveManga, liveGeneral);
      if (merged && merged.items.length > 0) {
        liveBest = merged;
        // Do NOT return early — always try static extraction too.
        // Static candidates have better metadata and are easier to display.
      }
    } catch {
      // Fall through to static extraction
    }
  }

  // ── Step 4: Static HTML extraction ───────────────────────────────────────────
  if (html) {
    try {
      const doc = parseRemoteDocument(html);
      const imageCandidates = collectRemoteImageCandidates(doc, chapterUrl);

      const scan = scanPageDocument({
        document: doc,
        page: buildPageIdentity(chapterUrl, doc),
        origin: 'static-html',
        imageCandidates,
      });

      const mangaResult = normalizePreviewCollection(scan.manga.currentPages, chapterUrl);
      const generalResult = normalizePreviewCollection(scan.general, chapterUrl);

      // ── Step 4b: Paginated reader crawl ────────────────────────────────────
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
        const liveScanner = dependencies.scanPage;
        const shouldAugmentWithLive =
          !liveBest &&
          liveScanner &&
          looksLikeChapterPreviewTarget(chapterUrl, doc) &&
          merged.items.length < 3;

        if (shouldAugmentWithLive) {
          try {
            const liveScan = await liveScanner(chapterUrl, options);
            const liveManga = normalizePreviewCollection(liveScan.manga.currentPages, chapterUrl);
            const liveGeneral = normalizePreviewCollection(liveScan.general, chapterUrl);
            const liveMerged = mergePreviewCollections(merged, liveManga, liveGeneral);
            if (liveMerged && liveMerged.items.length > merged.items.length) {
              return liveMerged;
            }
          } catch {
            // Keep the static result when live augmentation is blocked.
          }
        }

        return merged;
      }
    } catch (err) {
      // Static extraction failed — fall back to live result if available
      if (liveBest && liveBest.items.length > 0) {
        return liveBest;
      }
      if (!htmlFetchError) throw err;
    }
  }

  // ── Step 5: Last resort — live scan if we didn't try it yet ─────────────────
  if (!needsLiveScan && dependencies.scanPage && !liveBest) {
    try {
      const liveScan = await dependencies.scanPage(chapterUrl, options);
      const liveManga = normalizePreviewCollection(liveScan.manga.currentPages, chapterUrl);
      const liveGeneral = normalizePreviewCollection(liveScan.general, chapterUrl);
      const result = mergePreviewCollections(liveManga, liveGeneral);
      if (result && result.items.length > 0) {
        return result;
      }
    } catch {
      // Ignore
    }
  }

  if (liveBest && liveBest.items.length > 0) {
    return liveBest;
  }

  if (htmlFetchError) {
    throw htmlFetchError;
  }

  const strategySignals = strategy ? strategy.signals.join(', ') : 'no-html';
  return {
    items: [],
    totalCandidates: 0,
    diagnostics: [{
      code: 'chapter-preview-empty',
      message: `Aucune image détectée. Stratégie: ${strategy?.strategy ?? 'unknown'} (${strategySignals}).`,
      level: 'warning',
    }],
  };
}
