import type { ArchiveFormat } from '@shared/types';

export type ArchiveContainerExtension = 'cbz' | 'zip';
export type ArchiveImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ArchiveFormatPreset {
  value: ArchiveFormat;
  label: string;
  shortLabel: string;
  description: string;
  extension: ArchiveContainerExtension;
  archiveMime: string;
  pageMime?: ArchiveImageMime;
  quality?: number;
}

export const ARCHIVE_FORMAT_PRESETS: ArchiveFormatPreset[] = [
  {
    value: 'cbz',
    label: 'CBZ source',
    shortLabel: 'CBZ',
    description: 'Archive BD, conserve les fichiers d’origine.',
    extension: 'cbz',
    archiveMime: 'application/vnd.comicbook+zip',
  },
  {
    value: 'cbz-jpg',
    label: 'CBZ JPG',
    shortLabel: 'CBZ JPG',
    description: 'Compatibilité maximale avec la plupart des lecteurs.',
    extension: 'cbz',
    archiveMime: 'application/vnd.comicbook+zip',
    pageMime: 'image/jpeg',
    quality: 0.92,
  },
  {
    value: 'zip',
    label: 'ZIP source',
    shortLabel: 'ZIP',
    description: 'Archive standard, garde les formats détectés.',
    extension: 'zip',
    archiveMime: 'application/zip',
  },
  {
    value: 'zip-jpg',
    label: 'ZIP JPG',
    shortLabel: 'ZIP JPG',
    description: 'Archive standard avec pages converties en JPG.',
    extension: 'zip',
    archiveMime: 'application/zip',
    pageMime: 'image/jpeg',
    quality: 0.92,
  },
  {
    value: 'zip-png',
    label: 'ZIP PNG',
    shortLabel: 'ZIP PNG',
    description: 'Archive standard en PNG, pratique pour un export propre.',
    extension: 'zip',
    archiveMime: 'application/zip',
    pageMime: 'image/png',
  },
  {
    value: 'zip-webp',
    label: 'ZIP WEBP',
    shortLabel: 'ZIP WEBP',
    description: 'Archive plus légère avec pages converties en WEBP.',
    extension: 'zip',
    archiveMime: 'application/zip',
    pageMime: 'image/webp',
    quality: 0.9,
  },
];

export function getArchiveFormatPreset(format: ArchiveFormat): ArchiveFormatPreset {
  const preset = ARCHIVE_FORMAT_PRESETS.find((item) => item.value === format);
  if (!preset) {
    return ARCHIVE_FORMAT_PRESETS[0];
  }
  return preset;
}
