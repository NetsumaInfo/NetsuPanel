import type { ChapterLinkCandidate, MangaScanResult } from '@shared/types';
import { collectRuntimeMangaGlobals } from '@core/detection/collectors/runtimeMangaGlobalsCollector';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { extractMadaraPageInfo, parseMadaraAjaxChapterHtml } from '@core/detection/collectors/madaraAjaxChapterCollector';
import { detectPaginatedReader } from '@core/detection/collectors/paginatedReaderCollector';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';
import { resolveUrl } from '@shared/utils/url';
import { createOrderedNetworkCandidates, prependCandidates } from './adapterHelpers';
import type { ScanAdapterInput, SiteAdapter } from './types';

const MADARA_DOMAINS = [
  'manhwaclan',
  'vymanga',
  'kunmanga',
  'sushiscan',
  'arenascan',
  'astral-manga',
  'raijin-scans',
  'rimu-scans',
  'poseidon-scans',
  'en-thunderscans',
  'flamecomics',
  'manhuaus',
  'mangaread',
  'mangaball',
  'scan-manga',
  'reaper-scans',
  'luminousscans',
  'mangatx',
  'isekaiscan',
  'mangaclash',
  // Novelists / Isekai reader sites
  'amiactuallythestrongest',
  'ibecamethemalelead',
  'wereadmanga',
  'mangakakalot',
  'manganato',
  'readmanhua',
  'chapmanganato',
  'ohmangas',
  'mangahere',
];

function matchesMadara(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return MADARA_DOMAINS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Detect if this is a Madara manga listing page (not a chapter reader page).
 * Listing pages have the chapter list but no manga pages/images.
 */
function isMadaraListingPage(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const slug = decodeURIComponent(segments[1] || '');
    // Typical listing: /manga/slug/ or /manga/uuid/
    // NOT a chapter page: /manga/slug/chapter-1/ or /manga/slug/volume-1/chapter-1/
    const hasChapterSegment = /\/(chapter|chapitre|episode|ch|vol|partie|chap)[-_]?\d/i.test(pathname);
    const isMangaRoot = /^\/(manga|manhwa|manhua|comic|webtoon|scan)\/[^/]+\/?$/i.test(pathname);
    const chapterLikeSlug =
      /(?:^|[-_ ])(?:chapter|chapitre|episode|ep|chap|ch|capitulo|capitolo|cap|raw)(?:[-_ ]*\d|\b.*\d)/i.test(slug);
    return isMangaRoot && !hasChapterSegment && !chapterLikeSlug;
  } catch {
    return false;
  }
}

/**
 * Collect images from Madara chapter reader DOM.
 * Handles multiple lazy-loading patterns and Cloudflare placeholder src.
 */
