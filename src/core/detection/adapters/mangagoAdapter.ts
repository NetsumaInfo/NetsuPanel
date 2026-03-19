/**
 * mangagoBuddyAdapter.ts
 *
 * Adaptateur pour mangago.me et sites similaires utilisant des readers
 * avec les images embarquées dans des structures script spécifiques.
 */

import type { MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import type { ScanAdapterInput, SiteAdapter } from './types';

const MANGAGO_DOMAINS = ['mangago.me', 'utoon.net'];

function matchesMangago(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return MANGAGO_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

function extractMangagoImages(document: ParentNode): string[] {
  const scripts = Array.from(
    (document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])')
  );

  for (const script of scripts) {
    const text = script.textContent ?? '';
    // Mangago uses: var imglist = ["url1", "url2", ...]
    const m = text.match(/var\s+imglist\s*=\s*\[(.*?)\]/s);
    if (m?.[1]) {
      const urls = m[1].match(/"([^"]+)"/g);
      if (urls) {
        return urls
          .map((u) => u.replace(/^"|"$/g, ''))
          .filter((u) => /\.(jpe?g|png|webp)/i.test(u));
      }
    }
  }

  // Fallback: images in reader container
  const readerImgs = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>('#chapter_img, .manga-pics img, .reader-area img')
  );
  return readerImgs.map((img) => img.getAttribute('src') ?? '').filter((u) => u.startsWith('http'));
}

function scanMangago(input: ScanAdapterInput): MangaScanResult {
  const urls = extractMangagoImages(input.document);

  const extraCandidates = urls.map((url, i) => ({
    id: `mangago-${i}`,
    url,
    previewUrl: url,
    captureStrategy: 'network' as const,
    sourceKind: 'mangago',
    origin: input.origin,
    width: 0,
    height: 0,
    domIndex: i,
    top: i * 100,
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: 'mangago-reader',
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
    adapterId: 'mangago',
    currentPages,
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: links.diagnostics,
  };
}

export const mangagoAdapter: SiteAdapter = {
  id: 'mangago',
  matches: matchesMangago,
  scan: scanMangago,
};
