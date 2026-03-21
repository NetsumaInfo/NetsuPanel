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
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
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
  const runtime = collectRuntimeMangaGlobals(input.document);
  const tsReaderUrls = runtime.tsReaderImages;
  const domUrls = collectReaderDomImages(input.document);
  const priorityUrls = tsReaderUrls.length > 0 ? tsReaderUrls : domUrls;
  const extraCandidates = createOrderedNetworkCandidates(priorityUrls, {
    prefix: 'wp-manga',
    sourceKind: tsReaderUrls.length > 0 ? 'wp-manga-runtime' : 'wp-manga-dom',
    origin: input.origin,
    containerSignature: 'wp-reader',
    referrer: input.page.url,
  });
  const currentPages = buildImageCollection(prependCandidates(extraCandidates, input.imageCandidates), 'manga');

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
        ? [{ code: 'wp-no-reader-pages', message: 'Aucune page WP-Manga resolue via runtime ou DOM.', level: 'info' as const }]
        : tsReaderUrls.length === 0
          ? [{ code: 'wp-dom-fallback', message: 'Fallback DOM utilise faute de runtime manga exploitable.', level: 'info' as const }]
          : []),
    ],
  };
}

export const wordpressMangaAdapter: SiteAdapter = {
  id: 'wp-manga',
  matches: matchesWpManga,
  scan: scanWpManga,
};
