import FileSaver from 'file-saver';
import type { AppMode, ArchiveFormat, ChapterItem, ImageCandidate, UpscaleSettings } from '@shared/types';
import { dataUrlToBytes } from '@shared/utils/dataUrl';
import { sanitizeFileName } from '@shared/utils/strings';
import { buildChapterArchiveName, buildChapterFolderName, buildGlobalArchiveName, buildPageEntryName } from '@core/download/fileNaming';
import { getArchiveFormatPreset } from '@core/download/archiveFormats';
import { transcodeImageBytes } from '@core/download/imageTranscode';
import { buildZipBlob, type ZipEntry } from '@core/download/zipBuilder';
import { Waifu2xRuntime } from '@core/upscale/waifu2xRuntime';
import { captureImage, fetchBinary, fetchDocument } from './runtimeClient';

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

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, '');
}

function applyUrlTransform(url: string, transform?: ImageCandidate['transform']): string {
  if (!transform) return url;

  try {
    const parsed = new URL(url);
    if (transform === 'unwrap-src-proxy') {
      const source = parsed.searchParams.get('src');
      return source && /^https?:\/\//i.test(source) ? source : parsed.href;
    }
    if (transform === 'strip-wordpress-cdn') {
      const source = parsed.searchParams.get('src');
      if (source && /^https?:\/\//i.test(source)) {
        return source;
      }
      return parsed.href.replace(/\/\/i\d+\.wp\.com\//i, '//');
    }
    return parsed.href;
  } catch {
    return url;
  }
}

async function descrambleSpeedBinb(
  candidate: ImageCandidate,
  tabId: number,
  referrer?: string
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const configText = await fetchDocument(candidate.url, { referrer, tabId });
  const config = JSON.parse(configText) as {
    resources?: { i?: { src?: string } };
    views?: Array<{ width: number; height: number; coords: string[] }>;
  };
  const imageUrl = config.resources?.i?.src ? new URL(config.resources.i.src, candidate.url).href : '';
  const view = config.views?.[0];

  if (!imageUrl || !view?.coords?.length) {
    throw new Error('Configuration SpeedBinb invalide ou incomplete.');
  }

  const resource = await fetchBinary(imageUrl, { referrer: candidate.url, tabId });
  const bitmap = await createImageBitmap(new Blob([resource.bytes], { type: resource.mime }));
  const canvas = document.createElement('canvas');
  canvas.width = view.width;
  canvas.height = view.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Contexte canvas indisponible pour SpeedBinb.');
  }

  for (const part of view.coords) {
    const values = part.split(/[:,+>]/).map((value) => Number(value));
    if (values.length < 7 || values.some((value) => Number.isNaN(value))) continue;
    const [, sourceX, sourceY, partWidth, partHeight, targetX, targetY] = values;
    context.drawImage(bitmap, sourceX, sourceY, partWidth, partHeight, targetX, targetY, partWidth, partHeight);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error('Rendu canvas SpeedBinb impossible.'));
        return;
      }
      resolve(value);
    }, 'image/png');
  });

  return {
    bytes: await blob.arrayBuffer(),
    mime: blob.type || 'image/png',
  };
}

export async function resolveCandidateBytes(
  candidate: ImageCandidate,
  tabId: number,
  referrer?: string
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const effectiveReferrer = candidate.referrer || referrer;

  if (candidate.previewUrl.startsWith('data:image/')) {
    return dataUrlToBytes(candidate.previewUrl);
  }

  if (candidate.transform === 'descramble-speedbinb') {
    return descrambleSpeedBinb(candidate, tabId, effectiveReferrer);
  }

  const effectiveUrl = applyUrlTransform(candidate.url, candidate.transform);

  if (/^https?:\/\//i.test(effectiveUrl)) {
    try {
      const resource = await fetchBinary(effectiveUrl, {
        referrer: effectiveReferrer,
        headers: candidate.headers,
        tabId,
      });
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

  throw new Error('Impossible de récupérer les données de l’image.');
}

export interface DownloadDependencies {
  tabId: number;
  waifuRuntime: Waifu2xRuntime;
  onProgress(message: string, progress: number): void;
  upscaleEnabled: boolean;
  mode: AppMode;
  settings: UpscaleSettings;
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
    settings: dependencies.settings,
    useCache: false,
    onProgress: (message, progress) => {
      dependencies.onProgress(message, progress);
    },
  });

  return {
    bytes: await blob.arrayBuffer(),
    mime: blob.type || 'image/png',
  };
}

