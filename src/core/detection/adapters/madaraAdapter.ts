import type { MangaScanResult } from '@shared/types';
import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
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
      '.page-break img, .page-break source, .wp-manga-chapter-img, .reading-content img, .chapter-content img'
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

function scanMadara(input: ScanAdapterInput): MangaScanResult {
  const runtime = collectRuntimeMangaGlobals(input.document);
  const runtimeUrls = runtime.tsReaderImages.map(stripWordPressProxy);
  const domUrls = collectMadaraDomImages(input.document, input.page.url).map(stripWordPressProxy);
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
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
