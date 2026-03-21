import type { MangaScanResult } from '@shared/types';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
import type { ScanAdapterInput, SiteAdapter } from './types';

function matchesWeebCentral(url: string): boolean {
  try {
    return new URL(url).hostname.includes('weebcentral.com');
  } catch {
    return false;
  }
}

function collectWeebCentralImages(document: ParentNode, baseUrl: string): string[] {
  const images = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>('main section img[alt*="Page"], main section img')
  );

  return images
    .map((image) => image.currentSrc || image.src || '')
    .map((url) => {
      if (!url) return '';
      try {
        return new URL(url, baseUrl).href;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function scanWeebCentral(input: ScanAdapterInput): MangaScanResult {
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);
  const extraCandidates = createOrderedNetworkCandidates(collectWeebCentralImages(input.document, input.page.url), {
    prefix: 'weebcentral',
    sourceKind: 'weebcentral',
    origin: input.origin,
    containerSignature: 'weebcentral-reader',
    referrer: input.page.url,
  });

  return {
    adapterId: 'weebcentral',
    currentPages: buildImageCollection(prependCandidates(extraCandidates, input.imageCandidates), 'manga'),
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: links.diagnostics,
  };
}

export const weebcentralAdapter: SiteAdapter = {
  id: 'weebcentral',
  matches: matchesWeebCentral,
  scan: scanWeebCentral,
};
