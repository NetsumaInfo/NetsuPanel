import FileSaver from 'file-saver';
import type { AppMode, ChapterItem, ImageCandidate } from '@shared/types';
import { dataUrlToBytes } from '@shared/utils/dataUrl';
import { buildChapterArchiveName, buildChapterFolderName, buildGlobalArchiveName, buildPageEntryName } from '@core/download/fileNaming';
import { buildZipBlob, type ZipEntry } from '@core/download/zipBuilder';
import { Waifu2xRuntime } from '@core/upscale/waifu2xRuntime';
import { captureImage, fetchBinary } from './runtimeClient';

const DOWNLOAD_CONCURRENCY = 4;

function mimeToExtension(mime: string, fallback: string): string {
  const lower = mime.toLowerCase();
  if (lower.includes('avif')) return 'avif';
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  return fallback;
}

export async function resolveCandidateBytes(
  candidate: ImageCandidate,
  tabId: number,
  referrer?: string
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (candidate.previewUrl.startsWith('data:image/')) {
    return dataUrlToBytes(candidate.previewUrl);
  }

  if (/^https?:\/\//i.test(candidate.url)) {
    try {
      const resource = await fetchBinary(candidate.url, { referrer, tabId });
      return { bytes: resource.bytes, mime: resource.mime };
    } catch {
      if (candidate.origin === 'live-dom') {
        return captureImage(tabId, candidate.id);
      }
    }
  }

  if (candidate.origin === 'live-dom') {
    return captureImage(tabId, candidate.id);
  }

  throw new Error('Unable to resolve image bytes.');
}

export interface DownloadDependencies {
  tabId: number;
  waifuRuntime: Waifu2xRuntime;
  onProgress(message: string, progress: number): void;
  upscaleEnabled: boolean;
  mode: AppMode;
  sourceReferrer?: string;
}

async function maybeUpscale(
  bytes: ArrayBuffer,
  mime: string,
  cacheKey: string,
  dependencies: DownloadDependencies
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (!dependencies.upscaleEnabled) {
    return { bytes, mime };
  }

  const blob = await dependencies.waifuRuntime.upscale({
    cacheKey,
    bytes,
    mime,
    mode: dependencies.mode,
    onProgress: (message, progress) => {
      dependencies.onProgress(message, progress);
    },
  });

  return {
    bytes: await blob.arrayBuffer(),
    mime: blob.type || 'image/png',
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function buildEntries(
  images: ImageCandidate[],
  dependencies: DownloadDependencies,
  context: {
    referrer?: string;
    progressLabel: string;
    buildPath(index: number, image: ImageCandidate, mime: string): string;
    buildCacheKey(index: number, image: ImageCandidate): string;
  }
): Promise<ZipEntry[]> {
  let completed = 0;
  const concurrency = dependencies.upscaleEnabled ? 1 : DOWNLOAD_CONCURRENCY;

  return mapWithConcurrency(images, concurrency, async (image, index) => {
    const original = await resolveCandidateBytes(image, dependencies.tabId, context.referrer);
    const processed = await maybeUpscale(
      original.bytes,
      original.mime,
      context.buildCacheKey(index, image),
      dependencies
    );
    completed += 1;
    dependencies.onProgress(`${context.progressLabel} ${completed}/${images.length}`, completed / images.length);
    return {
      path: context.buildPath(index, image, processed.mime),
      bytes: processed.bytes,
    };
  });
}

export async function downloadGeneralSelection(
  title: string,
  images: ImageCandidate[],
  dependencies: DownloadDependencies
): Promise<void> {
  const entries = await buildEntries(images, dependencies, {
    referrer: dependencies.sourceReferrer,
    progressLabel: 'Preparing image',
    buildPath: (index, image, mime) => buildPageEntryName(index, images.length, mimeToExtension(mime, image.extensionHint)),
    buildCacheKey: (_index, image) => `${image.id}-${dependencies.mode}`,
  });

  const archive = await buildZipBlob(entries, 'application/zip');
  FileSaver.saveAs(archive, buildGlobalArchiveName(title, 'zip'));
}

export async function downloadSingleChapter(
  seriesTitle: string,
  chapter: ChapterItem,
  images: ImageCandidate[],
  format: 'cbz' | 'zip',
  dependencies: DownloadDependencies
): Promise<void> {
  const entries = await buildEntries(images, dependencies, {
    referrer: chapter.url,
    progressLabel: `Preparing ${chapter.label}:`,
    buildPath: (index, image, mime) => buildPageEntryName(index, images.length, mimeToExtension(mime, image.extensionHint)),
    buildCacheKey: (_index, image) => `${chapter.canonicalUrl}-${image.id}-${dependencies.mode}`,
  });

  const mime = format === 'cbz' ? 'application/vnd.comicbook+zip' : 'application/zip';
  const archive = await buildZipBlob(entries, mime);
  FileSaver.saveAs(archive, buildChapterArchiveName(seriesTitle, chapter.label, format));
}

export async function downloadAllChapters(
  seriesTitle: string,
  chapters: Array<{ chapter: ChapterItem; images: ImageCandidate[] }>,
  dependencies: DownloadDependencies
): Promise<void> {
  const entries: ZipEntry[] = [];

  for (const { chapter, images } of chapters) {
    const folder = buildChapterFolderName(chapter.label);
    const chapterEntries = await buildEntries(images, dependencies, {
      referrer: chapter.url,
      progressLabel: `Building ${chapter.label}:`,
      buildPath: (index, image, mime) => `${folder}/${buildPageEntryName(index, images.length, mimeToExtension(mime, image.extensionHint))}`,
      buildCacheKey: (_index, image) => `${chapter.canonicalUrl}-${image.id}-${dependencies.mode}`,
    });
    entries.push(...chapterEntries);
  }

  const archive = await buildZipBlob(entries, 'application/zip');
  FileSaver.saveAs(archive, buildGlobalArchiveName(seriesTitle, 'zip'));
}
