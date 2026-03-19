/**
 * webtoonAdapter.ts
 *
 * Adaptateur pour webtoons.com (LINE Webtoon).
 * Structure DOM bien connue : les pages sont dans .viewer_lst img ou [data-url].
 * API possible : https://www.webtoons.com/ajax/.../info
 */

import type { MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import type { ScanAdapterInput, SiteAdapter } from './types';

function matchesWebtoon(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host.includes('webtoons.com') ||
      host.includes('comic.naver.com') ||
      host.includes('m.comic.naver.com')
    );
  } catch {
    return false;
  }
}

function isViewerPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.has('episode_no') ||
      parsed.searchParams.has('no') ||
      parsed.pathname.includes('/viewer') ||
      parsed.pathname.includes('/episode') ||
      parsed.pathname.includes('/detail')
    );
  } catch {
    return false;
  }
}

function pickImageUrl(img: HTMLImageElement, baseUrl: string): string {
  const candidates = [
    img.dataset.url,
    img.getAttribute('data-url') || undefined,
    img.dataset.src,
    img.getAttribute('data-src') || undefined,
    img.dataset.original,
    img.getAttribute('data-original') || undefined,
    img.currentSrc,
    img.src,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return new URL(candidate, baseUrl).href;
    } catch {
      continue;
    }
  }

  return '';
}

function isLikelyThumbnail(url: string): boolean {
  return /(?:^|[\/_-])thumb(?:[_-]|$)|thumbnail/i.test(url);
}

function collectWebtoonImages(document: ParentNode, baseUrl: string): string[] {
  // Primary: .viewer_lst li img (episode viewer)
  const listImgs = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>(
      '.viewer_lst li img, ._images li img, .viewer .img_viewer img, .wt_viewer img, #sectionContWide img'
    )
  );
  if (listImgs.length > 0) {
    const resolved = listImgs
      .map((img) => pickImageUrl(img, baseUrl))
      .filter(Boolean);
    const nonThumb = resolved.filter((url) => !isLikelyThumbnail(url));
    return nonThumb.length > 0 ? nonThumb : resolved;
  }

  // Fallback: any img with data-url attribute
  const dataUrlImgs = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>('img[data-url], img[data-src], img[data-original]')
  );
  const resolved = dataUrlImgs
    .map((img) => pickImageUrl(img, baseUrl))
    .filter(Boolean);
  const nonThumb = resolved.filter((url) => !isLikelyThumbnail(url));
  return nonThumb.length > 0 ? nonThumb : resolved;
}

function scanWebtoon(input: ScanAdapterInput): MangaScanResult {
  const viewerPage = isViewerPage(input.page.url);
  const webtoonUrls = viewerPage ? collectWebtoonImages(input.document, input.page.url) : [];

  const extraCandidates = webtoonUrls.map((url, i) => ({
    id: `webtoon-${i}`,
    url,
    previewUrl: url,
    captureStrategy: 'network' as const,
    sourceKind: 'webtoon',
    origin: input.origin,
    width: 0,
    height: 0,
    domIndex: i,
    top: i * 100,
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: 'webtoon-viewer',
    visible: true,
    diagnostics: [],
  }));

  const filteredInputCandidates = viewerPage
    ? input.imageCandidates.filter((candidate) => !isLikelyThumbnail(candidate.url))
    : [];

  const allCandidates =
    extraCandidates.length > 0
      ? [...extraCandidates, ...filteredInputCandidates]
      : filteredInputCandidates;

  const currentPages = buildImageCollection(allCandidates, 'manga');
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  return {
    adapterId: 'webtoon',
    currentPages,
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(!viewerPage
        ? [{
            code: 'webtoon-listing-page',
            message: 'Listing page detected: chapter thumbnails were ignored until an episode page is opened.',
            level: 'info' as const,
          }]
        : []),
    ],
  };
}

export const webtoonAdapter: SiteAdapter = {
  id: 'webtoon',
  matches: matchesWebtoon,
  scan: scanWebtoon,
};
