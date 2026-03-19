/**
 * asuracomicAdapter.ts
 *
 * Adaptateur pour asuracomic.net et sites similaires utilisant
 * des readers Next.js avec __NEXT_DATA__ embarquant les images.
 */

import type { MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import type { ScanAdapterInput, SiteAdapter } from './types';

const NEXT_DATA_DOMAINS = [
  'asuracomic.net',
  'anime-sama.to',
  'everythingmoe.com',
  'mangabuddy.com',
  'galaxymanga.io',
];

function matchesNextDataReader(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return NEXT_DATA_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

function extractNextDataImages(document: ParentNode): string[] {
  const nextDataEl = (document as Document).getElementById('__NEXT_DATA__');
  if (!nextDataEl) return [];

  try {
    const parsed = JSON.parse(nextDataEl.textContent ?? '{}');
    const urls: string[] = [];

    (function walk(node: unknown, depth: number): void {
      if (depth > 12 || !node) return;
      if (typeof node === 'string') {
        if (/\.(jpe?g|png|webp|avif)/i.test(node) && node.startsWith('http')) {
          urls.push(node);
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
      } else if (typeof node === 'object') {
        Object.values(node as object).forEach((v) => walk(v, depth + 1));
      }
    })(parsed, 0);

    return urls;
  } catch {
    return [];
  }
}

function scanNextDataReader(input: ScanAdapterInput): MangaScanResult {
  const nextUrls = extractNextDataImages(input.document);

  const extraCandidates = nextUrls.map((url, i) => ({
    id: `next-data-${i}`,
    url,
    previewUrl: url,
    captureStrategy: 'network' as const,
    sourceKind: 'next-data',
    origin: input.origin,
    width: 0,
    height: 0,
    domIndex: i,
    top: i * 100,
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: 'next-reader',
    visible: true,
    diagnostics: [],
  }));

  const allCandidates =
    extraCandidates.length > 0
      ? [...extraCandidates, ...input.imageCandidates]
      : input.imageCandidates;

  const currentPages = buildImageCollection(allCandidates, 'manga');
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  return {
    adapterId: 'next-data-reader',
    currentPages,
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(extraCandidates.length === 0
        ? [{ code: 'next-no-data', message: '__NEXT_DATA__ introuvable ou vide.', level: 'info' as const }]
        : []),
    ],
  };
}

export const asuracomicAdapter: SiteAdapter = {
  id: 'next-data-reader',
  matches: matchesNextDataReader,
  scan: scanNextDataReader,
};
