import type { ChapterLinkCandidate, MangaScanResult } from '@shared/types';
import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { resolveUrl } from '@shared/utils/url';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
import type { ScanAdapterInput, SiteAdapter } from './types';

const MADARA_DOMAINS = [
  'manhwaclan',
  'vymanga',
  'kunmanga',
  'sushiscan',
  'arenascan',
  'astral-manga',
  'raijin-scans',
  'rimu-scans',
  'poseidon-scans',
  'en-thunderscans',
  'flamecomics',
  'manhuaus',
  'mangaread',
  'mangaball',
  'scan-manga',
];

function matchesMadara(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return MADARA_DOMAINS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

function collectMadaraDomImages(document: ParentNode, baseUrl: string): string[] {
  const images = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>(
      [
        '.page-break img',
        '.page-break source',
        '.wp-manga-chapter-img',
        '.reading-content img',
        '.chapter-content img',
        '.entry-content img',
        '.text-left img',
        '#readerarea img',
        '.ts-main-image',
        '.ts-main-image.curdown',
        'main img[alt*="Page"]',
      ].join(', ')
    )
  );

  return images
    .map((image) => {
      const source =
        image.dataset.url ||
        image.getAttribute('data-url') ||
        image.dataset.src ||
        image.getAttribute('data-src') ||
        image.dataset.lazySrc ||
        image.currentSrc ||
        image.getAttribute('src') ||
        image.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0] ||
        '';
      if (!source) return '';
      try {
        return new URL(source, baseUrl).href;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function stripWordPressProxy(url: string): string {
  try {
    const parsed = new URL(url);
    const source = parsed.searchParams.get('src');
    if (source && /^https?:\/\//i.test(source)) {
      return source;
    }
    return parsed.href.replace(/\/\/i\d+\.wp\.com\//i, '//');
  } catch {
    return url;
  }
}

function createMadaraChapterCandidate(
  anchor: HTMLAnchorElement,
  currentUrl: string,
  index: number,
  relation: ChapterLinkCandidate['relation'],
  containerSignature: string,
  score: number
): ChapterLinkCandidate | null {
  const resolvedUrl = resolveUrl(anchor.getAttribute('href') || '', currentUrl);
  if (!resolvedUrl) return null;
  const label = (
    anchor.textContent ||
    anchor.getAttribute('title') ||
    anchor.getAttribute('aria-label') ||
    ''
  ).trim();
  const identity = parseChapterIdentity(label, resolvedUrl);

  return {
    id: `madara-chapter-${relation}-${index}`,
    url: resolvedUrl,
    canonicalUrl: resolvedUrl.split('#')[0],
    label: identity.label || label || `Chapter ${identity.chapterNumber ?? '?'}`,
    relation: resolvedUrl.split('#')[0] === currentUrl.split('#')[0] ? 'current' : relation,
    score,
    chapterNumber: identity.chapterNumber,
    volumeNumber: identity.volumeNumber,
    containerSignature,
    diagnostics: [],
  };
}

function collectMadaraChapterCandidates(document: ParentNode, currentUrl: string): ChapterLinkCandidate[] {
  const results: ChapterLinkCandidate[] = [];
  const chapterAnchors = Array.from(
    (document as Document).querySelectorAll<HTMLAnchorElement>(
      [
        'li.wp-manga-chapter a',
        '.wp-manga-chapter a',
        '.listing-chapters_wrap a',
        '.listing-chapters li a',
        '.main.version-chap li a',
        '.version-chap li a',
        '.wp-manga-chapterlist a',
        '.chapters-wrapper a',
        '.manga-chapters a',
        '.chapter_container a',
        '.chapter-page-link a',
        '.chapter-list a',
        '.listing-chapter a',
        '#chapterlist a',
      ].join(', ')
    )
  );

  chapterAnchors.forEach((anchor, index) => {
    const candidate = createMadaraChapterCandidate(anchor, currentUrl, index, 'candidate', 'madara:chapter-list', 90);
    if (candidate) results.push(candidate);
  });

  const previousAnchor = (document as Document).querySelector<HTMLAnchorElement>(
    'a.prev_page, .nav-previous a, .chapter-nav a.prev, .select-pagination a.prev, a[rel="prev"]'
  );
  const nextAnchor = (document as Document).querySelector<HTMLAnchorElement>(
    'a.next_page, .nav-next a, .chapter-nav a.next, .select-pagination a.next, a[rel="next"]'
  );

  if (previousAnchor) {
    const candidate = createMadaraChapterCandidate(previousAnchor, currentUrl, 0, 'previous', 'madara:chapter-nav', 98);
    if (candidate) results.push(candidate);
  }

  if (nextAnchor) {
    const candidate = createMadaraChapterCandidate(nextAnchor, currentUrl, 0, 'next', 'madara:chapter-nav', 98);
    if (candidate) results.push(candidate);
  }

  return results;
}

function scanMadara(input: ScanAdapterInput): MangaScanResult {
  const runtime = collectRuntimeMangaGlobals(input.document);
  const runtimeUrls = runtime.tsReaderImages.map(stripWordPressProxy);
  const domUrls = collectMadaraDomImages(input.document, input.page.url).map(stripWordPressProxy);
  const chapterCandidates = [
    ...collectMadaraChapterCandidates(input.document, input.page.url),
    ...collectChapterLinks(input.document, input.page.url, input.page.url),
  ];
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  const extraCandidates = createOrderedNetworkCandidates(runtimeUrls.length > 0 ? runtimeUrls : domUrls, {
    prefix: 'madara',
    sourceKind: runtimeUrls.length > 0 ? 'madara-ts-reader' : 'madara-dom',
    origin: input.origin,
    containerSignature: 'madara-reader',
    referrer: input.page.url,
    transform: runtimeUrls.length > 0 ? undefined : 'strip-wordpress-cdn',
  });

  return {
    adapterId: 'madara',
    currentPages: buildImageCollection(prependCandidates(extraCandidates, input.imageCandidates), 'manga'),
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(runtimeUrls.length === 0 && domUrls.length === 0
        ? [{ code: 'madara-no-pages', message: 'Aucune page Madara resolue, fallback global conserve.', level: 'info' as const }]
        : []),
    ],
  };
}

export const madaraAdapter: SiteAdapter = {
  id: 'madara',
  matches: matchesMadara,
  scan: scanMadara,
};
