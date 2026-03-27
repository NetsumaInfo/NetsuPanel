import type { RawImageCandidate } from '@shared/types';
import { resolveUrl } from '@shared/utils/url';
import { readImageSourceDescriptors } from './imageAttributeSources';

function isPlaceholderSrc(src: string): boolean {
  if (!src) return true;
  if (src.startsWith('data:image/svg+xml')) return true;
  if (src.startsWith('data:image/gif;base64,R0lGOD')) return true;
  if (src.includes('data:image/png;base64,iVBORw0KGgoAAAANS')) return true;
  return /\/cdn-cgi\/mirage\/|rocket-loader|cloudflare-static/i.test(src);
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

export function collectStaticDocumentImages(root: ParentNode, baseUrl: string): RawImageCandidate[] {
  const imageCandidates: RawImageCandidate[] = [];
  [...root.querySelectorAll<HTMLImageElement>('img')].forEach((image, index) => {
    const descriptors = readImageSourceDescriptors(image)
      .map((descriptor) => ({
        ...descriptor,
        resolved: resolveUrl(descriptor.value, baseUrl),
      }))
      .filter((descriptor) => Boolean(descriptor.resolved));
    const selected = descriptors.find(
      (descriptor) =>
        descriptor.resolved &&
        !isPlaceholderSrc(descriptor.resolved) &&
        !/^data:image\/svg\+xml/i.test(descriptor.resolved) &&
        !/\.svg(?:$|[?#])/i.test(descriptor.resolved)
    ) || descriptors.find(
      (descriptor) =>
        descriptor.resolved &&
        !/^data:image\/svg\+xml/i.test(descriptor.resolved) &&
        !/\.svg(?:$|[?#])/i.test(descriptor.resolved)
    );
    if (!selected?.resolved) return;

    const width = Number(image.getAttribute('width')) || image.naturalWidth || 0;
    const height = Number(image.getAttribute('height')) || image.naturalHeight || 0;
    const inferredWidth = width || Number(image.getAttribute('data-width')) || 1080;
    const inferredHeight = height || Number(image.getAttribute('data-height')) || 1560;

    imageCandidates.push({
      id: `static-image-${index}`,
      url: selected.resolved,
      previewUrl: selected.resolved,
      referrer: baseUrl,
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

  return imageCandidates;
}
