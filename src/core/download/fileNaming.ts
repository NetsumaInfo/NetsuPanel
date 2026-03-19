import { sanitizeFileName, slugify } from '@shared/utils/strings';

export function buildPageEntryName(index: number, total: number, extension: string): string {
  const padLength = Math.max(1, String(total).length);
  return `${String(index + 1).padStart(padLength, '0')}.${extension}`;
}

export function buildChapterArchiveName(seriesTitle: string, chapterTitle: string, extension: 'cbz' | 'zip'): string {
  return sanitizeFileName(`${seriesTitle} - ${chapterTitle}.${extension}`);
}

export function buildGlobalArchiveName(seriesTitle: string, extension: 'cbz' | 'zip'): string {
  return sanitizeFileName(`${seriesTitle}.${extension}`);
}

export function buildChapterFolderName(chapterTitle: string): string {
  return slugify(chapterTitle);
}
