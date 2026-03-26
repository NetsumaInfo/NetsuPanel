/**
 * lightNovelAdapter.ts
 *
 * Adaptateur pour les sites de light novels et web novels.
 * Inspiré de la logique NetsuShelf (WebToEpub fork) : hyperlinksToChapterList,
 * ensurePotentialChapterOneIsIncluded, et parsing de numéros de chapitres/volumes.
 *
 * Sites couverts :
 *  - Royal Road (royalroad.com)
 *  - WuxiaWorld (wuxiaworld.com, wuxiaworld.site)
 *  - Webnovel (webnovel.com)
 *  - Baka-Tsuki (baka-tsuki.org)
 *  - ScribbleHub (scribblehub.com)
 *  - NovelUpdates (novelupdates.com)
 *  - LightNovelWorld (lightnovelworld.com)
 *  - FreeWebNovel (freewebnovel.com)
 *  - BoxNovel (boxnovel.com)
 *  - NovelBin (novelbin.com, novelbin.net)
 *  - MTLNovel (mtlnovel.com)
 *  - Creativenovels (creativenovels.com)
 *  - KissNovel / light-novel-world variants
 *  - Et générique pour tout site "roman en ligne / chapters"
 */

import type { ChapterLinkCandidate, MangaScanResult } from '@shared/types';
import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';
import { resolveUrl, sameHost } from '@shared/utils/url';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import {
  buildMangaLinkMap,
  ensurePotentialChapterOneIsIncluded,
} from '@core/detection/pipeline/chapterPipeline';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import type { ScanAdapterInput, SiteAdapter } from './types';

// ────────────────────────────────────────────────────────────
// Domain matching — covers the most popular light novel sites
// ────────────────────────────────────────────────────────────

const LIGHT_NOVEL_DOMAINS = [
  'royalroad.com',
  'wuxiaworld.com',
  'wuxiaworld.site',
  'wuxia.blog',
  'webnovel.com',
  'baka-tsuki.org',
  'scribblehub.com',
  'novelupdates.com',
  'lightnovelworld.com',
  'freewebnovel.com',
  'boxnovel.com',
  'novelbin.com',
  'novelbin.net',
  'mtlnovel.com',
  'creativenovels.com',
  'novelhall.com',
  'novelup.plus',
  'volarenovels.com',
  'wattpad.com',
  'archiveofourown.org',
  'fanfiction.net',
  'shalvation.com',
  'reaperscans.com',
  'readlightnovel.me',
  'readlightnovel.org',
  'novelonlinefull.com',
  'lightnovel.me',
  'lightnovelstranslations.com',
  'isekaipalace.com',
  'zetro.org',
  'novelfull.com',
  'novelhulk.com',
  'comrademao.com',
  'gravitytales.com',
  'lnmtl.com',
  'skythewood.blogspot.com',
  'thetranslationsoftheuncanny.com',
  // Nettushelf's own site for novels (if applicable)
  'netsuinfo.com',
];

// Heuristic patterns to detect if a page is likely a web novel / light novel site
const LN_PATH_RE = /\/(?:novel|fiction|story|book|light-novel|ln)(?:\/|$)|\/(?:chapter|chapitre|episode|ep)(?:[-_/]|\b)|\/read(?:\/|$)/i;
const LN_READER_PATH_RE = /\/(?:chapter|chapitre|episode|ep)(?:[-_/]?\d|\/)|\/read(?:\/|$)|\/viewer(?:\/|$)/i;

function matchesLightNovel(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);

    // Explicit domain matching
    if (LIGHT_NOVEL_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return true;
    }

    // Heuristic: path contains light-novel-like segments
    if (LN_PATH_RE.test(pathname)) {
      return true;
    }
  } catch {
    // ignore parse errors
  }
  return false;
}