function collectMadaraDomImages(document: ParentNode, baseUrl: string): string[] {
  const images = Array.from(
    (document as Document).querySelectorAll<HTMLImageElement>(
      [
        '.page-break img',
        '.page-break source',
        '.wp-manga-chapter-img',
        '.reading-content img',
        '.reading-content source',
        '.chapter-content img',
        '.entry-content img',
        '.text-left img',
        '#readerarea img',
        '#readerarea source',
        '.ts-main-image',
        '.ts-main-image.curdown',
        'main img[alt*="Page"]',
        // Cloudflare lazy patterns
        'img[data-cfsrc]',
        'img[data-src][class*="page"]',
        'img[data-src][class*="wp-manga"]',
      ].join(', ')
    )
  );

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const image of images) {
    // Priority order: data-cfsrc (Cloudflare) > data-src > data-lazy-src > data-original > currentSrc > src
    const rawSource =
      image.getAttribute('data-cfsrc') ||
      image.getAttribute('data-src') ||
      image.getAttribute('data-lazy-src') ||
      image.getAttribute('data-original') ||
      image.getAttribute('data-wpfc-original-src') ||
      image.getAttribute('data-url') ||
      image.getAttribute('data-lazy') ||
      image.getAttribute('data-lazyload') ||
      image.currentSrc ||
      image.getAttribute('src') ||
      image.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0] ||
      '';

    if (!rawSource) continue;

    // Skip Cloudflare placeholder data URIs
    if (
      rawSource.startsWith('data:image/svg+xml') ||
      rawSource.startsWith('data:image/gif;base64,R0lGOD') ||
      rawSource.startsWith('data:image/gif;base64,R0lGOD') ||
      rawSource.includes('cdn-cgi/mirage') ||
      rawSource.includes('cdn-cgi/image')
    ) continue;

    try {
      const resolved = new URL(rawSource, baseUrl).href;
      if (!seen.has(resolved)) {
        seen.add(resolved);
        urls.push(resolved);
      }
    } catch {
      // ignore malformed URLs
    }
  }

  // Also check noscript tags (Cloudflare Mirage pattern)
  const noscripts = Array.from((document as Document).querySelectorAll('noscript'));
  for (const ns of noscripts) {
    const html = ns.textContent || ns.innerHTML || '';
    if (!html.includes('<img')) continue;

    const srcMatch = html.match(/data-src=["']([^"']+)["']/i) ||
      html.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    const raw = srcMatch[1];
    if (!raw || raw.startsWith('data:')) continue;
    try {
      const resolved = new URL(raw, baseUrl).href;
      if (!seen.has(resolved)) {
        seen.add(resolved);
        urls.push(resolved);
      }
    } catch {
      // ignore
    }
  }

  return urls;
}

