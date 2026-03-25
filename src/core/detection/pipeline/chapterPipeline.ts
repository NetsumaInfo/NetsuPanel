import type {
  ChapterLinkCandidate,
  DetectionDiagnostic,
  MangaScanResult,
  PageIdentity,
} from '@shared/types';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';

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
  const current = buildCurrentCandidate(page);

  const cluster = pickBestChapterSet(
    deduped.filter((candidate) => candidate.relation === 'candidate')
  );

  const chapters = sortChapterCandidates(
    dedupeChapterCandidates(
      [current, ...cluster, ...deduped.filter((candidate) => candidate.relation !== 'candidate' && candidate.relation !== 'listing')]
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

  const explicitPrevious = bestNavigationCandidate(deduped, 'previous');
  const explicitNext = bestNavigationCandidate(deduped, 'next');
  const previous = explicitPrevious || inferNavigationByChapterNumber(deduped, current, 'previous');
  const next = explicitNext || inferNavigationByChapterNumber(deduped, current, 'next');

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
      listing: bestNavigationCandidate(deduped, 'listing'),
    },
    diagnostics,
  };
}