function shouldInferChapterOne(page: ScanAdapterInput['page'], navCandidates: ChapterLinkCandidate[]): boolean {
  if (navCandidates.some((candidate) => candidate.relation === 'previous' || candidate.relation === 'next')) {
    return true;
  }

  if (LN_READER_PATH_RE.test(page.pathname)) {
    return true;
  }

  const urlIdentity = parseChapterIdentity('', page.url);
  const titleIdentity = parseChapterIdentity(page.title, page.url);
  return urlIdentity.chapterNumber !== null || titleIdentity.chapterNumber !== null;
}

// ────────────────────────────────────────────────────────────
// Chapter link extraction — inspired by NetsuShelf's hyperlinksToChapterList
// ────────────────────────────────────────────────────────────

/**
 * Known CSS selectors for chapter list containers on web novel sites.
 * NetsuShelf approach: try specific containers first, fall back to generic anchor scan.
 */
const CHAPTER_CONTAINER_SELECTORS = [
  // Royal Road
  '.chapter-row a',
  '.chapter-list a',
  // ScribbleHub
  '.toc_w .chapter-chs a',
  '.chapter_list a',
  // WuxiaWorld
  '.chapter-item a',
  '.chapter-listing a',
  // Generic LN patterns
  '.toc a',
  '.table-of-contents a',
  '.table_of_contents a',
  '.chapters a',
  '.list-chapters a',
  '.story-chapters a',
  '#chapters a',
  '#chapter-list a',
  '#toc a',
  '.novel-chapters a',
  '.fiction-chapters a',
  '.book-chapters a',
  // Webnovel
  '.j_chapterItems a',
  '.content-list a',
  // BoxNovel / FreeWebNovel / NovelBin
  '.listing-chapters_wrap a',
  '.listing-chapters li a',
  '.wp-manga-chapter a',
  // FanFiction / AO3
  '#chapters a',
  '#story_chapter_list a',
  '.chapter-drop-menu option',
  // Wattpad
  '.table-of-contents__story a',
];

/**
 * Selectors for "bad" links that should be excluded from the chapter list.
 * NetsuShelf calls these "non-chapter links".
 */
const BAD_LINK_RE = /(?:login|signin|signup|register|discord|facebook|twitter|instagram|privacy|terms|about|contact|dmca|patreon|donate|kofi|support|report|delete|edit|settings|profile)/i;

/**
 * Chapter hint patterns for web novel links.
 * Expanded from NetsuShelf's list to include novel-specific patterns.
 */
const LN_CHAPTER_HINT_RE =
  /(?:^|\b)(?:chapter|chapitre|chap|ch\.?|episode|ep\.?|part|vol\.?|tome|book|arc|prologue|epilogue|interlude|bonus|extra|afterword|foreword)(?:\s|[-_.]|$)/i;

/**
 * Extract chapter links from known LN container selectors.
 * This corresponds to NetsuShelf's hyperlinksToChapterList with specific containers.
 */
function collectLightNovelChapterCandidates(
  document: ParentNode,
  currentUrl: string
): ChapterLinkCandidate[] {
  const results: ChapterLinkCandidate[] = [];
  const seen = new Set<string>();

  // Try each container selector
  for (const selector of CHAPTER_CONTAINER_SELECTORS) {
    const elements = Array.from(
      (document as Document).querySelectorAll<HTMLAnchorElement | HTMLOptionElement>(selector)
    );

    if (elements.length === 0) continue;

    for (let index = 0; index < elements.length; index++) {
      const el = elements[index];

      let href = '';
      let rawLabel = '';

      if (el instanceof HTMLOptionElement) {
        href = el.value || el.getAttribute('data-href') || '';
        rawLabel = el.textContent || el.label || '';
      } else if (el instanceof HTMLAnchorElement) {
        href = el.getAttribute('href') || '';
        rawLabel = el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '';
      } else {
        continue;
      }

      const resolvedUrl = resolveUrl(href, currentUrl);
      if (!resolvedUrl) continue;

      // NetsuShelf: ignore duplicate links (normalizeUrlForCompare style)
      const canonicalUrl = resolvedUrl.split('#')[0];
      if (seen.has(canonicalUrl)) continue;

      // Ignore bad links (login, social media, etc.)
      const label = stripChapterLabelMetadata(compactWhitespace(rawLabel));
      if (BAD_LINK_RE.test(label) || BAD_LINK_RE.test(resolvedUrl)) continue;

      // Must be same host as current page
      if (!sameHost(currentUrl, resolvedUrl)) continue;

      seen.add(canonicalUrl);

      const identity = parseChapterIdentity(label, resolvedUrl);

      // Compute score — boosted if we found a chapter-specific selector
      const hasChapterHint = LN_CHAPTER_HINT_RE.test(label) || LN_CHAPTER_HINT_RE.test(resolvedUrl);
      const baseScore = 70 + (hasChapterHint ? 20 : 0) + (identity.chapterNumber !== null ? 15 : 0);

      results.push({
        id: `ln-chapter-container-${index}`,
        url: resolvedUrl,
        canonicalUrl,
        label: identity.label || label || `Chapter ${index + 1}`,
        relation: 'candidate',
        score: baseScore,
        chapterNumber: identity.chapterNumber,
        volumeNumber: identity.volumeNumber,
        containerSignature: `ln:${selector.split(' ')[0]}`,
        diagnostics: [],
      });
    }

    // If we found results from a container, prioritize this source
    if (results.length >= 2) {
      break;
    }
  }

  return results;
}

