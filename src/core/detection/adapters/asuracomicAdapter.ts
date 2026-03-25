/**
 * asuracomicAdapter.ts
 *
 * Adaptateur pour asuracomic.net et sites similaires utilisant
 * des readers Next.js avec __NEXT_DATA__ embarquant les images.
 */

import type { ChapterLinkCandidate, MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
import type { ScanAdapterInput, SiteAdapter } from './types';

const NEXT_DATA_DOMAINS = [
  'asuracomic.net',
  'asurascans.com',
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

function parseAstroEncodedProps(raw: string): unknown | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    const revive = (value: unknown): unknown => {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
        const [tag, payload] = value as [number, unknown];
        if (tag === 1 && Array.isArray(payload)) {
          return payload.map(revive);
        }

        if (tag === 0) {
          if (payload === null || typeof payload !== 'object') {
            return payload;
          }

          return Object.fromEntries(
            Object.entries(payload as Record<string, unknown>).map(([key, entry]) => [key, revive(entry)])
          );
        }

        return payload;
      }

      if (Array.isArray(value)) {
        return value.map(revive);
      }

      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, revive(entry)])
        );
      }

      if (value === undefined) {
        return value;
      }

      return value;
    };

    return revive(parsed);
  } catch {
    return null;
  }
}

function buildAsuraChapterCandidate(
  baseUrl: string,
  currentUrl: string,
  chapter: { number?: number | null; title?: string | null },
  index: number,
  seriesSlug: string,
  relation: ChapterLinkCandidate['relation'],
  containerSignature: string,
  score: number
): ChapterLinkCandidate | null {
  if (typeof chapter.number !== 'number' || !Number.isFinite(chapter.number)) {
    return null;
  }

  const url = new URL(`/comics/${seriesSlug}/chapter/${chapter.number}`, baseUrl).href;
  const label = stripChapterLabelMetadata(compactWhitespace(chapter.title || `Chapter ${chapter.number}`));
  const identity = parseChapterIdentity(label, url);
  return {
    id: `asura-chapter-${relation}-${index}`,
    url,
    canonicalUrl: url.split('#')[0],
    label: identity.label || label || `Chapter ${chapter.number}`,
    relation: url.split('#')[0] === currentUrl.split('#')[0] ? 'current' : relation,
    score,
    chapterNumber: identity.chapterNumber,
    volumeNumber: identity.volumeNumber,
    containerSignature,
    diagnostics: [],
  };
}

function extractAsuraChapterCandidates(document: ParentNode, pageUrl: string): ChapterLinkCandidate[] {
  const islands = Array.from(
    (document as Document).querySelectorAll<HTMLElement>(
      'astro-island[component-url*="ChapterListReact"], astro-island[component-url*="ChapterReader"]'
    )
  );
  const results: ChapterLinkCandidate[] = [];

  for (const island of islands) {
    const props = parseAstroEncodedProps(island.getAttribute('props') || '');
    if (!props || typeof props !== 'object') continue;
    const data = props as Record<string, unknown>;
    const rawSeriesSlug = data.seriesSlug || data.series_slug;
    const seriesSlug = typeof rawSeriesSlug === 'string' ? rawSeriesSlug : '';
    if (!seriesSlug) continue;

    const chapters = Array.isArray(data.chapters)
      ? data.chapters
      : Array.isArray(data.chapterList)
        ? data.chapterList
        : [];
    chapters.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const candidate = buildAsuraChapterCandidate(
        pageUrl,
        pageUrl,
        entry as { number?: number | null; title?: string | null },
        index,
        seriesSlug,
        'candidate',
        'asura:chapter-list',
        92
      );
      if (candidate) {
        results.push(candidate);
      }
    });

    const prevCandidate = data.prevChapter && typeof data.prevChapter === 'object'
      ? buildAsuraChapterCandidate(
          pageUrl,
          pageUrl,
          data.prevChapter as { number?: number | null; title?: string | null },
          0,
          seriesSlug,
          'previous',
          'asura:chapter-nav',
          98
        )
      : null;
    const nextCandidate = data.nextChapter && typeof data.nextChapter === 'object'
      ? buildAsuraChapterCandidate(
          pageUrl,
          pageUrl,
          data.nextChapter as { number?: number | null; title?: string | null },
          0,
          seriesSlug,
          'next',
          'asura:chapter-nav',
          98
        )
      : null;

    if (prevCandidate) results.push(prevCandidate);
    if (nextCandidate) results.push(nextCandidate);
  }

  return results;
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
  const chapterCandidates = [
    ...extractAsuraChapterCandidates(input.document, input.page.url),
    ...collectChapterLinks(input.document, input.page.url, input.page.url),
  ];
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
