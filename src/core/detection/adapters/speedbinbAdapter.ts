import type { MangaScanResult } from '@shared/types';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
import type { ScanAdapterInput, SiteAdapter } from './types';

const SPEEDBINB_DOMAINS = ['comic-meteor.jp', 'tonarinoyj.jp', 'cmoa.jp', 'booklive.jp'];

function matchesSpeedBinb(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return SPEEDBINB_DOMAINS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

function collectSpeedBinbPayloads(document: ParentNode, baseUrl: string): string[] {
  const datasetNodes = Array.from((document as Document).querySelectorAll<HTMLElement>('div[data-ptimg], div[data-ptbinb]'));
  const urls: string[] = [];

  for (const node of datasetNodes) {
    const ptimg = node.dataset.ptimg;
    if (ptimg) {
      try {
        urls.push(new URL(ptimg, baseUrl).href);
      } catch {
        // Ignore malformed values.
      }
    }
  }

  return urls;
}

function scanSpeedBinb(input: ScanAdapterInput): MangaScanResult {
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);
  const payloads = collectSpeedBinbPayloads(input.document, input.page.url);
  const extraCandidates = createOrderedNetworkCandidates(payloads, {
    prefix: 'speedbinb',
    sourceKind: 'speedbinb',
    origin: input.origin,
    containerSignature: 'speedbinb-reader',
    referrer: input.page.url,
    transform: 'descramble-speedbinb',
  });

  return {
    adapterId: 'speedbinb',
    currentPages: buildImageCollection(prependCandidates(extraCandidates, input.imageCandidates), 'manga'),
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(extraCandidates.length > 0
        ? [{ code: 'speedbinb-detected', message: 'Lecteur SpeedBinb detecte; transformation de telechargement requise.', level: 'info' as const }]
        : []),
    ],
  };
}

export const speedbinbAdapter: SiteAdapter = {
  id: 'speedbinb',
  matches: matchesSpeedBinb,
  scan: scanSpeedBinb,
};
