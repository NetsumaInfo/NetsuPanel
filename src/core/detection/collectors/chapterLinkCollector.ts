import type { ChapterLinkCandidate, ChapterRelation } from '@shared/types';
import { compactWhitespace } from '@shared/utils/strings';
import { resolveUrl, sameHost } from '@shared/utils/url';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';

const CHAPTER_HINT_RE = /(?:^|\b)(?:chapter|chapitre|chap|ch\.?|episode|ep\.?|part|vol\.?)\b/i;
const LISTING_HINT_RE =
  /(all chapters|chapter list|chapters|volumes|table of contents|toc|manga info|series)/i;
const LISTING_PATH_RE =
  /(?:all-chapters|chapter-list|chapters|volumes|manga-info|table-of-contents|toc)(?:$|[/?#_-])/i;
const PREVIOUS_HINT_RE = /(prev|previous|older|back|<<|‹|←)/i;
const NEXT_HINT_RE = /(next|newer|forward|>>|›|→)/i;
const BAD_LINK_RE = /(?:login|signup|register|discord|facebook|twitter|instagram|privacy|terms|about|contact|dmca)/i;
const CHAPTER_PATH_RE = /(chapter|chapitre|episode|ep|capitulo|capitolo|scan)/i;
const NAV_SECTION_RE = /(header|footer|nav|menu|breadcrumb|account|profile|social|share|comment|sidebar)/i;

function relationFromAnchor(anchor: HTMLAnchorElement, label: string): ChapterRelation {
  const rel = anchor.getAttribute('rel') || '';
  const href = anchor.href || '';
  const listingByPath = (() => {
    try {
      return LISTING_PATH_RE.test(new URL(href).pathname);
    } catch {
      return LISTING_PATH_RE.test(href);
    }
  })();

  if (LISTING_HINT_RE.test(label) || listingByPath) return 'listing';
  if (rel.includes('prev') || PREVIOUS_HINT_RE.test(`${label} ${href}`)) return 'previous';
  if (rel.includes('next') || NEXT_HINT_RE.test(`${label} ${href}`)) return 'next';
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

  if (CHAPTER_HINT_RE.test(label) || CHAPTER_HINT_RE.test(href)) score += 30;
  if (CHAPTER_PATH_RE.test(href)) score += 18;
  if (relation === 'listing') score += 18;
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

export function collectChapterLinks(
  root: ParentNode,
  baseUrl: string,
  currentUrl: string
): ChapterLinkCandidate[] {
  const anchors = [...root.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const dataHrefElements = [...root.querySelectorAll<HTMLElement>('[data-href], [data-url], [data-next], [data-prev]')];
  const results: ChapterLinkCandidate[] = [];

  anchors.forEach((anchor, index) => {
    const resolvedUrl = resolveUrl(anchor.getAttribute('href') || '', baseUrl);
    if (!resolvedUrl) return;

    const label = compactWhitespace(
      anchor.textContent || anchor.getAttribute('title') || anchor.getAttribute('aria-label') || ''
    );
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
    if (score < 12) return;

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
    const rawHref =
      element.getAttribute('data-href') ||
      element.getAttribute('data-url') ||
      element.getAttribute('data-next') ||
      element.getAttribute('data-prev') ||
      '';
    const resolvedUrl = resolveUrl(rawHref, baseUrl);
    if (!resolvedUrl) return;

    const label = compactWhitespace(
      element.textContent || element.getAttribute('title') || element.getAttribute('aria-label') || ''
    );
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
    if (score < 12) return;

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

  return results;
}
