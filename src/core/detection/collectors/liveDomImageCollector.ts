import type { RawImageCandidate } from '@shared/types';
import { resolveUrl } from '@shared/utils/url';
import { readBackgroundImageUrls, readImageSourceDescriptors } from './imageAttributeSources';
import { collectJsonEmbeddedImages } from './jsonEmbeddedCollector';
import { collectInlineScriptImages } from './inlineScriptCollector';

export type CapturableNode = HTMLImageElement | HTMLCanvasElement;

export interface LiveDomImageCollection {
  candidates: RawImageCandidate[];
  capturables: Map<string, CapturableNode>;
}

function buildContainerSignature(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element.parentElement;
  let depth = 0;

  while (current && depth < 3) {
    const classes = (current.className || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .join('.');
    segments.push(`${current.tagName.toLowerCase()}:${classes}`);
    current = current.parentElement;
    depth += 1;
  }

  return segments.join('>');
}

function isVisible(element: HTMLElement, rect: DOMRect, style: CSSStyleDeclaration): boolean {
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (Number(style.opacity) === 0) return false;
  return rect.width > 0 && rect.height > 0;
}

const THUMB_MAX = 200;

function thumbnailDimensions(srcW: number, srcH: number): [number, number] {
  if (srcW <= THUMB_MAX && srcH <= THUMB_MAX) return [srcW, srcH];
  const scale = Math.min(THUMB_MAX / srcW, THUMB_MAX / srcH);
  return [Math.round(srcW * scale) || 1, Math.round(srcH * scale) || 1];
}

function previewFromCanvas(canvas: HTMLCanvasElement): string {
  try {
    const [tw, th] = thumbnailDimensions(canvas.width, canvas.height);
    const thumb = document.createElement('canvas');
    thumb.width = tw;
    thumb.height = th;
    const ctx = thumb.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(canvas, 0, 0, tw, th);
    return thumb.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  }
}

function previewFromImage(image: HTMLImageElement): string {
  // For network-fetchable images, just use the URL — no data URI needed
  const networkUrl = image.currentSrc || image.src || '';
  if (networkUrl && !networkUrl.startsWith('blob:') && !networkUrl.startsWith('data:')) {
    return networkUrl;
  }

  // For blob:/data: images, generate a small thumbnail
  try {
    const srcW = Math.max(image.naturalWidth || image.width || 1, 1);
    const srcH = Math.max(image.naturalHeight || image.height || 1, 1);
    const [tw, th] = thumbnailDimensions(srcW, srcH);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(image, 0, 0, tw, th);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return '';
  }
}

function buildImageCandidate(
  image: HTMLImageElement,
  domIndex: number,
  baseUrl: string,
  capturables: Map<string, CapturableNode>
): RawImageCandidate | null {
  const descriptors = readImageSourceDescriptors(image);
  // Pick the best resolved URL: prefer data-src family (lazy-load source) over loaded src
  const resolved = descriptors
    .map((descriptor) => ({
      ...descriptor,
      resolved: resolveUrl(descriptor.value, baseUrl),
    }))
    .filter((descriptor) => descriptor.resolved);
  // Prefer the first data-attribute source (actual high-res), fall back to current/src
  const selected = resolved.find((d) => d.sourceKind.startsWith('data-')) || resolved[0];
  if (!selected?.resolved) return null;

  const rect = image.getBoundingClientRect();
  const style = window.getComputedStyle(image);
  const id = `image-${domIndex}`;
  const isBlobOrData = selected.resolved.startsWith('blob:') || selected.resolved.startsWith('data:');
  const captureStrategy = isBlobOrData ? 'content' : 'network';
  capturables.set(id, image);

  // For images not yet loaded (lazy), use data-width/data-height attributes as hints
  const naturalW = image.naturalWidth || Math.round(rect.width);
  const naturalH = image.naturalHeight || Math.round(rect.height);
  const width = naturalW || Number(image.getAttribute('data-width')) || Number(image.getAttribute('width')) || 0;
  const height = naturalH || Number(image.getAttribute('data-height')) || Number(image.getAttribute('height')) || 0;

  return {
    id,
    url: selected.resolved,
    previewUrl: previewFromImage(image) || selected.resolved,
    captureStrategy,
    sourceKind: selected.sourceKind,
    origin: 'live-dom',
    width,
    height,
    domIndex,
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    altText: image.alt || '',
    titleText: image.title || '',
    containerSignature: buildContainerSignature(image),
    visible: isVisible(image, rect, style) || (width > 0 && height > 0),
    diagnostics: [],
  };
}

function buildCanvasCandidate(
  canvas: HTMLCanvasElement,
  domIndex: number,
  capturables: Map<string, CapturableNode>
): RawImageCandidate | null {
  if (!canvas.width || !canvas.height) return null;
  const rect = canvas.getBoundingClientRect();
  const style = window.getComputedStyle(canvas);
  const id = `canvas-${domIndex}`;
  capturables.set(id, canvas);

  return {
    id,
    url: `content://canvas/${id}`,
    previewUrl: previewFromCanvas(canvas),
    captureStrategy: 'content',
    sourceKind: 'canvas',
    origin: 'live-dom',
    width: canvas.width,
    height: canvas.height,
    domIndex,
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    altText: '',
    titleText: canvas.getAttribute('aria-label') || '',
    containerSignature: buildContainerSignature(canvas),
    visible: isVisible(canvas, rect, style),
    diagnostics: [],
  };
}

function collectBackgroundCandidates(baseUrl: string, startIndex: number): RawImageCandidate[] {
  const elements = [...document.querySelectorAll<HTMLElement>('div, section, figure, article, span')].slice(0, 600);
  const results: RawImageCandidate[] = [];

  elements.forEach((element, index) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 140) return;

    const style = window.getComputedStyle(element);
    const urls = readBackgroundImageUrls(style.backgroundImage);
    const selected = urls
      .map((descriptor) => ({
        ...descriptor,
        resolved: resolveUrl(descriptor.value, baseUrl),
      }))
      .find((descriptor) => descriptor.resolved);
    if (!selected?.resolved) return;

    results.push({
      id: `background-${startIndex + index}`,
      url: selected.resolved,
      previewUrl: selected.resolved,
      captureStrategy: 'network',
      sourceKind: 'background-image',
      origin: 'live-dom',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      domIndex: startIndex + index,
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      altText: '',
      titleText: element.getAttribute('title') || '',
      containerSignature: buildContainerSignature(element),
      visible: isVisible(element, rect, style),
      diagnostics: [],
    });
  });

  return results;
}

