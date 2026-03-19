/**
 * wordpressMangaAdapter.ts
 *
 * Adaptateur générique pour les sites manga basés sur WordPress
 * avec le plugin WP-Manga / Madara / Manga Reader.
 *
 * Sites couverts (même structure WP-Manga) :
 *   manhwaclan.com, vymanga.com, kunmanga.com, sushiscan.fr, arenascan.com,
 *   astral-manga.fr, raijin-scans.fr, rimu-scans.fr, poseidon-scans.co,
 *   en-thunderscans.com, flamecomics.xyz, manhuaus.com, mangaread.org,
 *   amiactuallythestrongest.com, ibecamethemalelead.com, mangaball.net, ...
 *
 * Pipeline :
 *  1. Cherche le nonce WP-Manga dans window.ts_reader ou wp_manga_chapter_img_sitemap
 *  2. Collecte les URLs depuis le reader DOM (.page-break img, .wp-manga-chapter-img)
 *  3. Collecte depuis JSON embarqué (ts_reader.params.sources)
 *  4. Navigation: rel=prev/next + .btn-next-chapter / .btn-prev-chapter
 */

import type { MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import type { ScanAdapterInput, SiteAdapter } from './types';

const WP_MANGA_DOMAINS = [
  'manhwaclan', 'vymanga', 'kunmanga', 'sushiscan', 'arenascan',
  'astral-manga', 'raijin-scans', 'rimu-scans', 'poseidon-scans',
  'en-thunderscans', 'flamecomics', 'manhuaus', 'mangaread',
  'amiactuallythestrongest', 'ibecamethemalelead', 'mangaball',
  'utoon', 'manhwaclan', 'scan-manga',
];

function matchesWpManga(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return WP_MANGA_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

/**
 * Extract page image URLs from ts_reader.params.sources (WP-Manga / Madara theme)
 */
function parseTsReaderSources(document: ParentNode): string[] {
  const scripts = Array.from(
    (document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])')
  );
  for (const script of scripts) {
    const text = script.textContent ?? '';
    // Match: ts_reader.run({"sources":[{"images":["url1","url2",...]}]})
    const m = text.match(/ts_reader\.run\s*\(\s*(\{[\s\S]*?\})\s*\)/);
    if (!m) continue;
    try {
      const parsed = JSON.parse(m[1]) as {
        sources?: Array<{ images?: string[] }>;
      };
      const images = parsed.sources?.[0]?.images ?? [];
      if (images.length > 0) return images.filter((u) => typeof u === 'string');
    } catch { /* ignore */ }
  }
  return [];
}

/**
 * Collect from DOM: .page-break img, .wp-manga-chapter-img, .reading-content img
 */
function collectReaderDomImages(document: ParentNode): string[] {
  const selectors = [
    '.page-break img',
    '.wp-manga-chapter-img',
    '.reading-content img',
    '.chapter-content img',
    '.entry-content img',
  ];
  const urls: string[] = [];
  for (const sel of selectors) {
    const imgs = Array.from((document as Document).querySelectorAll<HTMLImageElement>(sel));
    for (const img of imgs) {
      const src = img.dataset.src || img.dataset.lazySrc || img.getAttribute('src') || '';
      if (src && src.startsWith('http')) urls.push(src);
    }
  }
  return urls;
}

function scanWpManga(input: ScanAdapterInput): MangaScanResult {
  // 1. Try ts_reader JSON first (most reliable)
  const tsReaderUrls = parseTsReaderSources(input.document);

  // 2. DOM collect
  const domUrls = collectReaderDomImages(input.document);

  // Merge ts_reader + DOM (ts_reader wins on ordering if available)
  const priorityUrls = tsReaderUrls.length > 0 ? tsReaderUrls : domUrls;

  // Build extra raw candidates from WP-specific URLs
  const extraCandidates = priorityUrls.map((url, i) => ({
    id: `wp-manga-${i}`,
    url,
    previewUrl: url,
    captureStrategy: 'network' as const,
    sourceKind: 'wp-manga',
    origin: input.origin,
    width: 0,
    height: 0,
    domIndex: i,
    top: i * 100, // preserve order
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: 'wp-reader',
    visible: true,
    diagnostics: [],
  }));

  // Merge with original candidates
  const allCandidates =
    extraCandidates.length > 0
      ? [...extraCandidates, ...input.imageCandidates]
      : input.imageCandidates;

  const currentPages = buildImageCollection(allCandidates, 'manga');

  // Chapter links
  const chapterCandidates = collectChapterLinks(input.document, input.page.url, input.page.url);
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  return {
    adapterId: 'wp-manga',
    currentPages,
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(extraCandidates.length === 0
        ? [{ code: 'wp-no-ts-reader', message: 'ts_reader.run() non trouvé, fallback DOM utilisé.', level: 'info' as const }]
        : []),
    ],
  };
}

export const wordpressMangaAdapter: SiteAdapter = {
  id: 'wp-manga',
  matches: matchesWpManga,
  scan: scanWpManga,
};
