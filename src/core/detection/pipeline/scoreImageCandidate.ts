import { clamp } from '@shared/utils/number';

const JUNK_RE =
  /(?:^|[/_\-?=])(avatar|icon|logo|sprite|ad|ads|banner|emoji|favicon|tracker|comment|profile|share|social|loader|loading|spinner|preloader|placeholder|blank|pixel|throbber)(?:$|[/_\-?=.])/i;
const PAGE_HINT_RE = /(page|chapter|chap|webtoon|manga|manhwa|manhua)/i;

interface ScoreInput {
  url: string;
  width: number;
  height: number;
  area: number;
  visible: boolean;
  sourceKind: string;
  pageNumber: number | null;
  altText: string;
  titleText: string;
}

export function isLikelyDecorative(url: string): boolean {
  return JUNK_RE.test(url);
}

export function scoreImageCandidate(input: ScoreInput): number {
  let score = 0;
  const maxDim = Math.max(input.width, input.height);
  const minDim = Math.min(input.width, input.height);
  const hasDimensions = input.width > 0 && input.height > 0;
  const combinedText = `${input.url} ${input.altText} ${input.titleText}`;

  if (input.visible) score += 10;

  if (hasDimensions) {
    // Dimension-based scoring only when dimensions are known
    if (maxDim >= 1400) score += 26;
    else if (maxDim >= 900) score += 18;
    else if (maxDim >= 500) score += 10;
    else if (maxDim >= 240) score += 4;

    if (input.area >= 1_200_000) score += 24;
    else if (input.area >= 400_000) score += 16;
    else if (input.area >= 90_000) score += 8;

    if (minDim < 120) score -= 12;
    else if (minDim < 160) score -= 6;

    const aspectRatio = input.height / input.width;
    if (aspectRatio >= 1.1 && aspectRatio <= 2.4) score += 10;
    else if (aspectRatio > 2.4) score += 12;
    else if (aspectRatio >= 0.4 && aspectRatio < 1.1) score += 8;
    else if (aspectRatio >= 0.25) score += 4;
  } else {
    // Unknown dimensions: give a neutral base so URL/content hints can carry them
    score += 14;
  }

  if (PAGE_HINT_RE.test(combinedText)) score += 14;
  if (input.pageNumber !== null) score += 12;

  if (input.sourceKind.includes('srcset') || input.sourceKind.includes('current')) score += 8;
  if (input.sourceKind === 'background-image') score += 4;
  if (input.sourceKind === 'json-embedded' || input.sourceKind === 'inline-script') score += 10;
  if (
    input.sourceKind === 'wp-manga' ||
    input.sourceKind === 'mangadex-api' ||
    input.sourceKind === 'webtoon' ||
    input.sourceKind.startsWith('madara') ||
    input.sourceKind.startsWith('mangastream') ||
    input.sourceKind === 'weebcentral' ||
    input.sourceKind === 'next-data' ||
    input.sourceKind === 'next-data-dom' ||
    input.sourceKind === 'mangago'
  ) {
    score += 14;
  }

  if (isLikelyDecorative(input.url)) score -= 36;

  return clamp(score, 0, 100);
}
