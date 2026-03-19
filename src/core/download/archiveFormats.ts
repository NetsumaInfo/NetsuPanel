import type { ArchiveFormat } from '@shared/types';

export type ArchiveContainerExtension = 'cbz' | 'zip';
export type ArchiveImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ArchiveImageFormat = 'source' | 'jpg' | 'png' | 'webp';

export interface ArchiveFormatPreset {
  value: ArchiveFormat;
  label: string;
  shortLabel: string;
  description: string;
  extension: ArchiveContainerExtension;
  archiveMime: string;
  imageFormat: ArchiveImageFormat;
  pageMime?: ArchiveImageMime;
  quality?: number;
}

export const ARCHIVE_CONTAINER_OPTIONS: Array<{ value: ArchiveContainerExtension; label: string }> = [
  { value: 'cbz', label: 'CBZ' },
  { value: 'zip', label: 'ZIP' },
];

export const ARCHIVE_IMAGE_FORMAT_OPTIONS: Array<{ value: ArchiveImageFormat; label: string }> = [
  { value: 'source', label: 'Source' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WEBP' },
];

export const ARCHIVE_FORMAT_PRESETS: ArchiveFormatPreset[] = [
  {
    value: 'cbz',
    label: 'CBZ source',
    shortLabel: 'CBZ',
    description: 'Archive BD, conserve les fichiers d’origine.',
    extension: 'cbz',
    archiveMime: 'application/vnd.comicbook+zip',
    imageFormat: 'source',
  },
  {
    value: 'cbz-jpg',
    label: 'CBZ JPG',
    shortLabel: 'CBZ JPG',
    description: 'Compatibilité maximale avec la plupart des lecteurs.',
    extension: 'cbz',
    archiveMime: 'application/vnd.comicbook+zip',
    imageFormat: 'jpg',
    pageMime: 'image/jpeg',
    quality: 0.92,
  },
  {
    value: 'cbz-png',
    label: 'CBZ PNG',
    shortLabel: 'CBZ PNG',
    description: 'Archive BD avec pages en PNG.',
    extension: 'cbz',
    archiveMime: 'application/vnd.comicbook+zip',
    imageFormat: 'png',
    pageMime: 'image/png',
  },
  {
    value: 'cbz-webp',
    label: 'CBZ WEBP',
    shortLabel: 'CBZ WEBP',
    description: 'Archive BD allégée avec pages en WEBP.',
    extension: 'cbz',
    archiveMime: 'application/vnd.comicbook+zip',
    imageFormat: 'webp',
    pageMime: 'image/webp',
    quality: 0.9,
  },
  {
    value: 'zip',
    label: 'ZIP source',
    shortLabel: 'ZIP',
    description: 'Archive standard, garde les formats détectés.',
    extension: 'zip',
    archiveMime: 'application/zip',
    imageFormat: 'source',
  },
  {
    value: 'zip-jpg',
    label: 'ZIP JPG',
    shortLabel: 'ZIP JPG',
    description: 'Archive standard avec pages converties en JPG.',
    extension: 'zip',
    archiveMime: 'application/zip',
    imageFormat: 'jpg',
    pageMime: 'image/jpeg',
    quality: 0.92,
  },
  {
    value: 'zip-png',
    label: 'ZIP PNG',
    shortLabel: 'ZIP PNG',
    description: 'Archive standard en PNG.',
    extension: 'zip',
    archiveMime: 'application/zip',
    imageFormat: 'png',
    pageMime: 'image/png',
  },
  {
    value: 'zip-webp',
    label: 'ZIP WEBP',
    shortLabel: 'ZIP WEBP',
    description: 'Archive allégée avec pages en WEBP.',
    extension: 'zip',
    archiveMime: 'application/zip',
    imageFormat: 'webp',
    pageMime: 'image/webp',
    quality: 0.9,
  },
];

export function resolveArchiveFormat(
  container: ArchiveContainerExtension,
  imageFormat: ArchiveImageFormat
): ArchiveFormat {
  const preset = ARCHIVE_FORMAT_PRESETS.find(
    (item) => item.extension === container && item.imageFormat === imageFormat
  );

  if (preset) {
    return preset.value;
  }

  return container;
}

export function splitArchiveFormat(format: ArchiveFormat): {
  container: ArchiveContainerExtension;
  imageFormat: ArchiveImageFormat;
} {
  const preset = getArchiveFormatPreset(format);
  return {
    container: preset.extension,
    imageFormat: preset.imageFormat,
  };
}

export function getArchiveFormatPreset(format: ArchiveFormat): ArchiveFormatPreset {
  const preset = ARCHIVE_FORMAT_PRESETS.find((item) => item.value === format);
  if (!preset) {
    return ARCHIVE_FORMAT_PRESETS[0]!;
  }
  return preset;
}
