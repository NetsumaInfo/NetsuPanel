import type {
  ChapterLinkCandidate,
  DetectionDiagnostic,
  MangaScanResult,
  PageIdentity,
} from '@shared/types';
import { normalizeUrlForCompare, parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';

// ────────────────────────────────────────────────────────────
// NetsuShelf-inspired: Volume/Arc grouping
// ────────────────────────────────────────────────────────────

export interface ChapterGroup {
  type: 'volume' | 'book' | 'arc' | 'part' | 'season' | 'section' | 'tome' | 'range' | null;
  index: string | null;
  label: string | null;
  chapters: ChapterLinkCandidate[];
}

const GROUP_TYPE_ALIASES: Record<string, string> = {
  vol: 'volume',
  volume: 'volume',
  v: 'volume',
  book: 'book',
  bk: 'book',
  arc: 'arc',
  part: 'part',
  season: 'season',
  section: 'section',
  tome: 'tome',
  tom: 'tome',
  livre: 'book',
};

export function normalizeGroupType(raw: string): ChapterGroup['type'] {
  if (!raw) return null;
  const normalized = GROUP_TYPE_ALIASES[raw.toLowerCase().trim()];
  return (normalized as ChapterGroup['type']) ?? null;
}

export function groupChaptersByVolume(chapters: ChapterLinkCandidate[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  let currentGroup: ChapterGroup = { type: null, index: null, label: null, chapters: [] };

  for (const chapter of chapters) {
    const volMatch = (chapter.label || '').match(
      /^(?:(volume|vol|book|bk|tome|arc|part|season)[\.\s]*(\w+))[:\s-]*/i
    );
    if (volMatch) {
      if (currentGroup.chapters.length > 0) {
        groups.push(currentGroup);
      }
      const groupType = normalizeGroupType(volMatch[1]);
      currentGroup = {
        type: groupType,
        index: volMatch[2] || null,
        label: `${volMatch[1]} ${volMatch[2]}`.trim(),
        chapters: [chapter],
      };
    } else {
      const chapterVolumeIndex = chapter.volumeNumber === null ? null : String(chapter.volumeNumber);
      if (chapterVolumeIndex !== null && chapterVolumeIndex !== currentGroup.index) {
        if (currentGroup.chapters.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = {
          type: 'volume',
          index: chapterVolumeIndex,
          label: `Volume ${chapter.volumeNumber}`,
          chapters: [chapter],
        };
        continue;
      }

      currentGroup.chapters.push(chapter);
    }
  }

  if (currentGroup.chapters.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

function normalizeForCompare(url: string): string {
  try {
    return normalizeUrlForCompare(new URL(url).toString());
  } catch {
    return normalizeUrlForCompare(url);
  }
}

export function ensurePotentialChapterOneIsIncluded(
  page: PageIdentity,
  chapters: ChapterLinkCandidate[]
): ChapterLinkCandidate[] {
  if (chapters.length === 0) return chapters;

  const pageNorm = normalizeForCompare(page.url);
  const alreadyHasCurrentPage = chapters.some((chapter) => normalizeForCompare(chapter.url) === pageNorm);

  if (alreadyHasCurrentPage) return chapters;

  // Find minimum chapter number in the list (skip nulls)
  const numbers = chapters
    .map((chapter) => chapter.chapterNumber)
    .filter((value): value is number => value !== null);

  if (numbers.length === 0) return chapters;

  const minChapterNumber = Math.min(...numbers);

  // NetsuShelf: only prepend if starting at 2 (strong heuristic)
  if (minChapterNumber !== 2) return chapters;

  // Build a chapter-1 candidate from the current page
  const identity = parseChapterIdentity(page.title, page.url);
  const chapterOne: ChapterLinkCandidate = {
    id: 'ln-chapter-one-inferred',
    url: page.url,
    canonicalUrl: page.url.split('#')[0],
    label: identity.label || page.title || 'Chapter 1',
    relation: 'current',
    score: 100,
    chapterNumber: 1,
    volumeNumber: identity.volumeNumber,
    containerSignature: 'ln:chapter-one-inferred',
    diagnostics: [],
  };

  return [chapterOne, ...chapters];
}

const GENERIC_SERIES_SEGMENTS = new Set([
  'chapter',
  'chapitre',
  'chap',
  'ch',
  'episode',
  'ep',
  'viewer',
  'reader',
  'read',
  'detail',
  'manga',
  'manhwa',
  'manhua',
  'comic',
  'comics',
  'series',
  'title',
  'titles',
  'catalogue',
  'scan',
  'scans',
  'raw',
  'vf',
  'vo',
]);

function dedupeChapterCandidates(candidates: ChapterLinkCandidate[]): ChapterLinkCandidate[] {
  const byUrl = new Map<string, ChapterLinkCandidate>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.canonicalUrl);
    if (!existing || candidate.score > existing.score) {
      byUrl.set(candidate.canonicalUrl, candidate);
    }
  }
  return [...byUrl.values()];
}

function sortChapterCandidates(candidates: ChapterLinkCandidate[]): ChapterLinkCandidate[] {
  const numbered = candidates.filter((candidate) => candidate.chapterNumber !== null);
  const useNumbers = numbered.length >= Math.max(2, Math.floor(candidates.length / 2));

  return [...candidates].sort((left, right) => {
    if (useNumbers && left.chapterNumber !== null && right.chapterNumber !== null && left.chapterNumber !== right.chapterNumber) {
      return left.chapterNumber - right.chapterNumber;
    }
    if (left.relation !== right.relation) {
      const order = ['listing', 'current', 'previous', 'next', 'candidate'];
      return order.indexOf(left.relation) - order.indexOf(right.relation);
    }
    return right.score - left.score;
  });
}

function bestNavigationCandidate(
  candidates: ChapterLinkCandidate[],
  relation: 'previous' | 'next' | 'listing'
): ChapterLinkCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.relation === relation)
    .sort((left, right) => right.score - left.score)[0];
}

function inferNavigationByChapterNumber(
  candidates: ChapterLinkCandidate[],
  current: ChapterLinkCandidate,
  relation: 'previous' | 'next'
): ChapterLinkCandidate | undefined {
  if (current.chapterNumber === null) return undefined;

  const numbered = candidates
    .filter(
      (candidate) =>
        candidate.chapterNumber !== null &&
        candidate.canonicalUrl !== current.canonicalUrl &&
        candidate.relation !== 'listing'
    )
    .sort((left, right) => {
      if (left.chapterNumber === null || right.chapterNumber === null) return 0;
      return left.chapterNumber - right.chapterNumber;
    });

  if (numbered.length === 0) return undefined;

  if (relation === 'previous') {
    return [...numbered]
      .reverse()
      .find((candidate) => (candidate.chapterNumber ?? Number.POSITIVE_INFINITY) < current.chapterNumber!);
  }

  return numbered.find((candidate) => (candidate.chapterNumber ?? Number.NEGATIVE_INFINITY) > current.chapterNumber!);
}

function pageLooksLikeReader(page: PageIdentity): boolean {
  try {
    const parsed = new URL(page.url);
    if (parsed.searchParams.has('episode_no')) return true;
    if (parsed.searchParams.has('chapter') || parsed.searchParams.has('episode')) return true;
    if (parsed.searchParams.has('no') && /(viewer|detail|episode)/i.test(parsed.pathname)) return true;
  } catch {
    // Ignore invalid URL parsing.
  }

  return /(chapter|chapitre|episode|viewer|read|scan|detail)/i.test(`${page.pathname} ${page.title}`);
}

function buildCurrentCandidate(page: PageIdentity): ChapterLinkCandidate {
  const identity = parseChapterIdentity(page.title, page.url);
  return {
    id: 'current-page',
    url: page.url,
    canonicalUrl: page.url.split('#')[0],
    label: identity.label || page.title,
    relation: 'current',
    score: 100,
    chapterNumber: identity.chapterNumber,
    volumeNumber: identity.volumeNumber,
    containerSignature: 'page',
    diagnostics: [],
  };
}

function normalizeSeriesSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function extractSeriesSlug(url: string): string | null {
  let segments: string[] = [];
  try {
    segments = new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => normalizeSeriesSegment(decodeURIComponent(segment)));
  } catch {
    return null;
  }

  const chapterMarkerIndex = segments.findIndex((segment) =>
    /^(chapter|chapitre|chap|ch|episode|ep)(?:[-_]\d+(?:\.\d+)?)?$/.test(segment)
  );
  if (chapterMarkerIndex > 0) {
    for (let i = chapterMarkerIndex - 1; i >= 0; i -= 1) {
      const candidate = segments[i];
      if (!candidate) continue;
      if (GENERIC_SERIES_SEGMENTS.has(candidate) || /^\d+(?:\.\d+)?$/.test(candidate)) {
        continue;
      }
      return candidate;
    }
  }

  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (!last) {
      segments.pop();
      continue;
    }

    if (GENERIC_SERIES_SEGMENTS.has(last) || /^\d+(?:\.\d+)?$/.test(last)) {
      segments.pop();
      continue;
    }

    const stripped = normalizeSeriesSegment(
      last
        .replace(/(?:^|[-_])(chapter|chapitre|chap|ch|episode|ep|scan|raw)(?:[-_]\d+(?:\.\d+)?)?$/i, '')
        .replace(/(?:[-_]\d+(?:\.\d+)?)$/, '')
    );

    if (stripped && !GENERIC_SERIES_SEGMENTS.has(stripped)) {
      return stripped;
    }

    segments.pop();
  }

  return null;
}

