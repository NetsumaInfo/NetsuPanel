import type { RawImageCandidate } from '@shared/types';
import { resolveUrl } from '@shared/utils/url';
import { readBackgroundImageUrls, readImageSourceDescriptors } from './imageAttributeSources';

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

export function collectStaticDocumentImages(root: ParentNode, baseUrl: string): RawImageCandidate[] {
  const imageCandidates: RawImageCandidate[] = [];
  [...root.querySelectorAll<HTMLImageElement>('img')].forEach((image, index) => {
    const selected = readImageSourceDescriptors(image)
      .map((descriptor) => ({
        ...descriptor,
        resolved: resolveUrl(descriptor.value, baseUrl),
      }))
      .find((descriptor) => descriptor.resolved);
    if (!selected?.resolved) return;

    const width = Number(image.getAttribute('width')) || image.naturalWidth || 0;
    const height = Number(image.getAttribute('height')) || image.naturalHeight || 0;
    const inferredWidth = width || Number(image.getAttribute('data-width')) || 1080;
    const inferredHeight = height || Number(image.getAttribute('data-height')) || 1560;

    imageCandidates.push({
      id: `static-image-${index}`,
      url: selected.resolved,
      previewUrl: selected.resolved,
      captureStrategy: 'network',
      sourceKind: selected.sourceKind,
      origin: 'static-html',
      width: inferredWidth,
      height: inferredHeight,
      domIndex: index,
      top: index,
      left: 0,
      altText: image.alt || '',
      titleText: image.title || '',
      containerSignature: buildContainerSignature(image),
      visible: true,
      diagnostics: [],
    });
  });

  const backgroundOffset = imageCandidates.length;
  const backgroundCandidates: RawImageCandidate[] = [];
  [...root.querySelectorAll<HTMLElement>('[style*="background-image"]')].forEach((element, index) => {
    const selected = readBackgroundImageUrls(element.getAttribute('style') || '')
      .map((descriptor) => ({
        ...descriptor,
        resolved: resolveUrl(descriptor.value, baseUrl),
      }))
      .find((descriptor) => descriptor.resolved);
    if (!selected?.resolved) return;

    backgroundCandidates.push({
      id: `static-background-${backgroundOffset + index}`,
      url: selected.resolved,
      previewUrl: selected.resolved,
      captureStrategy: 'network',
      sourceKind: 'background-image',
      origin: 'static-html',
      width: Number(element.getAttribute('width')) || 960,
      height: Number(element.getAttribute('height')) || 1440,
      domIndex: backgroundOffset + index,
      top: backgroundOffset + index,
      left: 0,
      altText: '',
      titleText: element.getAttribute('title') || '',
      containerSignature: buildContainerSignature(element),
      visible: true,
      diagnostics: [],
    });
  });

  return imageCandidates.concat(backgroundCandidates);
}