export async function collectLiveDomImages(baseUrl: string): Promise<LiveDomImageCollection> {
  const capturables = new Map<string, CapturableNode>();
  const imageCandidates = [...document.querySelectorAll<HTMLImageElement>('img')]
    .map((image, index) => buildImageCandidate(image, index, baseUrl, capturables))
    .filter((candidate): candidate is RawImageCandidate => Boolean(candidate));

  const canvasOffset = imageCandidates.length;
  const canvasCandidates = [...document.querySelectorAll<HTMLCanvasElement>('canvas')]
    .map((canvas, index) => buildCanvasCandidate(canvas, canvasOffset + index, capturables))
    .filter((candidate): candidate is RawImageCandidate => Boolean(candidate));

  const backgroundOffset = canvasOffset + canvasCandidates.length;
  const backgroundCandidates = collectBackgroundCandidates(baseUrl, backgroundOffset);
  // Multi-strategy: JSON embedded + inline scripts
  const jsonCandidates = collectJsonEmbeddedImages(document, baseUrl);
  const scriptCandidates = collectInlineScriptImages(document, baseUrl);

  return {
    candidates: imageCandidates.concat(
      canvasCandidates,
      backgroundCandidates,
      jsonCandidates,
      scriptCandidates
    ),
    capturables,
  };
}
