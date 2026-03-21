import type { MangaScanResult } from '@shared/types';
import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
import type { ScanAdapterInput, SiteAdapter } from './types';

const MANGASTREAM_DOMAINS = [
  'asuratoon',
  'rawkuma',
  'manga-tx',
  'toonily',
  'reset-scans',
  'nightscans',
  'weebcentral',
];

function matchesMangastream(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return MANGASTREAM_DOMAINS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

function collectMangastreamDomImages(document: ParentNode, baseUrl: string): string[] {
  const images = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>(
      '#readerarea img, .reader-area img, .reading-content img, .ts-main-image'
    )
  );

  return images
    .map((image) => image.dataset.lazySrc || image.dataset.src || image.getAttribute('original') || image.currentSrc || image.src)
    .map((url) => {
      if (!url) return '';
      try {
        return new URL(url, baseUrl).href;
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .filter((url) => !url.includes('histats.com'));
}

function scanMangastream(input: ScanAdapterInput): MangaScanResult {
  const runtime = collectRuntimeMangaGlobals(input.document);
  const runtimeUrls = runtime.tsReaderImages;
  const domUrls = collectMangastreamDomImages(input.document, input.page.url);
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);
  const extraCandidates = createOrderedNetworkCandidates(runtimeUrls.length > 0 ? runtimeUrls : domUrls, {
    prefix: 'mangastream',
    sourceKind: runtimeUrls.length > 0 ? 'mangastream-runtime' : 'mangastream-dom',
    origin: input.origin,
    containerSignature: 'mangastream-reader',
    referrer: input.page.url,
  });

  return {
    adapterId: 'mangastream',
    currentPages: buildImageCollection(prependCandidates(extraCandidates, input.imageCandidates), 'manga'),
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(extraCandidates.length === 0
        ? [{ code: 'mangastream-no-pages', message: 'Aucune page MangaStream resolue depuis runtime ou DOM.', level: 'info' as const }]
        : []),
    ],
  };
}

export const mangastreamAdapter: SiteAdapter = {
  id: 'mangastream',
  matches: matchesMangastream,
  scan: scanMangastream,
};