function scopeCandidatesToCurrentSeries(
  page: PageIdentity,
  candidates: ChapterLinkCandidate[]
): ChapterLinkCandidate[] {
  const currentSeriesSlug = extractSeriesSlug(page.url);
  if (!currentSeriesSlug) return candidates;

  const matched = candidates.filter((candidate) => {
    const candidateSeriesSlug = extractSeriesSlug(candidate.url);
    return candidateSeriesSlug === null || candidateSeriesSlug === currentSeriesSlug;
  });

  const matchedNumberedCount = matched.filter((candidate) => candidate.chapterNumber !== null).length;
  if (matched.length >= 2 || matchedNumberedCount >= 1) {
    return matched;
  }

  return candidates;
}

function pickBestChapterCluster(candidates: ChapterLinkCandidate[]): ChapterLinkCandidate[] {
  const groups = new Map<string, ChapterLinkCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.containerSignature || 'root';
    const current = groups.get(key) || [];
    current.push(candidate);
    groups.set(key, current);
  }

  const ranked = [...groups.values()].sort((left, right) => {
    const leftScore =
      left.reduce((sum, candidate) => sum + candidate.score, 0) +
      left.filter((candidate) => candidate.chapterNumber !== null).length * 18;
    const rightScore =
      right.reduce((sum, candidate) => sum + candidate.score, 0) +
      right.filter((candidate) => candidate.chapterNumber !== null).length * 18;
    return rightScore - leftScore;
  });

  return ranked[0] || [];
}