/**
 * Extract previous/next chapter navigation links.
 * Critical for linear reading of web novels.
 */
function collectLightNovelNavigation(
  document: ParentNode,
  currentUrl: string
): ChapterLinkCandidate[] {
  const results: ChapterLinkCandidate[] = [];

  const PREV_SELECTORS = [
    'a.prev_page', 'a.prev-chapter', 'a[rel="prev"]',
    '.nav-previous a', '.chapter-nav .prev a',
    '.chapter-navigation .prev a', '.btn-prev a',
    'a[title*="previous" i]', 'a[aria-label*="previous" i]',
    'a[title*="précédent" i]', 'a[title*="prev" i]',
    '.chapter-prev a', '#prev-chapter', '#prevChapter',
    'a.prev', 'a.previous',
  ];

  const NEXT_SELECTORS = [
    'a.next_page', 'a.next-chapter', 'a[rel="next"]',
    '.nav-next a', '.chapter-nav .next a',
    '.chapter-navigation .next a', '.btn-next a',
    'a[title*="next" i]', 'a[aria-label*="next" i]',
    'a[title*="suivant" i]', 'a[title*="next" i]',
    '.chapter-next a', '#next-chapter', '#nextChapter',
    'a.next',
  ];

  const findNav = (selectors: string[]): HTMLAnchorElement | null => {
    for (const sel of selectors) {
      const el = (document as Document).querySelector<HTMLAnchorElement>(sel);
      if (el?.href) return el;
    }
    return null;
  };

  // Also check <link rel="prev/next"> in <head>
  const relPrev = (document as Document).querySelector<HTMLLinkElement>('link[rel="prev"]');
  const relNext = (document as Document).querySelector<HTMLLinkElement>('link[rel="next"]');

  const prevEl = findNav(PREV_SELECTORS);
  const nextEl = findNav(NEXT_SELECTORS);

  const addNav = (anchor: HTMLAnchorElement | HTMLLinkElement | null, relation: 'previous' | 'next') => {
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    const resolved = resolveUrl(href, currentUrl);
    if (!resolved || !sameHost(currentUrl, resolved)) return;

    const label = stripChapterLabelMetadata(compactWhitespace(
      (anchor instanceof HTMLAnchorElement ? anchor.textContent : '') ||
      anchor.getAttribute('title') ||
      anchor.getAttribute('aria-label') ||
      relation
    ));
    const identity = parseChapterIdentity(label, resolved);

    results.push({
      id: `ln-nav-${relation}`,
      url: resolved,
      canonicalUrl: resolved.split('#')[0],
      label: identity.label || label || relation,
      relation,
      score: 95,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature: 'ln:chapter-nav',
      diagnostics: [],
    });
  };

  addNav(relPrev, 'previous');
  addNav(relNext, 'next');
  addNav(prevEl, 'previous');
  addNav(nextEl, 'next');

  return results;
}

