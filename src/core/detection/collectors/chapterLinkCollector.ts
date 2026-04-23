import type { ChapterLinkCandidate, ChapterRelation } from '@shared/types';
import { compactWhitespace, stripChapterLabelMetadata } from '@shared/utils/strings';
import { resolveUrl, sameHost } from '@shared/utils/url';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';

/**
 * Primary keyword regex to detect chapter links.
 * Expanded from manga patterns to include light novel / web novel vocabulary
 * (inspired by NetsuShelf's DefaultParser).
 */
const CHAPTER_HINT_RE =
  /(?:^|\b)(?:chapter|chapitre|chap|ch\.?|episode|ep\.?|part|vol\.?|tome|book|arc|prologue|epilogue|interlude|bonus|extra|afterword|capitulo|capitolo|scan|회|话|話)\b/i;

const LISTING_HINT_RE =
  /(all chapters|chapter list|chapters|volumes|table of contents|toc|manga info|liste des chapitres|chapters list|all episodes|novel index|fiction chapters|story chapters|arc list|book index)/i;

const LISTING_PATH_RE =
  /(?:all-chapters|chapter-list|chapters|volumes|manga-info|table-of-contents|toc|chapters-list|manga\/[^/]+\/?$|novel\/[^/]+\/?$|fiction\/[^/]+\/?$|story\/[^/]+\/?$)(?:$|[/?#_-])/i;

const PREVIOUS_HINT_RE = /(prev|previous|older|back|precedent|pr[eé]c[eé]dent|<<|‹|←)/i;
const NEXT_HINT_RE = /(next|newer|forward|suivant|>>|›|→)/i;
const BAD_LINK_RE = /(?:login|signup|register|discord|facebook|twitter|instagram|privacy|terms|about|contact|dmca|patreon|donate|kofi|support)/i;
const NON_CHAPTER_NAV_RE = /(?:^|\b)(?:accueil|home|homepage|index|catalogue|browse|discover|search|recherche)(?:\b|$)/i;
const CHAPTER_PATH_RE = /(chapter|chapitre|episode|ep|capitulo|capitolo|scan|fiction|novel|story)/i;
const PAGINATION_PATH_RE = /(?:^|\/)(?:page|paged|pagination|pg)\/?\d+(?:$|[/?#])/i;
const NAV_SECTION_RE = /(header|footer|nav|menu|breadcrumb|account|profile|social|share|comment)/i;

function relationFromAnchor(anchor: HTMLAnchorElement, label: string): ChapterRelation {
  const rel = (anchor.getAttribute('rel') || '').toLowerCase();
  const href = anchor.href || '';
  const classes = `${anchor.className || ''} ${anchor.id || ''}`.toLowerCase();
  const listingHints = `${label} ${classes}`.trim();
  const navigationHints = `${label} ${href} ${classes}`.trim();
  const listingByPath = (() => {
    try {
      return LISTING_PATH_RE.test(new URL(href).pathname);
    } catch {
      return LISTING_PATH_RE.test(href);
    }
  })();

  if (rel.includes('canonical') || rel.includes('alternate')) return 'candidate';
  if (rel.includes('prev')) return 'previous';
  if (rel.includes('next')) return 'next';
  if (LISTING_HINT_RE.test(listingHints) || listingByPath) return 'listing';
  if (PREVIOUS_HINT_RE.test(navigationHints)) return 'previous';
  if (NEXT_HINT_RE.test(navigationHints)) return 'next';
  return 'candidate';
}

function computeScore(
  label: string,
  currentUrl: string,
  href: string,
  relation: ChapterRelation,
  chapterNumber: number | null,
  containerSignature: string
): number {
  let score = 0;
  if (sameHost(currentUrl, href)) score += 20;
  
  if (BAD_LINK_RE.test(label) || BAD_LINK_RE.test(href)) {
    return -100;
  }
  if (relation === 'candidate' && chapterNumber === null && NON_CHAPTER_NAV_RE.test(label)) {
    return -100;
  }
  if (PAGINATION_PATH_RE.test(href) && !CHAPTER_HINT_RE.test(label) && chapterNumber === null) {
    return -100;
  }

  if (CHAPTER_HINT_RE.test(label) || CHAPTER_HINT_RE.test(href)) score += 30;
  if (CHAPTER_PATH_RE.test(href)) score += 18;
  if (relation === 'listing') score += 18;
  if (relation === 'current') score += 14;
  if (relation === 'next' || relation === 'previous') score += 14;
  if (label.length >= 2 && label.length <= 60) score += 6;
  if (chapterNumber !== null) score += 15;
  if (NAV_SECTION_RE.test(containerSignature) && relation === 'candidate') score -= 18;
  if (NAV_SECTION_RE.test(containerSignature) && !CHAPTER_HINT_RE.test(label) && relation === 'candidate') score -= 42;
  if (NAV_SECTION_RE.test(label) && chapterNumber === null) score -= 12;

  try {
    const currentPath = new URL(currentUrl).pathname.split('/').filter(Boolean);
    const hrefPath = new URL(href).pathname.split('/').filter(Boolean);
    const sharedPrefix = currentPath.findIndex((segment, index) => hrefPath[index] !== segment);
    const prefixLength = sharedPrefix === -1 ? Math.min(currentPath.length, hrefPath.length) : sharedPrefix;
    if (prefixLength >= 1) score += 8;
    if (prefixLength >= 2) score += 8;

    const currentHasChapterPath = currentPath.some((segment) => CHAPTER_PATH_RE.test(segment));
    const hrefHasChapterPath = hrefPath.some((segment) => CHAPTER_PATH_RE.test(segment));
    if (currentHasChapterPath && hrefHasChapterPath) {
      score += 12;
    }
  } catch {
    // Ignore URL parse errors
  }

  return score;
}

function buildContainerSignature(anchor: Element): string {
  const segments: string[] = [];
  let current: Element | null = anchor.parentElement;
  let depth = 0;

  while (current && depth < 3) {
    const className = compactWhitespace(current.className || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .join('.');
    segments.push(`${current.tagName.toLowerCase()}:${className}`);
    current = current.parentElement;
    depth += 1;
  }

  return segments.join('>');
}

function isLikelyHiddenElement(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  if (element instanceof HTMLElement) {
    const style = window.getComputedStyle?.(element);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
      return true;
    }
  }
  return false;
}

function extractChapterLabel(element: Element): string {
  const prioritizedNodes = Array.from(
    element.querySelectorAll(
      [
        '[data-chapter-title]',
        '[class*="chapter-title"]',
        '[class*="chapter_name"]',
        '[class*="chapter-name"]',
        '[class*="episode-title"]',
        '[class*="title"]',
        'h1',
        'h2',
        'h3',
        'h4',
        'strong',
      ].join(', ')
    )
  );

  for (const node of prioritizedNodes) {
    const text = stripChapterLabelMetadata(compactWhitespace(node.textContent || ''));
    if (CHAPTER_HINT_RE.test(text) || text.length <= 80) {
      return text;
    }
  }

  return stripChapterLabelMetadata(
    compactWhitespace(
      element.textContent ||
      element.getAttribute('title') ||
      element.getAttribute('aria-label') ||
      ''
    )
  );
}

function relationFromHints(input: string): Exclude<ChapterRelation, 'current'> {
  if (PREVIOUS_HINT_RE.test(input)) return 'previous';
  if (NEXT_HINT_RE.test(input)) return 'next';
  if (LISTING_HINT_RE.test(input) || LISTING_PATH_RE.test(input)) return 'listing';
  return 'candidate';
}

function extractOptionUrl(option: HTMLOptionElement, baseUrl: string): string | null {
  const rawValue =
    option.getAttribute('value') ||
    option.getAttribute('data-href') ||
    option.getAttribute('data-url') ||
    '';
  if (!rawValue || rawValue.startsWith('#')) return null;
  return resolveUrl(rawValue, baseUrl);
}

function collectScriptChapterLinks(
  root: ParentNode,
  baseUrl: string,
  currentUrl: string
): ChapterLinkCandidate[] {
  const scripts = Array.from(root.querySelectorAll<HTMLScriptElement>('script:not([src])'));
  const results: ChapterLinkCandidate[] = [];
  const seen = new Set<string>();
  const urlRe = /["']((?:https?:\/\/|\/)[^"'\\\s<>]+)["']/gi;

  scripts.forEach((script, scriptIndex) => {
    const text = script.textContent || '';
    if (!CHAPTER_HINT_RE.test(text) && !LISTING_HINT_RE.test(text)) {
      return;
    }

    for (const match of text.matchAll(urlRe)) {
      const rawUrl = (match[1] || '').replace(/\\\//g, '/');
      const resolvedUrl = resolveUrl(rawUrl, baseUrl);
      if (!resolvedUrl || !sameHost(currentUrl, resolvedUrl)) {
        continue;
      }

      const canonicalUrl = resolvedUrl.split('#')[0];
      if (seen.has(canonicalUrl)) {
        continue;
      }
      seen.add(canonicalUrl);

      const contextStart = Math.max(0, (match.index || 0) - 96);
      const contextEnd = Math.min(text.length, (match.index || 0) + rawUrl.length + 96);
      const context = compactWhitespace(text.slice(contextStart, contextEnd));
      const hasChapterContext =
        CHAPTER_HINT_RE.test(context) ||
        LISTING_HINT_RE.test(context) ||
        /\b(chapters?|chapterNumber|episodeNumber|releaseDate|views|uploadedAt|number)\b/i.test(context);
      const relation = relationFromHints(`${context} ${resolvedUrl}`);
      const identity = parseChapterIdentity(context, resolvedUrl);
      const urlLooksChapterLike = CHAPTER_PATH_RE.test(resolvedUrl);
      if (!urlLooksChapterLike && !hasChapterContext && identity.chapterNumber === null) {
        continue;
      }
      const score = computeScore(
        identity.label,
        currentUrl,
        resolvedUrl,
        relation,
        identity.chapterNumber,
        'script:inline-json'
      ) + 16;
      if (score < 12) {
        continue;
      }

      results.push({
        id: `chapter-script-link-${scriptIndex}-${results.length}`,
        url: resolvedUrl,
        canonicalUrl,
        label: identity.label,
        relation,
        score,
        chapterNumber: identity.chapterNumber,
        volumeNumber: identity.volumeNumber,
        containerSignature: 'script:inline-json',
        diagnostics: [],
      });
    }
  });

  return results;
}

export function collectChapterLinks(
  root: ParentNode,
  baseUrl: string,
  currentUrl: string
): ChapterLinkCandidate[] {
  const anchors = [...root.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const dataHrefElements = [...root.querySelectorAll<HTMLElement>('[data-href], [data-url], [data-next], [data-prev]')];
  const relationLinks = [...root.querySelectorAll<HTMLLinkElement>('link[rel][href]')];
  const chapterOptions = [
    ...root.querySelectorAll<HTMLOptionElement>('select option[value], select option[data-href], select option[data-url]'),
  ];
  const results: ChapterLinkCandidate[] = [];

  anchors.forEach((anchor, index) => {
    if (isLikelyHiddenElement(anchor)) return;
    const resolvedUrl = resolveUrl(anchor.getAttribute('href') || '', baseUrl);
    if (!resolvedUrl) return;

    const label = extractChapterLabel(anchor);
    if (!label && !CHAPTER_HINT_RE.test(resolvedUrl) && !LISTING_HINT_RE.test(resolvedUrl)) {
      return;
    }

    const relation = relationFromAnchor(anchor, label);
    const identity = parseChapterIdentity(label, resolvedUrl);
    const containerSignature = buildContainerSignature(anchor);
    if (relation === 'candidate' && NAV_SECTION_RE.test(containerSignature) && !CHAPTER_HINT_RE.test(label)) {
      return;
    }
    const score = computeScore(
      identity.label,
      currentUrl,
      resolvedUrl,
      relation,
      identity.chapterNumber,
      containerSignature
    );
    if (score < 8) return;

    results.push({
      id: `chapter-link-${index}`,
      url: resolvedUrl,
      canonicalUrl: resolvedUrl.split('#')[0],
      label: identity.label,
      relation,
      score,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature,
      diagnostics: [],
    });
  });

  dataHrefElements.forEach((element, index) => {
    if (isLikelyHiddenElement(element)) return;
    const rawHref =
      element.getAttribute('data-href') ||
      element.getAttribute('data-url') ||
      element.getAttribute('data-next') ||
      element.getAttribute('data-prev') ||
      '';
    const resolvedUrl = resolveUrl(rawHref, baseUrl);
    if (!resolvedUrl) return;

    const label = extractChapterLabel(element);
    if (!label && !CHAPTER_HINT_RE.test(resolvedUrl) && !CHAPTER_PATH_RE.test(resolvedUrl)) {
      return;
    }

    const relation =
      element.hasAttribute('data-next')
        ? 'next'
        : element.hasAttribute('data-prev')
          ? 'previous'
          : CHAPTER_HINT_RE.test(label) || CHAPTER_PATH_RE.test(resolvedUrl)
            ? 'candidate'
            : 'listing';
    const identity = parseChapterIdentity(label, resolvedUrl);
    const containerSignature = buildContainerSignature(element);
    if (relation === 'candidate' && NAV_SECTION_RE.test(containerSignature) && !CHAPTER_HINT_RE.test(label)) {
      return;
    }
    const score =
      computeScore(
        identity.label,
        currentUrl,
        resolvedUrl,
        relation,
        identity.chapterNumber,
        containerSignature
      ) + 8;
    if (score < 8) return;

    results.push({
      id: `chapter-data-link-${index}`,
      url: resolvedUrl,
      canonicalUrl: resolvedUrl.split('#')[0],
      label: identity.label,
      relation,
      score,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature,
      diagnostics: [],
    });
  });

  relationLinks.forEach((link, index) => {
    const resolvedUrl = resolveUrl(link.getAttribute('href') || '', baseUrl);
    if (!resolvedUrl) return;

    const label = compactWhitespace(
      `${link.getAttribute('title') || ''} ${link.getAttribute('rel') || ''}`.trim()
    );
    const relation = relationFromHints(`${label} ${resolvedUrl} ${link.getAttribute('rel') || ''}`);
    if (relation !== 'previous' && relation !== 'next' && relation !== 'listing') {
      return;
    }

    const identity = parseChapterIdentity(label, resolvedUrl);
    const score =
      computeScore(
        identity.label,
        currentUrl,
        resolvedUrl,
        relation,
        identity.chapterNumber,
        'head:link-rel'
      ) + 14;
    if (score < 8) return;

    results.push({
      id: `chapter-rel-link-${index}`,
      url: resolvedUrl,
      canonicalUrl: resolvedUrl.split('#')[0],
      label: identity.label || relation,
      relation,
      score,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature: 'head:link-rel',
      diagnostics: [],
    });
  });

  chapterOptions.forEach((option, index) => {
    if (isLikelyHiddenElement(option)) return;
    const resolvedUrl = extractOptionUrl(option, baseUrl);
    if (!resolvedUrl) return;

    const select = option.closest('select');
    const selectHint = compactWhitespace(
      `${select?.getAttribute('name') || ''} ${select?.id || ''} ${select?.className || ''}`
    );
    const label = stripChapterLabelMetadata(compactWhitespace(option.textContent || option.label || ''));
    if (!label && !CHAPTER_HINT_RE.test(resolvedUrl) && !CHAPTER_PATH_RE.test(resolvedUrl)) {
      return;
    }

    const relation = option.selected ? 'current' : relationFromHints(`${label} ${selectHint} ${resolvedUrl}`);
    const identity = parseChapterIdentity(label || selectHint, resolvedUrl);
    const containerSignature = buildContainerSignature(option);
    const score =
      computeScore(
        identity.label,
        currentUrl,
        resolvedUrl,
        relation,
        identity.chapterNumber,
        containerSignature
      ) + (CHAPTER_HINT_RE.test(selectHint) ? 20 : 10);
    if (score < 12) return;

    results.push({
      id: `chapter-select-option-${index}`,
      url: resolvedUrl,
      canonicalUrl: resolvedUrl.split('#')[0],
      label: identity.label,
      relation,
      score,
      chapterNumber: identity.chapterNumber,
      volumeNumber: identity.volumeNumber,
      containerSignature,
      diagnostics: [],
    });
  });

  return results.concat(collectScriptChapterLinks(root, baseUrl, currentUrl));
}
