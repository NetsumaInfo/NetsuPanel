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

export type GeneralImageSortMode = 'page-order' | 'size-desc' | 'size-asc' | 'name-asc' | 'name-desc';
export type GeneralImageDisplayMode = 'grid' | 'group-type' | 'group-name';

export interface GeneralSelectOption<T extends string> {
  value: T;
  label: string;
}

export interface GeneralImageSection {
  id: string;
  title: string;
  items: ImageCandidate[];
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
  { value: 'size-desc', label: 'Taille décroissante' },
  { value: 'size-asc', label: 'Taille croissante' },
  { value: 'name-asc', label: 'Nom A-Z' },
  { value: 'name-desc', label: 'Nom Z-A' },
];

const DISPLAY_OPTIONS: GeneralSelectOption<GeneralImageDisplayMode>[] = [
  { value: 'grid', label: 'Grille simple' },
  { value: 'group-type', label: 'Catégories type' },
  { value: 'group-name', label: 'Catégories nom' },
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
  const extensionType = extensionToType(item.extensionHint || '');

  if (extensionType === 'svg' || sourceKind.includes('svg')) return 'svg';
  if (extensionType === 'gif') return 'gif';
  if (sourceKind.includes('canvas')) return 'canvas';
  if (sourceKind.includes('video-poster')) return 'poster';
  if (sourceKind.includes('background')) return 'background';

  return extensionType;
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

export function getGeneralDisplayOptions(): GeneralSelectOption<GeneralImageDisplayMode>[] {
  return DISPLAY_OPTIONS;
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

function nameKey(item: ImageCandidate): string {
  return (item.filenameHint || item.titleText || item.altText || item.url).toLowerCase();
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

  if (sortMode === 'name-desc') {
    return [...filtered].sort((left, right) => nameKey(right).localeCompare(nameKey(left), undefined, { numeric: true }));
  }

  return [...filtered].sort((left, right) => nameKey(left).localeCompare(nameKey(right), undefined, { numeric: true }));
}

function buildGroupName(item: ImageCandidate, displayMode: GeneralImageDisplayMode): string {
  if (displayMode === 'group-type') {
    return resolveGeneralImageType(item);
  }

  const firstChar = nameKey(item).charAt(0).toUpperCase();
  if (!firstChar) return 'Sans nom';
  if (/[A-Z]/.test(firstChar)) return firstChar;
  if (/[0-9]/.test(firstChar)) return '#';
  return 'Autres';
}

export function buildGeneralImageSections(
  items: ImageCandidate[],
  displayMode: GeneralImageDisplayMode
): GeneralImageSection[] {
  if (displayMode === 'grid') {
    return [{ id: 'all', title: 'Toutes les images', items }];
  }

  const sections = new Map<string, ImageCandidate[]>();
  for (const item of items) {
    const sectionName = buildGroupName(item, displayMode);
    const current = sections.get(sectionName) || [];
    current.push(item);
    sections.set(sectionName, current);
  }

  const orderedKeys = [...sections.keys()].sort((left, right) => {
    if (displayMode === 'group-type') {
      const leftRank = TYPE_ORDER.indexOf(left as Exclude<GeneralImageTypeFilter, 'all'>);
      const rightRank = TYPE_ORDER.indexOf(right as Exclude<GeneralImageTypeFilter, 'all'>);
      if (leftRank !== rightRank) return (leftRank >= 0 ? leftRank : TYPE_ORDER.length) - (rightRank >= 0 ? rightRank : TYPE_ORDER.length);
    }
    return left.localeCompare(right, undefined, { numeric: true });
  });

  return orderedKeys.map((key) => ({
    id: `section-${key}`,
    title: displayMode === 'group-type' ? TYPE_LABELS[key as Exclude<GeneralImageTypeFilter, 'all'>] : key,
    items: sections.get(key) || [],
  }));
}
