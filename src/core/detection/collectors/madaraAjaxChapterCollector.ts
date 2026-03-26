/**
 * madaraAjaxChapterCollector.ts
 *
 * Collecteur spécifique aux sites Madara (WP-Manga + Madara Theme).
 *
 * Sur la page manga listing (ex: /manga/UUID), Madara charge les chapitres
 * via un appel AJAX POST à /wp-admin/admin-ajax.php avec l'action
 * "manga_get_chapters". Le HTML initial de la page NE contient PAS les chapitres.
 *
 * Ce module extrait le manga_id depuis le DOM et le fournit pour
 * que le content script puisse effectuer l'appel AJAX dans le contexte de la page.
 */

export interface MadaraPageInfo {
  /** WordPress post ID of the manga */
  mangaId: string | null;
  /** Admin AJAX URL (usually /wp-admin/admin-ajax.php) */
  ajaxUrl: string | null;
  /** Nonce for the AJAX request */
  nonce: string | null;
  /** Whether this looks like a Madara manga listing page */
  isMangaListingPage: boolean;
  /** Whether this looks like a Madara chapter reader page */
  isChapterReaderPage: boolean;
}

/**
 * Extracts Madara-specific page information from the live DOM.
 * Safe to call from content script context.
 */
export function extractMadaraPageInfo(document: Document, url: string): MadaraPageInfo {
  const result: MadaraPageInfo = {
    mangaId: null,
    ajaxUrl: null,
    nonce: null,
    isMangaListingPage: false,
    isChapterReaderPage: false,
  };

  // Detect manga listing page vs chapter reader page
  const pathname = (() => {
    try { return new URL(url).pathname; } catch { return url; }
  })();

  // Listing page: /manga/slug/ or /manhwa/slug/ etc.
  result.isMangaListingPage = /^\/(manga|manhwa|manhua|comic|webtoon|scan)\/[^/]+\/?$/i.test(pathname);
  // Chapter page: /manga/slug/chapter-N/ etc.
  result.isChapterReaderPage = /\/(chapter|chapitre|episode|ch|vol|partie|chap)[-_]?\d/i.test(pathname) ||
    /\/(read|viewer)\//i.test(pathname);

  // 1. Try to get manga_id from DOM attribute (most reliable)
  const mangaIdEl =
    document.querySelector<HTMLElement>('[data-id]') ||
    document.querySelector<HTMLElement>('.wp-manga[data-id]') ||
    document.querySelector<HTMLElement>('#manga-chapters-holder[data-id]') ||
    document.querySelector<HTMLElement>('.manga-info-top[data-id]') ||
    document.querySelector<HTMLElement>('[data-manga-id]') ||
    document.querySelector<HTMLElement>('[data-post-id]');

  if (mangaIdEl) {
    result.mangaId =
      mangaIdEl.getAttribute('data-id') ||
      mangaIdEl.getAttribute('data-manga-id') ||
      mangaIdEl.getAttribute('data-post-id');
  }

  // 2. Try to extract from inline scripts (wp_manga variables)
  if (!result.mangaId) {
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script:not([src])'));
    for (const script of scripts) {
      const text = script.textContent || '';

      // Pattern: var manga = { id: "12345" }
      const idMatch = text.match(/['"](manga[_-]?id|post[_-]?id|seriesId|bookId)['"]\s*[=:]\s*['"]?(\d+)['"]?/) ||
        text.match(/\.id\s*=\s*['"]?(\d+)['"]?/) ||
        text.match(/manga_id\s*[=:]\s*['"]?(\d+)['"]?/);
      if (idMatch) {
        result.mangaId = idMatch[idMatch.length - 1];
      }

      // Pattern: wp_manga_chapter_img_sitemap = { manga_id: "123" }
      const wpMangaMatch = text.match(/wp_manga_chapter_img_sitemap\s*=\s*\{[^}]*(?:manga_id|post_id)\s*:\s*['"]?(\d+)['"]?/);
      if (wpMangaMatch) {
        result.mangaId = wpMangaMatch[1];
      }

      // Pattern: ajaxurl = "/wp-admin/admin-ajax.php";
      const ajaxMatch = text.match(/ajaxurl\s*[=:]\s*['"]([^'"]+)['"]/);
      if (ajaxMatch) {
        result.ajaxUrl = ajaxMatch[1];
      }

      // Pattern: manga_chapter_nonce or _nonce
      const nonceMatch = text.match(/(?:manga_chapter_nonce|manga_nonce|wpmanga_nonce)\s*[=:]\s*['"]([a-f0-9]+)['"]/i);
      if (nonceMatch) {
        result.nonce = nonceMatch[1];
      }

      if (result.mangaId) break;
    }
  }

  // 3. Try URL-based extraction (some sites put manga ID in URL)
  if (!result.mangaId) {
    const uuidOrIdMatch = pathname.match(/\/manga\/([a-f0-9-]{8,})\/?$/i);
    // UUID-style IDs are not WP post IDs; skip
    // But numeric IDs might work:
    const numericMatch = pathname.match(/\/manga\/(\d{1,10})\/?$/i);
    if (numericMatch) {
      result.mangaId = numericMatch[1];
    }
    void uuidOrIdMatch; // UUID format is not a WP post ID
  }

  // 4. Default admin AJAX URL if not found
  if (!result.ajaxUrl) {
    try {
      const origin = new URL(url).origin;
      result.ajaxUrl = `${origin}/wp-admin/admin-ajax.php`;
    } catch {
      result.ajaxUrl = '/wp-admin/admin-ajax.php';
    }
  }

  return result;
}

export interface MadaraChapterEntry {
  url: string;
  label: string;
  chapterNumber: number | null;
}

/**
 * Parse the HTML response from the Madara AJAX chapter list endpoint.
 * Returns an array of chapter entries sorted by chapter number descending.
 */
export function parseMadaraAjaxChapterHtml(html: string, baseUrl: string): MadaraChapterEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>(
    'li.wp-manga-chapter a, .wp-manga-chapter a, .chapter-li a, li a[href]'
  ));

  const entries: MadaraChapterEntry[] = [];
  const seen = new Set<string>();

  for (const a of anchors) {
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript')) continue;

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(raw, baseUrl).href;
    } catch {
      continue;
    }

    if (seen.has(resolvedUrl)) continue;
    seen.add(resolvedUrl);

    const label = (a.textContent || '').trim().replace(/\s+/g, ' ') || raw;
    const numMatch = label.match(/(?:chapter|chapitre|ch\.?|ep\.?)\s*[\s-._]*([\d.]+)/i) ||
      resolvedUrl.match(/(?:chapter|chapitre|ch|ep)[-_.]?([\d]+(?:[._-][\d]+)?)/i);
    const chapterNumber = numMatch ? parseFloat(numMatch[1].replace(/[._-]/g, '.')) : null;

    entries.push({ url: resolvedUrl, label, chapterNumber });
  }

  // Sort by chapter number descending (latest first, matching Madara default)
  return entries.sort((a, b) => {
    if (a.chapterNumber !== null && b.chapterNumber !== null) {
      return b.chapterNumber - a.chapterNumber;
    }
    return 0;
  });
}
