/**
 * paginatedReaderCollector.ts
 *
 * Collecteur pour les lecteurs paginés (une image par page).
 * Certains sites (manhwaclan, vymanga, kakao, etc.) affichent une image à la fois
 * avec une navigation "page suivante" au lieu d'un défilement vertical.
 *
 * Ce module:
 * 1. Détecte si on est sur un lecteur paginé
 * 2. Extrait l'image de la page courante
 * 3. Identifie les liens de navigation de page (page 1/20, page 2/20, etc.)
 * 4. Fournit des URLs de pages pour crawl optionnel
 */

import { readImageSourceDescriptors } from './imageAttributeSources';
import { isPlaceholderImageUrl, resolveUrl, unwrapProxiedImageUrl } from '@shared/utils/url';

export interface PaginatedReaderInfo {
  /** Whether this appears to be a paginated reader */
  isPaginatedReader: boolean;
  /** Current page number (1-indexed) */
  currentPage: number | null;
  /** Total number of pages */
  totalPages: number | null;
  /** URL of the next page (null if last page) */
  nextPageUrl: string | null;
  /** URL of the previous page (null if first page) */
  prevPageUrl: string | null;
  /** URLs of all pages in the chapter (may be empty if not available) */
  allPageUrls: string[];
  /** The image URL for the current page */
  currentImageUrl: string | null;
}

/** Selectors for the main reader image in paginated mode */
const PAGINATED_IMAGE_SELECTORS = [
  '#page_image',
  '#manga_page',
  '.page-image img',
  '#page-image img',
  '.reader-area .page img',
  '.chapter-page-image img',
  '.page_image img',
  '.current-page img',
  '.ts-main-image.curdown',
  '#chapter_img',
  '.viewer_single img',
  '.paged-reader img',
  '#current_page_image',
  // MangaGo paginated
  '.manga-pics #chapter_img',
  // Generic large single image
  'img.page-src',
  'img[class*="page-image"]',
  'img[id*="page_image"]',
  'img[id*="manga_page"]',
];

/** Patterns that indicate paginated navigation (page X of Y) */
const PAGINATED_NAV_RE = /\b(\d+)\s*[\/\-]\s*(\d+)\b/;
const PAGINATED_PAGE_SELECT_RE = /page|p\.|pg\./i;

function isLikelyImageResourceUrl(input: string): boolean {
  if (!input) return false;
  if (/\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i.test(input)) return true;

  try {
    const parsed = new URL(input);
    if (/\/cdn-cgi\/image\//i.test(parsed.pathname)) return true;
    if (/_next\/image/i.test(parsed.pathname)) return true;

    const nested = parsed.searchParams.get('url') || parsed.searchParams.get('src');
    if (nested && /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:$|[?#])/i.test(decodeURIComponent(nested))) {
      return true;
    }
  } catch {
    // ignore URL parse errors
  }

  return false;
}

/** Extract page info from a select element */
function extractFromPageSelect(doc: Document, baseUrl: string): Partial<PaginatedReaderInfo> {
  const selects = Array.from(doc.querySelectorAll<HTMLSelectElement>(
    'select[name*="page"], select[id*="page"], select.page-select, select.selectpicker[onchange*="page"], select[onChange*="location"]'
  ));

  for (const select of selects) {
    const options = Array.from(select.options);
    if (options.length < 2) continue;

    const allPageUrls: string[] = [];
    let currentPage: number | null = null;
    let totalPages: number | null = null;

    for (const option of options) {
      const value = option.value || option.getAttribute('data-redirect') || '';
      if (!value || value.startsWith('#') || value.startsWith('javascript')) continue;
      const looksLikeUrl =
        /^https?:\/\//i.test(value) ||
        value.startsWith('/') ||
        value.startsWith('?') ||
        /[/?=&]/.test(value);
      if (!looksLikeUrl) continue;

      try {
        const resolved = new URL(value, baseUrl).href;
        allPageUrls.push(resolved);
        if (option.selected) {
          const pageMatch = option.textContent?.match(/\d+/);
          if (pageMatch) currentPage = parseInt(pageMatch[0], 10);
        }
      } catch {
        // skip
      }
    }

    if (allPageUrls.length >= 2) {
      totalPages = allPageUrls.length;
      return { allPageUrls, currentPage, totalPages, isPaginatedReader: true };
    }
  }

  return {};
}

/** Extract page info from numbered page links */
function extractFromPageLinks(doc: Document, baseUrl: string, currentUrl: string): Partial<PaginatedReaderInfo> {
  // Look for numbered page navigation links
  const pageNavContainers = Array.from(doc.querySelectorAll(
    '.page-nav, .page-navigation, .page-numbers, .paginacion, .select-pagination, .chapter-pagination, [class*="page-nav"]'
  ));

  for (const container of pageNavContainers) {
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'));
    if (links.length < 2) continue;

    const pageUrls: string[] = [];
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!href || href === '#') continue;
      try {
        pageUrls.push(new URL(href, baseUrl).href);
      } catch { /* skip */ }
    }

    if (pageUrls.length >= 2) {
      return { allPageUrls: pageUrls, isPaginatedReader: true };
    }
  }

  // Look for "page X of Y" text anywhere in the page
  const allText = doc.body?.textContent || '';
  const pageOfMatch = allText.match(/(?:page|p\.)\s*(\d+)\s*(?:of|\/|-)\s*(\d+)/i);
  if (pageOfMatch) {
    return {
      currentPage: parseInt(pageOfMatch[1], 10),
      totalPages: parseInt(pageOfMatch[2], 10),
      isPaginatedReader: true,
    };
  }

  // Check for input[type=number] showing current page
  const pageInput = doc.querySelector<HTMLInputElement>('input[type="number"][name*="page"], input[name*="page_number"]');
  if (pageInput) {
    const current = parseInt(pageInput.value || '1', 10);
    const max = parseInt(pageInput.max || '0', 10);
    if (!isNaN(current) && max > 1) {
      return { currentPage: current, totalPages: max, isPaginatedReader: true };
    }
  }

  return {};
}