function pickBestChapterSet(candidates: ChapterLinkCandidate[]): ChapterLinkCandidate[] {
  const cluster = pickBestChapterCluster(candidates);
  if (cluster.length >= 4) {
    return cluster;
  }

  const numbered = candidates.filter((candidate) => candidate.chapterNumber !== null && candidate.score >= 18);
  if (numbered.length >= 4) {
    return numbered;
  }

  return candidates.filter((candidate) => candidate.score >= 14);
}

export function buildMangaLinkMap(
  page: PageIdentity,
  chapterCandidates: ChapterLinkCandidate[]
): Pick<MangaScanResult, 'chapters' | 'navigation' | 'diagnostics'> {
  const diagnostics: DetectionDiagnostic[] = [];
  const deduped = dedupeChapterCandidates(chapterCandidates);
  const scoped = scopeCandidatesToCurrentSeries(page, deduped);
  const current = buildCurrentCandidate(page);

  const cluster = pickBestChapterSet(
    scoped.filter((candidate) => candidate.relation === 'candidate')
  );
  const includeCurrentInChapters =
    pageLooksLikeReader(page) ||
    scoped.some((candidate) => candidate.relation === 'current' && candidate.canonicalUrl === current.canonicalUrl);

  const chapters = sortChapterCandidates(
    dedupeChapterCandidates(
      [
        ...(includeCurrentInChapters ? [current] : []),
        ...cluster,
        ...scoped.filter((candidate) => candidate.relation !== 'candidate' && candidate.relation !== 'listing'),
      ]
        .filter(Boolean)
        .filter((candidate) => candidate.score >= 8)
    )
  );

  if (chapters.length <= 1) {
    diagnostics.push({
      code: 'chapter-list-limited',
      message: 'Only the current chapter was detected. The site may require manual expansion or JS navigation.',
      level: 'warning',
    });
  }

  const explicitPrevious = bestNavigationCandidate(scoped, 'previous');
  const explicitNext = bestNavigationCandidate(scoped, 'next');
  const previous = explicitPrevious || inferNavigationByChapterNumber(scoped, current, 'previous');
  const next = explicitNext || inferNavigationByChapterNumber(scoped, current, 'next');

  if (!explicitPrevious && previous) {
    diagnostics.push({
      code: 'navigation-previous-inferred',
      message: `Previous chapter inferred from chapter number (${previous.chapterNumber ?? '?'})`,
      level: 'info',
    });
  }

  if (!explicitNext && next) {
    diagnostics.push({
      code: 'navigation-next-inferred',
      message: `Next chapter inferred from chapter number (${next.chapterNumber ?? '?'})`,
      level: 'info',
    });
  }

  return {
    chapters,
    navigation: {
      current,
      previous,
      next,
      listing: bestNavigationCandidate(scoped, 'listing'),
    },
    diagnostics,
  };
}