/**
 * Try to detect a Table of Contents / series index page link.
 */
function collectLightNovelListingLink(
  document: ParentNode,
  currentUrl: string
): ChapterLinkCandidate[] {
  const TOC_SELECTORS = [
    'a[href*="/table-of-contents"]',
    'a[href*="/toc"]',
    'a[href*="/chapters"]',
    'a[href*="/index"]',
    'a.toc-link',
    'a.chapter-list-link',
    'a[title*="table of contents" i]',
    'a[title*="chapter list" i]',
    'a[aria-label*="table of contents" i]',
    // Royal Road
    '.fiction-nav a[href*="/fiction/"]',
    // WuxiaWorld
    'a[href*="/novel/"][href*="/"]',
  ];

  for (const sel of TOC_SELECTORS) {
    const el = (document as Document).querySelector<HTMLAnchorElement>(sel);
    if (!el) continue;

    const href = el.getAttribute('href') || '';
    const resolved = resolveUrl(href, currentUrl);
    if (!resolved || !sameHost(currentUrl, resolved)) continue;

    const label = stripChapterLabelMetadata(compactWhitespace(
      el.textContent || el.getAttribute('title') || 'Table of Contents'
    ));

    return [{
      id: 'ln-listing',
      url: resolved,
      canonicalUrl: resolved.split('#')[0],
      label: label || 'Table of Contents',
      relation: 'listing',
      score: 80,
      chapterNumber: null,
      volumeNumber: null,
      containerSignature: 'ln:toc-link',
      diagnostics: [],
    }];
  }

  return [];
}

// ────────────────────────────────────────────────────────────
// Main scan function
// ────────────────────────────────────────────────────────────

function scanLightNovel(input: ScanAdapterInput): MangaScanResult {
  const { document, page, imageCandidates } = input;

  // 1. Collect chapter links from known containers (NetsuShelf-inspired)
  const containerCandidates = collectLightNovelChapterCandidates(document, page.url);

  // 2. Collect navigation (prev/next chapter)
  const navCandidates = collectLightNovelNavigation(document, page.url);

  // 3. Collect TOC/listing link
  const listingCandidates = collectLightNovelListingLink(document, page.url);

  // 4. Fall back to generic chapter link collector (handles scripts, data-href, etc.)
  const genericCandidates =
    containerCandidates.length < 2
      ? collectChapterLinks(document, page.url, page.url)
      : [];

  const allCandidates = [
    ...containerCandidates,
    ...navCandidates,
    ...listingCandidates,
    ...genericCandidates,
  ];

  // 5. Build manga link map with NetsuShelf's ensurePotentialChapterOneIsIncluded logic
  const links = buildMangaLinkMap(page, allCandidates);

  // 6. Apply NetsuShelf's "ensure chapter one is included" heuristic
  const chaptersWithOne = shouldInferChapterOne(page, navCandidates)
    ? ensurePotentialChapterOneIsIncluded(page, links.chapters)
    : links.chapters;

  // 7. For light novels, images are less important — use general image collection
  // but still pass through manga pipeline so adapters chain correctly
  const currentPages = buildImageCollection(imageCandidates, 'manga');

  const isLikelyTocPage = (document as Document).querySelector(
    CHAPTER_CONTAINER_SELECTORS.slice(0, 8).join(', ')
  ) !== null;

  return {
    adapterId: 'light-novel',
    currentPages,
    chapters: chaptersWithOne,
    navigation: links.navigation,
    diagnostics: [
      ...links.diagnostics,
      {
        code: 'light-novel-adapter',
        message: isLikelyTocPage
          ? `Page TOC détectée: ${chaptersWithOne.length} chapitres trouvés.`
          : `Adaptateur Light Novel: ${chaptersWithOne.length} chapitres, nav: ${navCandidates.length > 0 ? 'ok' : 'non détecté'}.`,
        level: 'info',
      },
    ],
  };
}

export const lightNovelAdapter: SiteAdapter = {
  id: 'light-novel',
  matches: matchesLightNovel,
  scan: scanLightNovel,
};
