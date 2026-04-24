/**
 * mangadexAdapter.ts
 *
 * Adaptateur MangaDex — utilise l'API publique MangaDex v5.
 * MangaDex charge les pages via une API REST documentée et ouverte.
 *
 * Flow :
 *  1. Extraire le chapter UUID depuis l'URL (/chapter/UUID)
 *  2. Appeler GET https://api.mangadex.org/at-home/server/{chapterId}
 *  3. Construire les URLs depuis baseUrl + chapter.hash + page filenames
 *
 * Note : CORS géré via le background script (fetchBinary).
 * Pour la détection live-dom, on lit aussi les images chargées dans le reader SPA.
 */

import type { MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import type { ScanAdapterInput, SiteAdapter } from './types';

const MANGADEX_HOST = 'mangadex.org';

function matchesMangaDex(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(MANGADEX_HOST);
  } catch {
    return false;
  }
}

/** Extract chapter UUID from /chapter/{uuid} URLs */
function extractChapterUuid(url: string): string | null {
  const m = url.match(/\/chapter\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

/** Extract manga UUID from /title/{uuid} or /manga/{uuid} URLs */
function extractMangaUuid(url: string): string | null {
  const m = url.match(/\/(?:title|manga)\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

/**
 * Parse MangaDex at-home API response from any embedded JSON on the page.
 * MangaDex SPA sometimes embeds the initial state via __next_data__ or similar.
 */
function parseAtHomeFromDom(document: ParentNode): {
  baseUrl?: string;
  hash?: string;
  data?: string[];
  dataSaver?: string[];
} | null {
  // Look for __NEXT_DATA__ or __NUXT__ containing at-home info
  const scripts = Array.from(
    (document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])')
  );
  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (!text.includes('baseUrl') && !text.includes('chapterHash')) continue;
    try {
      const m = text.match(/\{[\s\S]*"baseUrl"[\s\S]*"chapterHash"[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as {
          baseUrl?: string;
          chapterHash?: string;
          data?: string[];
          dataSaver?: string[];
        };
        if (parsed.baseUrl && parsed.chapterHash) {
          return {
            baseUrl: parsed.baseUrl,
            hash: parsed.chapterHash,
            data: parsed.data,
            dataSaver: parsed.dataSaver,
          };
        }
      }
    } catch { /* ignore */ }
  }
  return null;
}

/** Build page URLs from at-home response */
function buildPageUrls(baseUrl: string, hash: string, filenames: string[]): string[] {
  return filenames.map((fn) => `${baseUrl}/data/${hash}/${fn}`);
}

function scanMangaDex(input: ScanAdapterInput): MangaScanResult {
  const chapterUuid = extractChapterUuid(input.page.url);
  const mangaUuid = extractMangaUuid(input.page.url);
  const atHome = parseAtHomeFromDom(input.document);

  let extraCandidates: typeof input.imageCandidates = [];

  if (atHome?.baseUrl && atHome.hash && (atHome.data?.length ?? 0) > 0) {
    const urls = buildPageUrls(atHome.baseUrl, atHome.hash, atHome.data ?? []);
    extraCandidates = urls.map((url, i) => ({
      id: `mangadex-${chapterUuid ?? 'unknown'}-${i}`,
      url,
      previewUrl: url,
      captureStrategy: 'network' as const,
      sourceKind: 'mangadex-api',
      origin: input.origin,
      width: 0,
      height: 0,
      domIndex: i,
      top: i * 100,
      left: 0,
      altText: `Page ${i + 1}`,
      titleText: '',
      containerSignature: 'mangadex',
      visible: true,
      diagnostics: [],
    }));
  }

  const allCandidates =
    extraCandidates.length > 0
      ? [...extraCandidates, ...input.imageCandidates]
      : input.imageCandidates;

  const currentPages = buildImageCollection(allCandidates, 'manga');

  // MangaDex home/search pages contain unrelated feed links. Only title/chapter pages
  // have enough series context; full lists are hydrated later through the v5 API.
  const shouldCollectDomChapters = Boolean(chapterUuid || mangaUuid);
  const chapterCandidates = shouldCollectDomChapters
    ? collectChapterLinks(input.document, input.page.url, input.page.url)
    : [];
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  return {
    adapterId: 'mangadex',
    currentPages,
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(extraCandidates.length === 0
        ? [{
            code: 'mangadex-no-api-data',
            message: chapterUuid
              ? `Chapter UUID détecté (${chapterUuid}) mais at-home API data introuvable dans le DOM. Tentez de recharger la page.`
              : 'URL MangaDex sans chapter UUID — sur la page d\'accueil ou de titre.',
            level: 'info' as const,
          }]
        : []),
      ...(!shouldCollectDomChapters
        ? [{
            code: 'mangadex-no-series-context',
            message: 'Page MangaDex sans titre/chapitre: les liens du flux ne sont pas utilisés comme chapitres.',
            level: 'info' as const,
          }]
        : []),
    ],
  };
}

export const mangadexAdapter: SiteAdapter = {
  id: 'mangadex',
  matches: matchesMangaDex,
  scan: scanMangaDex,
};
