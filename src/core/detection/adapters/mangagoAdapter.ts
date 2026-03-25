/**
 * mangagoBuddyAdapter.ts
 *
 * Adaptateur pour mangago.me et sites similaires utilisant des readers
 * avec les images embarquées dans des structures script spécifiques.
 */

import type { ChapterLinkCandidate, MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';
import { resolveUrl } from '@shared/utils/url';
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

function collectMangagoChapterCandidates(document: ParentNode, currentUrl: string): ChapterLinkCandidate[] {
  const anchors = Array.from(
    (document as Document).querySelectorAll<HTMLAnchorElement>(
      [
        '#chapter_table a[href]',
        '.chapter_table a[href]',
        '.chapter_list a[href]',
        '.list-chapter a[href]',
        'a[href*="/read-manga/"]',
        'a[href*="/chapter/"]',
      ].join(', ')
    )
  );

  const results: ChapterLinkCandidate[] = [];
  anchors.forEach((anchor, index) => {
    const url = resolveUrl(anchor.getAttribute('href') || '', currentUrl);
    if (!url) return;
    const label = stripChapterLabelMetadata(compactWhitespace(
      anchor.textContent ||
      anchor.getAttribute('title') ||
      anchor.getAttribute('aria-label') ||
      ''
    ));
    const identity = parseChapterIdentity(label, url);
    results.push({
      id: `mangago-chapter-${index}`,
      url,
      canonicalUrl: url.split('#')[0],
      label: identity.label || label || `Chapter ${identity.chapterNumber ?? '?'}`,
      relation: url.split('#')[0] === currentUrl.split('#')[0] ? 'current' : 'candidate',
      score: 88,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature: 'mangago:chapter-list',
      diagnostics: [],
    });
  });

  return results;
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
  const chapterCandidates = [
    ...collectMangagoChapterCandidates(input.document, input.page.url),
    ...collectChapterLinks(input.document, input.page.url, input.page.url),
  ];
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
