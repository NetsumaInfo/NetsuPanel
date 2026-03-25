import type { ImageCandidate } from '@shared/types';

export type GeneralImageTypeFilter =
  | 'all'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'gif'
  | 'svg'
  | 'canvas'
  | 'background'
  | 'poster'
  | 'unknown';

export type GeneralImageSortMode = 'page-order' | 'size-desc' | 'size-asc' | 'type';

export interface GeneralSelectOption<T extends string> {
  value: T;
  label: string;
}

const TYPE_LABELS: Record<Exclude<GeneralImageTypeFilter, 'all'>, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WEBP',
  avif: 'AVIF',
  gif: 'GIF',
  svg: 'SVG',
  canvas: 'Canvas',
  background: 'Background',
  poster: 'Poster vidéo',
  unknown: 'Autre',
};

const TYPE_ORDER: Exclude<GeneralImageTypeFilter, 'all'>[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'svg',
  'canvas',
  'background',
  'poster',
  'unknown',
];

const SORT_OPTIONS: GeneralSelectOption<GeneralImageSortMode>[] = [
  { value: 'page-order', label: 'Ordre page' },
  { value: 'type', label: 'Par type' },
  { value: 'size-desc', label: 'Taille décroissante' },
  { value: 'size-asc', label: 'Taille croissante' },
];

function extensionToType(extension: string): Exclude<GeneralImageTypeFilter, 'all'> {
  const normalized = extension.toLowerCase();
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpeg';
  if (normalized === 'png') return 'png';
  if (normalized === 'webp') return 'webp';
  if (normalized === 'avif') return 'avif';
  if (normalized === 'gif') return 'gif';
  if (normalized === 'svg') return 'svg';
  return 'unknown';
}

export function resolveGeneralImageType(item: ImageCandidate): Exclude<GeneralImageTypeFilter, 'all'> {
  const sourceKind = item.sourceKind.toLowerCase();

  if (sourceKind.includes('background')) return 'background';
  if (sourceKind.includes('video-poster')) return 'poster';
  if (sourceKind.includes('canvas')) return 'canvas';
  if (sourceKind.includes('svg')) return 'svg';

  return extensionToType(item.extensionHint || '');
}

export function buildGeneralTypeOptions(items: ImageCandidate[]): GeneralSelectOption<GeneralImageTypeFilter>[] {
  const available = new Set(items.map((item) => resolveGeneralImageType(item)));

  return [
    { value: 'all', label: 'Tous les types' },
    ...TYPE_ORDER.filter((type) => available.has(type)).map((type) => ({
      value: type,
      label: TYPE_LABELS[type],
    })),
  ];
}

export function getGeneralSortOptions(): GeneralSelectOption<GeneralImageSortMode>[] {
  return SORT_OPTIONS;
}

function sortByPageOrder(items: ImageCandidate[]): ImageCandidate[] {
  return [...items].sort((left, right) => {
    if (left.pageNumber !== null && right.pageNumber !== null && left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }
    if (left.top !== right.top) return left.top - right.top;
    if (left.domIndex !== right.domIndex) return left.domIndex - right.domIndex;
    return right.score - left.score;
  });
}

function typeRank(type: Exclude<GeneralImageTypeFilter, 'all'>): number {
  const rank = TYPE_ORDER.indexOf(type);
  return rank >= 0 ? rank : TYPE_ORDER.length;
}

export function applyGeneralImageView(
  items: ImageCandidate[],
  filter: GeneralImageTypeFilter,
  sortMode: GeneralImageSortMode
): ImageCandidate[] {
  const filtered =
    filter === 'all'
      ? [...items]
      : items.filter((item) => resolveGeneralImageType(item) === filter);

  if (sortMode === 'page-order') {
    return sortByPageOrder(filtered);
  }

  if (sortMode === 'size-desc') {
    return [...filtered].sort((left, right) => {
      if (right.area !== left.area) return right.area - left.area;
      return right.score - left.score;
    });
  }

  if (sortMode === 'size-asc') {
    return [...filtered].sort((left, right) => {
      if (left.area !== right.area) return left.area - right.area;
      return right.score - left.score;
    });
  }

  return [...filtered].sort((left, right) => {
    const leftTypeRank = typeRank(resolveGeneralImageType(left));
    const rightTypeRank = typeRank(resolveGeneralImageType(right));
    if (leftTypeRank !== rightTypeRank) return leftTypeRank - rightTypeRank;
    if (left.pageNumber !== null && right.pageNumber !== null && left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }
    if (left.top !== right.top) return left.top - right.top;
    return left.domIndex - right.domIndex;
  });
}