/** Find next/prev page navigation links */
function extractPageNavigation(doc: Document, baseUrl: string): {
  nextPageUrl: string | null;
  prevPageUrl: string | null;
} {
  const PREV_RE = /(prev|previous|older|back|précédent|←|‹|<<)/i;
  const NEXT_RE = /(next|newer|forward|suivant|→|›|>>)/i;

  let nextPageUrl: string | null = null;
  let prevPageUrl: string | null = null;

  // 1. rel="next" / rel="prev" links
  const relNext = doc.querySelector<HTMLLinkElement>('link[rel="next"]');
  const relPrev = doc.querySelector<HTMLLinkElement>('link[rel="prev"]');
  if (relNext?.href) nextPageUrl = relNext.href;
  if (relPrev?.href) prevPageUrl = relPrev.href;

  // 2. Madara-style page nav buttons
  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>(
    'a.next_page, a.prev_page, a[data-page="next"], a[data-page="prev"], ' +
    '.nav-next a, .nav-previous a, a[rel="next"], a[rel="prev"]'
  ));

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href === '#') continue;
    try {
      const resolved = new URL(href, baseUrl).href;
      const text = `${anchor.textContent || ''} ${anchor.className} ${anchor.id}`.trim();
      if (!nextPageUrl && NEXT_RE.test(text)) nextPageUrl = resolved;
      if (!prevPageUrl && PREV_RE.test(text)) prevPageUrl = resolved;
    } catch { /* skip */ }
  }

  // 3. Script-based page navigation (some sites use onclick)
  if (!nextPageUrl || !prevPageUrl) {
    const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';
      // Match: next_page = "/manga/slug/chapter-1/2"; or page_url_next = "..."
      const nextMatch = text.match(/(?:next_page|nextPage|page_url_next)\s*[=:]\s*["']([^"']+)["']/);
      const prevMatch = text.match(/(?:prev_page|prevPage|page_url_prev)\s*[=:]\s*["']([^"']+)["']/);
      if (nextMatch && !nextPageUrl) {
        try { nextPageUrl = new URL(nextMatch[1], baseUrl).href; } catch { /* skip */ }
      }
      if (prevMatch && !prevPageUrl) {
        try { prevPageUrl = new URL(prevMatch[1], baseUrl).href; } catch { /* skip */ }
      }
    }
  }

  return { nextPageUrl, prevPageUrl };
}

/** Extract the main image URL for the current reader page */
function extractCurrentPageImage(doc: Document, baseUrl: string): string | null {
  for (const selector of PAGINATED_IMAGE_SELECTORS) {
    const el = doc.querySelector<HTMLImageElement | HTMLElement>(selector);
    if (!el) continue;

    const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
    if (!img) continue;

    const descriptors = readImageSourceDescriptors(img)
      .map((descriptor) => ({
        ...descriptor,
        resolved: resolveUrl(descriptor.value, baseUrl),
      }))
      .filter((descriptor) => Boolean(descriptor.resolved));
    const selected = descriptors.find(
      (descriptor) =>
        descriptor.resolved &&
        !isPlaceholderImageUrl(descriptor.resolved) &&
        isLikelyImageResourceUrl(descriptor.resolved)
    );

    if (selected?.resolved) {
      return unwrapProxiedImageUrl(selected.resolved);
    }
  }

  return null;
}