function stripWordPressProxy(url: string): string {
  try {
    const parsed = new URL(url);
    const source = parsed.searchParams.get('src');
    if (source && /^https?:\/\//i.test(source)) {
      return source;
    }
    return parsed.href.replace(/\/\/i\d+\.wp\.com\//i, '//');
  } catch {
    return url;
  }
}

function createMadaraChapterCandidate(
  anchor: HTMLAnchorElement,
  currentUrl: string,
  index: number,
  relation: ChapterLinkCandidate['relation'],
  containerSignature: string,
  score: number
): ChapterLinkCandidate | null {
  const resolvedUrl = resolveUrl(anchor.getAttribute('href') || '', currentUrl);
  if (!resolvedUrl) return null;
  const label = stripChapterLabelMetadata(compactWhitespace(
    anchor.textContent ||
    anchor.getAttribute('title') ||
    anchor.getAttribute('aria-label') ||
    ''
  ));
  const identity = parseChapterIdentity(label, resolvedUrl);

  return {
    id: `madara-chapter-${relation}-${index}`,
    url: resolvedUrl,
    canonicalUrl: resolvedUrl.split('#')[0],
    label: identity.label || label || `Chapter ${identity.chapterNumber ?? '?'}`,
    relation: resolvedUrl.split('#')[0] === currentUrl.split('#')[0] ? 'current' : relation,
    score,
    chapterNumber: identity.chapterNumber,
    volumeNumber: identity.volumeNumber,
    containerSignature,
    diagnostics: [],
  };
}

function collectMadaraChapterCandidates(document: ParentNode, currentUrl: string): ChapterLinkCandidate[] {
  const results: ChapterLinkCandidate[] = [];

  // Extended selector list for various Madara versions
  const chapterAnchors = Array.from(
    (document as Document).querySelectorAll<HTMLAnchorElement>(
      [
        'li.wp-manga-chapter a',
        '.wp-manga-chapter a',
        '.listing-chapters_wrap a',
        '.listing-chapters li a',
        '.main.version-chap li a',
        '.version-chap li a',
        '.wp-manga-chapterlist a',
        '.chapters-wrapper a',
        '.manga-chapters a',
        '.chapter_container a',
        '.chapter-page-link a',
        '.chapter-list a',
        '.listing-chapter a',
        '#chapterlist a',
        // Additional Madara variants
        '.eph-num a',
        '.chapter-item a',
        'ul.clstyle li a',
        '.chapters li a',
      ].join(', ')
    )
  );

  chapterAnchors.forEach((anchor, index) => {
    const candidate = createMadaraChapterCandidate(anchor, currentUrl, index, 'candidate', 'madara:chapter-list', 90);
    if (candidate) results.push(candidate);
  });

  const previousAnchor = (document as Document).querySelector<HTMLAnchorElement>(
    'a.prev_page, .nav-previous a, .chapter-nav a.prev, .select-pagination a.prev, a[rel="prev"], .btn-prev-chapter, .prev-chapter'
  );
  const nextAnchor = (document as Document).querySelector<HTMLAnchorElement>(
    'a.next_page, .nav-next a, .chapter-nav a.next, .select-pagination a.next, a[rel="next"], .btn-next-chapter, .next-chapter'
  );

  if (previousAnchor) {
    const candidate = createMadaraChapterCandidate(previousAnchor, currentUrl, 0, 'previous', 'madara:chapter-nav', 98);
    if (candidate) results.push(candidate);
  }

  if (nextAnchor) {
    const candidate = createMadaraChapterCandidate(nextAnchor, currentUrl, 0, 'next', 'madara:chapter-nav', 98);
    if (candidate) results.push(candidate);
  }

  // Also look for chapter select dropdown (Madara 2.x)
  const chapterSelects = Array.from(
    (document as Document).querySelectorAll<HTMLOptionElement>('select.selectpicker option[value], .chapter-select option[data-redirect]')
  );
  chapterSelects.forEach((option, index) => {
    const href = option.getAttribute('value') || option.getAttribute('data-redirect') || '';
    if (!href || href.startsWith('#')) return;
    const resolved = resolveUrl(href, currentUrl);
    if (!resolved) return;
    const label = stripChapterLabelMetadata(compactWhitespace(option.textContent || ''));
    const identity = parseChapterIdentity(label, resolved);
    results.push({
      id: `madara-select-${index}`,
      url: resolved,
      canonicalUrl: resolved.split('#')[0],
      label: identity.label || label,
      relation: option.selected ? 'current' : 'candidate',
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      score: 85,
      containerSignature: 'madara:chapter-select',
      diagnostics: [],
    });
  });

  return results;
}

/**
 * Attempt to fetch Madara chapters via the AJAX endpoint embedded in the page scripts.
 * This requires the page to have already loaded (live-dom scan only).
 * Returns parsed chapter candidates, or empty array if not available.
 */
function collectMadaraAjaxChaptersFromPage(document: ParentNode, currentUrl: string): ChapterLinkCandidate[] {
  // Only usable in live DOM context where we can read scripts/globals
  const madaraInfo = extractMadaraPageInfo(document as Document, currentUrl);

  if (!madaraInfo.isMangaListingPage) return [];

  // The AJAX chapters will be fetched asynchronously by the content script.
  // If we're in a static scan (chapter crawler), we can still try to parse
  // any pre-rendered chapter data from the page.

  // Check if there's an embedded JSON with chapters
  const scripts = Array.from((document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])'));
  for (const script of scripts) {
    const text = script.textContent || '';
    // Pattern: chapters data embedded as JSON
    const jsonMatch = text.match(/chapters\s*[=:]\s*(\[[\s\S]*?\])/);
    if (!jsonMatch) continue;
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Array<{ chapter_slug?: string; chapter_name?: string; slug?: string }>;
      if (!Array.isArray(parsed) || parsed.length === 0) continue;

      return parsed.slice(0, 200).map((ch, idx) => {
        const slug = ch.chapter_slug || ch.slug || '';
        const label = ch.chapter_name || slug || `Chapter ${idx + 1}`;
        const url = slug ? resolveUrl(slug, currentUrl) || currentUrl : currentUrl;
        const identity = parseChapterIdentity(label, url);
        return {
          id: `madara-json-${idx}`,
          url,
          canonicalUrl: url.split('#')[0],
          label: identity.label || label,
          relation: 'candidate' as const,
          chapterNumber: identity.chapterNumber,
          volumeNumber: identity.volumeNumber,
          score: 88,
          containerSignature: 'madara:json-embed',
          diagnostics: [],
        };
      });
    } catch {
      // ignore JSON parse errors
    }
  }

  return [];
}

