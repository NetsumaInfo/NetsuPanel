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

function previewFromCanvas(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

function previewFromImage(image: HTMLImageElement): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(image.naturalWidth || image.width || 1, 1);
    canvas.height = Math.max(image.naturalHeight || image.height || 1, 1);
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    if (image.currentSrc && !image.currentSrc.startsWith('blob:')) return image.currentSrc;
    if (image.src && !image.src.startsWith('blob:')) return image.src;
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
  const selected = descriptors
    .map((descriptor) => ({
      ...descriptor,
      resolved: resolveUrl(descriptor.value, baseUrl),
    }))
    .find((descriptor) => descriptor.resolved);
  if (!selected?.resolved) return null;

  const rect = image.getBoundingClientRect();
  const style = window.getComputedStyle(image);
  const id = `image-${domIndex}`;
  const captureStrategy =
    selected.resolved.startsWith('blob:') || selected.resolved.startsWith('data:') ? 'content' : 'network';
  capturables.set(id, image);

  return {
    id,
    url: selected.resolved,
    previewUrl: previewFromImage(image) || selected.resolved,
    captureStrategy,
    sourceKind: selected.sourceKind,
    origin: 'live-dom',
    width: image.naturalWidth || Math.round(rect.width),
    height: image.naturalHeight || Math.round(rect.height),
    domIndex,
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    altText: image.alt || '',
    titleText: image.title || '',
    containerSignature: buildContainerSignature(image),
    visible: isVisible(image, rect, style),
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