/** 
 * Detect if the page is a paginated reader and extract navigation info.
 * Call this from the adapter or content script to determine if multi-page crawl is needed.
 */
export function detectPaginatedReader(doc: Document, url: string): PaginatedReaderInfo {
  const result: PaginatedReaderInfo = {
    isPaginatedReader: false,
    currentPage: null,
    totalPages: null,
    nextPageUrl: null,
    prevPageUrl: null,
    allPageUrls: [],
    currentImageUrl: null,
  };

  // If the DOM already exposes multiple page images, this is not a paginated reader.
  const multiPageImageCount = doc.querySelectorAll(
    [
      '.page-break img',
      '.reading-content img',
      '.wp-manga-chapter-img',
      '#readerarea img.ts-main-image',
      '.ts-main-image',
      '.chapter-content img',
    ].join(', ')
  ).length;
  if (multiPageImageCount >= 2) {
    return result;
  }

  // Detect paginated reader signals
  const hasPageSelect = !!doc.querySelector(
    'select[name*="page"], select[id*="page"], select.page-select'
  );
  const hasPageNav =
    PAGINATED_NAV_RE.test(doc.body?.textContent || '') &&
    PAGINATED_PAGE_SELECT_RE.test(doc.title || doc.body?.textContent?.slice(0, 500) || '');
  const hasPaginatedClass = !!doc.querySelector(
    '.ts-main-image.curdown, .select-pagination, .chapter-pagination, [class*="paged-reader"]'
  );

  if (!hasPageSelect && !hasPageNav && !hasPaginatedClass) {
    return result;
  }

  result.isPaginatedReader = true;

  // Extract from select (most reliable)
  const fromSelect = extractFromPageSelect(doc, url);
  Object.assign(result, fromSelect);

  // If no allPageUrls from select, try links
  if (result.allPageUrls.length === 0) {
    const fromLinks = extractFromPageLinks(doc, url, url);
    Object.assign(result, fromLinks);
  }

  // Navigation
  const nav = extractPageNavigation(doc, url);
  result.nextPageUrl = result.nextPageUrl || nav.nextPageUrl;
  result.prevPageUrl = result.prevPageUrl || nav.prevPageUrl;

  // Current page image
  result.currentImageUrl = extractCurrentPageImage(doc, url);

  return result;
}

/**
 * Crawl all pages of a paginated chapter and return image URLs.
 * 
 * @param pageInfo - Result from detectPaginatedReader for the first page
 * @param fetchDocument - Function to fetch HTML of remote pages
 * @param readerUrl - URL of the first page (for referrer)
 * @param maxPages - Maximum number of pages to crawl (default 200)
 */
export async function crawlPaginatedChapter(
  pageInfo: PaginatedReaderInfo,
  fetchDocument: (url: string, opts?: { referrer?: string }) => Promise<string>,
  readerUrl: string,
  maxPages = 200
): Promise<string[]> {
  const images: string[] = [];
  const visited = new Set<string>();

  // Strategy 1: We have all page URLs from select element
  if (pageInfo.allPageUrls.length > 0) {
    for (const pageUrl of pageInfo.allPageUrls.slice(0, maxPages)) {
      if (visited.has(pageUrl)) continue;
      visited.add(pageUrl);

      try {
        const html = await fetchDocument(pageUrl, { referrer: readerUrl });
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const imgUrl = extractCurrentPageImage(doc, pageUrl);
        if (imgUrl && isLikelyImageResourceUrl(imgUrl)) images.push(imgUrl);
      } catch {
        // Skip failed pages
      }
    }
    return [...new Set(images)];
  }

  // Strategy 2: Follow next page links (linear crawl)
  // Add current page image first
  if (pageInfo.currentImageUrl) {
    if (isLikelyImageResourceUrl(pageInfo.currentImageUrl)) {
      images.push(pageInfo.currentImageUrl);
    }
    visited.add(readerUrl);
  }

  let currentUrl = pageInfo.nextPageUrl;
  let pagesLeft = maxPages - images.length;

  while (currentUrl && !visited.has(currentUrl) && pagesLeft > 0) {
    visited.add(currentUrl);

    try {
      const html = await fetchDocument(currentUrl, { referrer: readerUrl });
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const imgUrl = extractCurrentPageImage(doc, currentUrl);
      if (imgUrl && isLikelyImageResourceUrl(imgUrl)) images.push(imgUrl);

      const nav = extractPageNavigation(doc, currentUrl);
      currentUrl = nav.nextPageUrl;
      pagesLeft -= 1;
    } catch {
      break;
    }
  }

  return [...new Set(images)];
}
