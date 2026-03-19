import type { ChapterItem, ImageCollectionResult, PageIdentity, PageScanResult } from '@shared/types';
import { collectStaticDocumentImages } from '@core/detection/collectors/staticDocumentImageCollector';
import { scanPageDocument } from '@core/detection/scanPage';

export interface ChapterCrawlerDependencies {
  fetchDocument(url: string): Promise<string>;
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

async function scanRemotePage(url: string, dependencies: ChapterCrawlerDependencies): Promise<PageScanResult> {
  const html = await dependencies.fetchDocument(url);
  const document = parseRemoteDocument(html);
  return scanPageDocument({
    document,
    page: buildPageIdentity(url, document),
    origin: 'static-html',
    imageCandidates: collectStaticDocumentImages(document, url),
  });
}

async function walkLinearDirection(
  startUrl: string | undefined,
  direction: 'previous' | 'next',
  dependencies: ChapterCrawlerDependencies,
  limit: number,
  accumulator: Map<string, ChapterItem>
): Promise<void> {
  const visited = new Set<string>();
  let currentUrl = startUrl;
  let remaining = limit;

  while (currentUrl && !visited.has(currentUrl) && remaining > 0) {
    visited.add(currentUrl);
    const scan = await scanRemotePage(currentUrl, dependencies);
    const item = toChapterItem(scan, currentUrl);
    accumulator.set(item.canonicalUrl, mergeChapterItems(accumulator.get(item.canonicalUrl), item));
    currentUrl =
      direction === 'previous'
        ? scan.manga.navigation.previous?.url
        : scan.manga.navigation.next?.url;
    remaining -= 1;
  }
}

export async function discoverChapters(
  initialScan: PageScanResult,
  dependencies: ChapterCrawlerDependencies
): Promise<ChapterItem[]> {
  const accumulator = new Map<string, ChapterItem>();

  initialScan.manga.chapters.forEach((chapter) => {
    accumulator.set(chapter.canonicalUrl, {
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
    });
  });

  const listingUrl = initialScan.manga.navigation.listing?.url;
  if (listingUrl) {
    const listingScan = await scanRemotePage(listingUrl, dependencies);
    listingScan.manga.chapters.forEach((chapter) => {
      accumulator.set(chapter.canonicalUrl, mergeChapterItems(accumulator.get(chapter.canonicalUrl), {
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
      }));
    });
  }

  await walkLinearDirection(initialScan.manga.navigation.previous?.url, 'previous', dependencies, 8, accumulator);
  await walkLinearDirection(initialScan.manga.navigation.next?.url, 'next', dependencies, 8, accumulator);

  return sortChapterItems([...accumulator.values()]);
}

export async function loadChapterPreview(
  chapterUrl: string,
  dependencies: ChapterCrawlerDependencies
): Promise<ImageCollectionResult> {
  const scan = await scanRemotePage(chapterUrl, dependencies);
  return scan.manga.currentPages;
}
