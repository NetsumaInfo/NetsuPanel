import type { DetectionDiagnostic, ImageCandidate, ImageCollectionResult, RawImageCandidate } from '@shared/types';
import { median } from '@shared/utils/number';
import { compactWhitespace, extractExtension } from '@shared/utils/strings';
import { buildFamilyKey, toQuerylessUrl } from '@shared/utils/url';
import { isLikelyDecorative, scoreImageCandidate } from './scoreImageCandidate';

const PAGE_NUMBER_RE =
  /(?:^|[/_\-\s(])(?:page|pg|p|img|image)[._\-\s#]*(\d{1,4})(?=$|[/)_\-\s.#?])|(?:^|[/_\-\s(])0*(\d{1,4})(?=\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#]))/i;

function extractPageNumber(input: string): number | null {
  const match = input.match(PAGE_NUMBER_RE);
  if (!match) return null;
  return Number(match[1] || match[2]);
}

function normalizeCandidate(raw: RawImageCandidate): ImageCandidate {
  const querylessUrl = toQuerylessUrl(raw.url);
  const filenameHint = decodeURIComponent(querylessUrl.split('/').filter(Boolean).pop() || raw.url);
  const pageNumber =
    extractPageNumber(filenameHint) ??
    extractPageNumber(raw.altText) ??
    extractPageNumber(raw.titleText);
  const area = raw.width * raw.height;
  const extensionHint = raw.url.startsWith('data:image/')
    ? raw.url.split(';')[0].split('/').pop() || 'png'
    : extractExtension(raw.url);

  return {
    ...raw,
    previewUrl: raw.previewUrl || raw.url,
    canonicalUrl: raw.url.split('#')[0],
    querylessUrl,
    area,
    familyKey: buildFamilyKey(raw.url),
    filenameHint,
    extensionHint,
    pageNumber,
    altText: compactWhitespace(raw.altText),
    titleText: compactWhitespace(raw.titleText),
    score: scoreImageCandidate({
      url: raw.url,
      width: raw.width,
      height: raw.height,
      area,
      visible: raw.visible,
      sourceKind: raw.sourceKind,
      pageNumber,
      altText: raw.altText,
      titleText: raw.titleText,
    }),
  };
}

function keepBestDuplicate(left: ImageCandidate, right: ImageCandidate): ImageCandidate {
  if (right.score !== left.score) return right.score > left.score ? right : left;
  if (right.area !== left.area) return right.area > left.area ? right : left;
  return right.domIndex < left.domIndex ? right : left;
}

function sortCandidates(items: ImageCandidate[]): ImageCandidate[] {
  const withPageNumbers = items.filter((item) => item.pageNumber !== null);
  const usePageNumbers = withPageNumbers.length >= Math.max(3, Math.floor(items.length / 3));

  return [...items].sort((left, right) => {
    if (usePageNumbers && left.pageNumber !== null && right.pageNumber !== null && left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }

    if (left.top !== right.top) return left.top - right.top;
    if (left.domIndex !== right.domIndex) return left.domIndex - right.domIndex;
    return right.score - left.score;
  });
}

function selectNarrativeCluster(items: ImageCandidate[]): { items: ImageCandidate[]; diagnostics: DetectionDiagnostic[] } {
  if (items.length <= 3) {
    return { items, diagnostics: [] };
  }

  const groups = new Map<string, ImageCandidate[]>();
  for (const item of items) {
    const key = `${item.familyKey}|${item.containerSignature}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }

  const ranked = [...groups.entries()]
    .map(([key, group]) => {
      const areas = group.map((item) => item.area).filter((a) => a > 0);
      const medianArea = areas.length > 0 ? median(areas) : 0;
      const consistentAreaCount = medianArea > 0
        ? group.filter((item) => Math.abs(item.area - medianArea) <= medianArea * 0.55).length
        : 0;
      const averageScore = group.reduce((sum, item) => sum + item.score, 0) / group.length;
      const pageNumberCount = group.filter((item) => item.pageNumber !== null).length;
      const dimensionedCount = group.filter((item) => item.width >= 240 && item.height >= 240).length;
      const visibleCount = group.filter((item) => item.visible).length;
      const validImagesCount = group.filter((item) => item.score >= 12).length;
      const unknownDimensionCount = group.length - group.filter((item) => item.width > 0 && item.height > 0).length;
      const scriptOnlyPenalty = unknownDimensionCount > 0 && dimensionedCount === 0 ? 10 : 0;
      const score =
        validImagesCount * 6 +
        averageScore * 2 +
        consistentAreaCount * 8 +
        pageNumberCount * 12 +
        dimensionedCount * 10 +
        visibleCount * 4 -
        scriptOnlyPenalty;
      return { key, group, score };
    })
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  if (!winner || winner.group.length < 2 || winner.score < 20) {
    return {
      items: items.filter((item) => item.score >= 28),
      diagnostics: [
        {
          code: 'narrative-cluster-fallback',
          message: 'Cluster fallback used because no stable page group was found.',
          level: 'warning',
        },
      ],
    };
  }

  return { items: sortCandidates(winner.group), diagnostics: [] };
}

export function buildImageCollection(
  rawCandidates: RawImageCandidate[],
  mode: 'general' | 'manga'
): ImageCollectionResult {
  const diagnostics: DetectionDiagnostic[] = [];
  const deduped = new Map<string, ImageCandidate>();

  for (const raw of rawCandidates) {
    const normalized = normalizeCandidate(raw);
    const maxDim = Math.max(normalized.width, normalized.height);

    if (!normalized.url) {
      diagnostics.push({
        code: 'image-missing-url',
        message: 'Dropped an image candidate without a usable URL.',
        level: 'warning',
        candidateId: raw.id,
      });
      continue;
    }

    const hasDimensions = normalized.width > 0 && normalized.height > 0;

    if (mode === 'general') {
      // General mode: show ALL images with a valid URL.
      // Only skip genuinely micro images (both dims known AND both < 50px = likely icon/pixel)
      const isMicro = hasDimensions && normalized.width < 50 && normalized.height < 50;
      const isDecorativeUnknown =
        isLikelyDecorative(normalized.url) &&
        (!hasDimensions || maxDim < 320);
      const isLowSignalScriptCandidate =
        (normalized.sourceKind === 'inline-script' || normalized.sourceKind === 'json-embedded') &&
        !hasDimensions &&
        normalized.score < 24;
      if (isMicro) {
        diagnostics.push({
          code: 'image-rejected-micro',
          message: `Rejected micro image ${normalized.filenameHint}.`,
          level: 'info',
          candidateId: normalized.id,
        });
        continue;
      }
      if (isDecorativeUnknown || isLowSignalScriptCandidate) {
        diagnostics.push({
          code: 'image-rejected-decorative',
          message: `Rejected decorative/low-signal image ${normalized.filenameHint}.`,
          level: 'info',
          candidateId: normalized.id,
        });
        continue;
      }
    } else {
      // Manga mode: strict filtering
      const minSizeThreshold = 150;
      const minScoreThreshold = 12;
      const isTooSmall = hasDimensions && Math.max(normalized.width, normalized.height) < minSizeThreshold;

      if (isTooSmall || isLikelyDecorative(normalized.url) || normalized.score < minScoreThreshold) {
        diagnostics.push({
          code: 'image-rejected-low-signal',
          message: `Rejected low-signal candidate ${normalized.filenameHint}.`,
          level: 'info',
          candidateId: normalized.id,
        });
        continue;
      }
    }

    const dedupeKey =
      normalized.captureStrategy === 'content'
        ? `${normalized.captureStrategy}:${normalized.id}`
        : `${normalized.captureStrategy}:${normalized.querylessUrl}`;
    const existing = deduped.get(dedupeKey);
    deduped.set(dedupeKey, existing ? keepBestDuplicate(existing, normalized) : normalized);
  }

  const sorted = sortCandidates([...deduped.values()]);
  if (mode === 'general') {
    return {
      items: sorted,
      totalCandidates: rawCandidates.length,
      diagnostics,
    };
  }

  const cluster = selectNarrativeCluster(sorted);
  return {
    items: cluster.items,
    totalCandidates: rawCandidates.length,
    diagnostics: diagnostics.concat(cluster.diagnostics),
  };
}
