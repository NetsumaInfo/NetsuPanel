import type { ChapterLinkCandidate, ChapterRelation } from '@shared/types';
import { compactWhitespace } from '@shared/utils/strings';
import { resolveUrl, sameHost } from '@shared/utils/url';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';

const CHAPTER_HINT_RE = /(chapter|chapitre|chap|ch\.?|episode|ep\.?|read|part|vol\.?)/i;
const LISTING_HINT_RE =
  /(all chapters|chapter list|chapters|volumes|table of contents|toc|manga info|series)/i;
const PREVIOUS_HINT_RE = /(prev|previous|older|back|<<|‹|←)/i;
const NEXT_HINT_RE = /(next|newer|forward|>>|›|→)/i;
const BAD_LINK_RE = /(login|signup|discord|facebook|twitter|instagram|privacy|terms)/i;

function relationFromAnchor(anchor: HTMLAnchorElement, label: string): ChapterRelation {
  const rel = anchor.getAttribute('rel') || '';
  const composite = `${label} ${anchor.href}`;
  if (LISTING_HINT_RE.test(composite)) return 'listing';
  if (rel.includes('prev') || PREVIOUS_HINT_RE.test(composite)) return 'previous';
  if (rel.includes('next') || NEXT_HINT_RE.test(composite)) return 'next';
  return 'candidate';
}

function computeScore(
  label: string,
  currentUrl: string,
  href: string,
  relation: ChapterRelation
): number {
  let score = 0;
  if (sameHost(currentUrl, href)) score += 20;
  if (CHAPTER_HINT_RE.test(label) || CHAPTER_HINT_RE.test(href)) score += 30;
  if (relation === 'listing') score += 18;
  if (relation === 'next' || relation === 'previous') score += 14;
  if (label.length >= 4 && label.length <= 60) score += 6;
  if (BAD_LINK_RE.test(label) || BAD_LINK_RE.test(href)) score -= 40;
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
    const score = computeScore(identity.label, currentUrl, resolvedUrl, relation);
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
      containerSignature: buildContainerSignature(anchor),
      diagnostics: [],
    });
  });

  return results;
}
