/**
 * biliBiliAdapter.ts
 *
 * Adaptateur pour manga.bilibili.com, ac.qq.com (Tencent), m.ac.qq.com.
 *
 * Ces plateformes utilisent des readers propriétaires avec authentification.
 * L'extraction d'images se fait via les variables JavaScript globales et
 * des appels API REST lorsque disponibles en live DOM context.
 *
 * Note: Ces sites nécessitent que l'utilisateur soit connecté pour accéder
 * au contenu complet.
 */

import type { ChapterLinkCandidate, MangaScanResult } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';
import { resolveUrl } from '@shared/utils/url';
import type { ScanAdapterInput, SiteAdapter } from './types';

const BILIBILI_DOMAINS = [
  'manga.bilibili.com',
  'ac.qq.com',
  'm.ac.qq.com',
];

function matchesBilibili(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return BILIBILI_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

/**
 * Extract images from Bilibili Manga reader.
 * Bilibili uses a JSON blob in __NEXT_DATA__ or window.__INITIAL_STATE__
 */
function extractBilibiliImages(document: ParentNode, baseUrl: string): string[] {
  const urls: string[] = [];

  // Try __NEXT_DATA__ (newer reader)
  const nextDataEl = (document as Document).getElementById('__NEXT_DATA__');
  if (nextDataEl) {
    try {
      const parsed = JSON.parse(nextDataEl.textContent ?? '{}');
      // Walk the JSON tree looking for image URLs
      (function walk(node: unknown): void {
        if (!node) return;
        if (typeof node === 'string') {
          if (/\.(jpe?g|png|webp)/i.test(node) && (node.startsWith('http') || node.startsWith('//'))) {
            urls.push(node.startsWith('//') ? `https:${node}` : node);
          }
          return;
        }
        if (Array.isArray(node)) node.forEach(walk);
        else if (typeof node === 'object') Object.values(node as object).forEach(walk);
      })(parsed);
    } catch { /* ignore */ }
  }

  // Try window.__INITIAL_STATE__ embedded in script
  if (urls.length === 0) {
    const scripts = Array.from((document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      // Bilibili: window.__INITIAL_STATE__={"..."}
      const stateMatch = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          (function walk(node: unknown): void {
            if (!node) return;
            if (typeof node === 'string' && /\.(jpe?g|png|webp)/i.test(node) && node.startsWith('http')) {
              urls.push(node);
            } else if (Array.isArray(node)) node.forEach(walk);
            else if (typeof node === 'object') Object.values(node as object).forEach(walk);
          })(state);
        } catch { /* ignore */ }
      }

      // Tencent (ac.qq.com): var DATA = { images: [...] }
      const tencDataMatch = text.match(/var\s+DATA\s*=\s*(\{[\s\S]{20,}?\})\s*;/);
      if (tencDataMatch) {
        try {
          const data = JSON.parse(tencDataMatch[1]);
          const images = data.images || data.imgs || data.page_urls || [];
          if (Array.isArray(images)) {
            images.forEach((img: unknown) => {
              const url = typeof img === 'string' ? img :
                typeof img === 'object' && img && 'url' in img ? (img as { url: string }).url : '';
              if (url && /\.(jpe?g|png|webp)/i.test(url)) urls.push(url);
            });
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Try DOM reader images
  if (urls.length === 0) {
    const imgs = Array.from((document as Document).querySelectorAll<HTMLImageElement>(
      '.manga-reader img, .comicpage img, .chapter-img img, #mangaImg, .page-img img, .reader-content img'
    ));
    imgs.forEach((img) => {
      const src = img.getAttribute('data-src') || img.currentSrc || img.src;
      if (src && src.startsWith('http') && /\.(jpe?g|png|webp)/i.test(src)) {
        urls.push(src);
      }
    });
  }

  // Resolve and deduplicate
  const seen = new Set<string>();
  return urls.filter((u) => {
    try { const resolved = new URL(u, baseUrl).href; if (seen.has(resolved)) return false; seen.add(resolved); return true; }
    catch { return false; }
  });
}

function collectBilibiliChapters(document: ParentNode, currentUrl: string): ChapterLinkCandidate[] {
  const results: ChapterLinkCandidate[] = [];

  // Try chapter list from DOM
  const anchors = Array.from((document as Document).querySelectorAll<HTMLAnchorElement>(
    [
      '.chapter-list a',
      '.chapter-list li a',
      '.ep-list a',
      '.comicdetail-chapter a',
      '#chapterList a',
      'ul.chapter-list-ul li a',
      // Tencent QQ Comic
      '.chapter-wrap li a',
      '.chapter_info a',
    ].join(', ')
  ));

  anchors.forEach((anchor, index) => {
    const href = anchor.getAttribute('href') || '';
    const resolved = resolveUrl(href, currentUrl);
    if (!resolved) return;

    const label = stripChapterLabelMetadata(compactWhitespace(
      anchor.textContent || anchor.getAttribute('title') || ''
    ));
    const identity = parseChapterIdentity(label, resolved);

    results.push({
      id: `bilibili-chapter-${index}`,
      url: resolved,
      canonicalUrl: resolved.split('#')[0],
      label: identity.label || label || `Chapter ${identity.chapterNumber ?? '?'}`,
      relation: resolved.split('#')[0] === currentUrl.split('#')[0] ? 'current' : 'candidate',
      score: 88,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature: 'bilibili:chapter-list',
      diagnostics: [],
    });
  });

  return results;
}

function scanBilibili(input: ScanAdapterInput): MangaScanResult {
  const urls = extractBilibiliImages(input.document, input.page.url);

  const extraCandidates = urls.map((url, i) => ({
    id: `bilibili-${i}`,
    url,
    previewUrl: url,
    captureStrategy: 'network' as const,
    sourceKind: 'bilibili-reader',
    origin: input.origin,
    width: 0,
    height: 0,
    domIndex: i,
    top: i * 100,
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: 'bilibili-reader',
    visible: true,
    diagnostics: [],
  }));

  const allCandidates =
    extraCandidates.length > 0
      ? [...extraCandidates, ...input.imageCandidates]
      : input.imageCandidates;

  const currentPages = buildImageCollection(allCandidates, 'manga');
  const chapterCandidates = [
    ...collectBilibiliChapters(input.document, input.page.url),
    ...collectChapterLinks(input.document, input.page.url, input.page.url),
  ];
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  return {
    adapterId: 'bilibili',
    currentPages,
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      ...(urls.length === 0
        ? [{ code: 'bilibili-no-images', message: 'Aucune image trouvée. Ce site peut nécessiter une connexion ou utilise un DRM.', level: 'warning' as const }]
        : [{ code: 'bilibili-ok', message: `${urls.length} images trouvées.`, level: 'info' as const }]
      ),
    ],
  };
}

export const bilibiliAdapter: SiteAdapter = {
  id: 'bilibili',
  matches: matchesBilibili,
  scan: scanBilibili,
};