async function maybeConvertForArchiveFormat(
  bytes: ArrayBuffer,
  mime: string,
  format: ArchiveFormat
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const preset = getArchiveFormatPreset(format);
  if (!preset.pageMime) {
    return { bytes, mime };
  }

  return transcodeImageBytes(bytes, mime, preset.pageMime, preset.quality);
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
  format: ArchiveFormat,
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
    const upscaled = await maybeUpscale(
      original.bytes,
      original.mime,
      context.buildCacheKey(index, image),
      dependencies
    );
    const processed = await maybeConvertForArchiveFormat(upscaled.bytes, upscaled.mime, format);
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
  format: ArchiveFormat,
  dependencies: DownloadDependencies
): Promise<void> {
  const preset = getArchiveFormatPreset(format);
  const entries = await buildEntries(images, format, dependencies, {
    referrer: dependencies.sourceReferrer,
    progressLabel: 'Préparation image',
    buildPath: (index, image, mime) => buildPageEntryName(index, images.length, mimeToExtension(mime, image.extensionHint)),
    buildCacheKey: (_index, image) => `${image.id}-${dependencies.mode}`,
  });

  const archive = await buildZipBlob(entries, preset.archiveMime);
  FileSaver.saveAs(archive, buildGlobalArchiveName(title, preset.extension));
}

export async function downloadSingleChapter(
  seriesTitle: string,
  chapter: ChapterItem,
  images: ImageCandidate[],
  format: ArchiveFormat,
  dependencies: DownloadDependencies
): Promise<void> {
  const preset = getArchiveFormatPreset(format);
  const entries = await buildEntries(images, format, dependencies, {
    referrer: chapter.url,
    progressLabel: `${chapter.label}:`,
    buildPath: (index, image, mime) => buildPageEntryName(index, images.length, mimeToExtension(mime, image.extensionHint)),
    buildCacheKey: (_index, image) => `${chapter.canonicalUrl}-${image.id}-${dependencies.mode}`,
  });

  const archive = await buildZipBlob(entries, preset.archiveMime);
  FileSaver.saveAs(archive, buildChapterArchiveName(seriesTitle, chapter.label, preset.extension));
}

export async function downloadSingleImage(
  image: ImageCandidate,
  format: ArchiveFormat,
  dependencies: DownloadDependencies,
  context?: {
    referrer?: string;
    fileName?: string;
  }
): Promise<void> {
  const original = await resolveCandidateBytes(image, dependencies.tabId, context?.referrer);
  const upscaled = await maybeUpscale(
    original.bytes,
    original.mime,
    `${image.id}-${dependencies.mode}-single`,
    dependencies
  );
  const processed = await maybeConvertForArchiveFormat(upscaled.bytes, upscaled.mime, format);
  dependencies.onProgress('Préparation image 1/1', 1);

  const extension = mimeToExtension(processed.mime, image.extensionHint);
  const baseName = stripExtension(context?.fileName || image.filenameHint || image.id);
  const fileName = sanitizeFileName(`${baseName}.${extension}`);
  FileSaver.saveAs(new Blob([processed.bytes], { type: processed.mime }), fileName);
}

export async function downloadAllChapters(
  seriesTitle: string,
  chapters: Array<{ chapter: ChapterItem; images: ImageCandidate[] }>,
  format: ArchiveFormat,
  dependencies: DownloadDependencies
): Promise<void> {
  const preset = getArchiveFormatPreset(format);
  const entries: ZipEntry[] = [];

  for (const { chapter, images } of chapters) {
    const folder = buildChapterFolderName(chapter.label);
    const chapterEntries = await buildEntries(images, format, dependencies, {
      referrer: chapter.url,
      progressLabel: `${chapter.label}:`,
      buildPath: (index, image, mime) => `${folder}/${buildPageEntryName(index, images.length, mimeToExtension(mime, image.extensionHint))}`,
      buildCacheKey: (_index, image) => `${chapter.canonicalUrl}-${image.id}-${dependencies.mode}`,
    });
    entries.push(...chapterEntries);
  }

  const archive = await buildZipBlob(entries, preset.archiveMime);
  FileSaver.saveAs(archive, buildGlobalArchiveName(seriesTitle, preset.extension));
}
