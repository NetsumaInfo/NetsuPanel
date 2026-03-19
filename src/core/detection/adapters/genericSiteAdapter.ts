import type { MangaScanResult } from '@shared/types';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import type { ScanAdapterInput, SiteAdapter } from './types';

function scanGenericSite(input: ScanAdapterInput): MangaScanResult {
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  return {
    adapterId: 'generic',
    currentPages: buildImageCollection(input.imageCandidates, 'manga'),
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: links.diagnostics,
  };
}

export const genericSiteAdapter: SiteAdapter = {
  id: 'generic',
  matches: () => true,
  scan: scanGenericSite,
};
