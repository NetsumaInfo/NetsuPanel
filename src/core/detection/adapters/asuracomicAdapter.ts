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
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
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

function extractDomReaderImages(document: ParentNode, baseUrl: string): string[] {
  const images = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>(
      '#scansPlacement img, main img, .entry-content img, .reader-area img, .chapter-content img'
    )
  );

  return images
    .map((image) => image.dataset.src || image.currentSrc || image.getAttribute('src') || '')
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

function scanNextDataReader(input: ScanAdapterInput): MangaScanResult {
  const nextUrls = extractNextDataImages(input.document);
  const domUrls = extractDomReaderImages(input.document, input.page.url);
  const extraCandidates = createOrderedNetworkCandidates(nextUrls.length > 0 ? nextUrls : domUrls, {
    prefix: 'next-data',
    sourceKind: nextUrls.length > 0 ? 'next-data' : 'next-data-dom',
    origin: input.origin,
    containerSignature: 'next-reader',
    referrer: input.page.url,
  });

  const currentPages = buildImageCollection(prependCandidates(extraCandidates, input.imageCandidates), 'manga');
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
