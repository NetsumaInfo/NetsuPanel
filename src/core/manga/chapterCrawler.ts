import type {
  ChapterItem,
  ChapterLinkCandidate,
  ImageCollectionResult,
  PageIdentity,
  PageScanResult,
} from '@shared/types';
import { unwrapProxiedImageUrl } from '@shared/utils/url';
import { collectStaticDocumentImages } from '@core/detection/collectors/staticDocumentImageCollector';
import { detectPaginatedReader, crawlPaginatedChapter } from '@core/detection/collectors/paginatedReaderCollector';
import { collectInlineScriptImages } from '@core/detection/collectors/inlineScriptCollector';
import { collectJsonEmbeddedImages } from '@core/detection/collectors/jsonEmbeddedCollector';
import { scanPageDocument } from '@core/detection/scanPage';

export interface ChapterCrawlerDependencies {
  fetchDocument(url: string, options?: { referrer?: string; tabId?: number }): Promise<string>;
}

const DEFAULT_LINEAR_CHAPTER_LIMIT = 64;
const DEFAULT_DISCOVERY_TIME_BUDGET_MS = 7_000;

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
      accumulator.set(item.canonicalUrl, mergeChapterItems(accumulator.get(item.canonicalUrl), item));
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
}

export function seedChaptersFromScan(scan: PageScanResult): ChapterItem[] {
  return sortChapterItems(scan.manga.chapters.map(chapterLinkToItem));
}

export async function discoverChapters(
  initialScan: PageScanResult,
  dependencies: ChapterCrawlerDependencies,
  options: DiscoverChapterOptions = {}
): Promise<ChapterItem[]> {
  const accumulator = new Map<string, ChapterItem>();
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

  initialScan.manga.chapters.forEach((chapter) => {
    accumulator.set(chapter.canonicalUrl, chapterLinkToItem(chapter));
  });

  const listingUrl = initialScan.manga.navigation.listing?.url;
  if ((options.includeListingFetch ?? true) && listingUrl && Date.now() <= context.deadline) {
    try {
      const listingScan = await scanRemotePage(listingUrl, dependencies, fetchOptions);
      listingScan.manga.chapters.forEach((chapter) => {
        accumulator.set(
          chapter.canonicalUrl,
          mergeChapterItems(accumulator.get(chapter.canonicalUrl), chapterLinkToItem(chapter))
        );
      });
    } catch {
      // Keep chapter list from initial scan when listing fetch is denied.
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
  const html = await dependencies.fetchDocument(chapterUrl, options);
  const doc = parseRemoteDocument(html);
  const scan = scanPageDocument({
    document: doc,
    page: buildPageIdentity(chapterUrl, doc),
    origin: 'static-html',
    imageCandidates: collectRemoteImageCandidates(doc, chapterUrl),
  });

  const applyPreferredReferrer = (collection: ImageCollectionResult): ImageCollectionResult => {
    const preferredReferrer = options.referrer || chapterUrl;
    return {
      ...collection,
      items: collection.items.map((item) => ({
        ...item,
        referrer: preferredReferrer,
      })),
    };
  };

  // Prefer manga-specific detection (better ordering/filtering)
  // but fall back to general collection when manga finds nothing meaningful
  const mangaResult = scan.manga.currentPages;
  const generalResult = scan.general;

  // Check if the chapter uses a paginated reader
  const paginatedInfo = detectPaginatedReader(doc, chapterUrl);
  const looksLikeImageUrl = (url: string): boolean =>
    /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i.test(url) ||
    /\/cdn-cgi\/image\//i.test(url) ||
    /\/_next\/image/i.test(url);
  if (paginatedInfo.isPaginatedReader && paginatedInfo.totalPages && paginatedInfo.totalPages > 1) {
    // Crawl all pages to get all images
    const fetchDoc = async (url: string, opts?: { referrer?: string }) =>
      dependencies.fetchDocument(url, { referrer: opts?.referrer || chapterUrl });

    const allImageUrls = await crawlPaginatedChapter(paginatedInfo, fetchDoc, chapterUrl);
    const validImageUrls = allImageUrls.filter((url) => looksLikeImageUrl(url));
    const minimumExpected = Math.min(2, paginatedInfo.totalPages);
    if (validImageUrls.length >= minimumExpected) {
      // Build an ImageCollectionResult from the crawled URLs
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
      return {
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

  if (mangaResult.items.length >= 2) return applyPreferredReferrer(mangaResult);
  return applyPreferredReferrer(generalResult.items.length > mangaResult.items.length ? generalResult : mangaResult);
}