function scanMadara(input: ScanAdapterInput): MangaScanResult {
  const runtime = collectRuntimeMangaGlobals(input.document);
  const runtimeUrls = runtime.tsReaderImages.map(stripWordPressProxy);
  const domUrls = collectMadaraDomImages(input.document, input.page.url).map(stripWordPressProxy);

  // Check for paginated reader (one image per page)
  const paginatedInfo = detectPaginatedReader(input.document as Document, input.page.url);

  // For chapter reader pages: use ts_reader or DOM images
  const chapterCandidates = [
    ...collectMadaraChapterCandidates(input.document, input.page.url),
    ...collectMadaraAjaxChaptersFromPage(input.document, input.page.url),
    ...collectChapterLinks(input.document, input.page.url, input.page.url),
  ];
  const links = buildMangaLinkMap(input.page, chapterCandidates);

  const isListingPage = isMadaraListingPage(input.page.url);

  // Determine best image source:
  // 1. ts_reader (most reliable for scroll readers)
  // 2. DOM images (may include paginated current page)
  // 3. Paginated reader image (if detected)
  let sourceUrls: string[];
  if (runtimeUrls.length > 0) {
    sourceUrls = runtimeUrls;
  } else if (domUrls.length > 0) {
    sourceUrls = domUrls;
  } else if (paginatedInfo.isPaginatedReader && paginatedInfo.currentImageUrl) {
    // Paginated reader: we only have the current page image here.
    // The chapterCrawler or the app will crawl other pages via next-page links.
    sourceUrls = [paginatedInfo.currentImageUrl];
  } else {
    sourceUrls = [];
  }

  // On listing pages, don't force manga-mode image collection (no chapter images exist)
  const extraCandidates = isListingPage
    ? []
    : createOrderedNetworkCandidates(sourceUrls, {
        prefix: 'madara',
        sourceKind: runtimeUrls.length > 0 ? 'madara-ts-reader' : (paginatedInfo.isPaginatedReader ? 'madara-paginated' : 'madara-dom'),
        origin: input.origin,
        containerSignature: 'madara-reader',
        referrer: input.page.url,
        transform: runtimeUrls.length > 0 ? undefined : 'strip-wordpress-cdn',
      });

  const paginatedDiagnostic = paginatedInfo.isPaginatedReader && !isListingPage
    ? [{
        code: 'madara-paginated-reader',
        message: `Lecteur paginé détecté: page ${paginatedInfo.currentPage ?? '?'}/${paginatedInfo.totalPages ?? '?'}. ${paginatedInfo.totalPages ? `${paginatedInfo.totalPages} pages à télécharger.` : 'Navigation de pages disponible.'}`,
        level: 'info' as const,
      }]
    : [];

  const diagnostics = [
    ...links.diagnostics,
    ...paginatedDiagnostic,
    isListingPage
      ? { code: 'madara-listing-page', message: 'Page listing manga: chapitres chargés via AJAX (content script).', level: 'info' as const }
      : (sourceUrls.length === 0
          ? [{ code: 'madara-no-pages', message: 'Aucune page Madara resolue, fallback global conserve.', level: 'info' as const }]
          : []
        )[0] || { code: 'madara-ok', message: `${sourceUrls.length} pages Madara resolues.`, level: 'info' as const },
  ].filter(Boolean);

  return {
    adapterId: paginatedInfo.isPaginatedReader ? 'madara-paginated' : 'madara',
    currentPages: buildImageCollection(
      isListingPage ? [] : prependCandidates(extraCandidates, input.imageCandidates),
      'manga'
    ),
    chapters: links.chapters,
    navigation: links.navigation,
    diagnostics,
  };
}

export const madaraAdapter: SiteAdapter = {
  id: 'madara',
  matches: matchesMadara,
  scan: scanMadara,
};
