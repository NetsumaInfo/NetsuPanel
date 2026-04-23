import type { RawImageCandidate } from '@shared/types';
import { isPlaceholderImageUrl, resolveUrl, shouldPreserveImageProxyUrl, unwrapProxiedImageUrl } from '@shared/utils/url';
import { readBackgroundImageUrls, readImageSourceDescriptors } from './imageAttributeSources';
import { collectJsonEmbeddedImages } from './jsonEmbeddedCollector';
import { collectInlineScriptImages } from './inlineScriptCollector';

export type CapturableNode = HTMLImageElement | HTMLCanvasElement;

export interface LiveDomImageCollection {
  candidates: RawImageCandidate[];
  capturables: Map<string, CapturableNode>;
}

export interface LiveDomCollectionOptions {
  includeBackgroundCandidates?: boolean;
  includeSvgCandidates?: boolean;
  includeMediaCandidates?: boolean;
  includeCssRuleCandidates?: boolean;
  includeScriptCandidates?: boolean;
}

const DEFAULT_COLLECTION_OPTIONS: Required<LiveDomCollectionOptions> = {
  includeBackgroundCandidates: true,
  includeSvgCandidates: true,
  includeMediaCandidates: true,
  includeCssRuleCandidates: true,
  includeScriptCandidates: true,
};

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

function previewFromImage(image: HTMLImageElement, preferredUrl: string): string {
  const shouldInlinePreview =
    shouldPreserveImageProxyUrl(preferredUrl) ||
    /^blob:/i.test(preferredUrl) ||
    /^data:/i.test(preferredUrl);

  try {
    const srcW = Math.max(image.naturalWidth || image.width || 1, 1);
    const srcH = Math.max(image.naturalHeight || image.height || 1, 1);
    if (shouldInlinePreview && srcW > 1 && srcH > 1) {
      const [tw, th] = thumbnailDimensions(srcW, srcH);
      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(image, 0, 0, tw, th);
        const preview = canvas.toDataURL('image/jpeg', 0.6);
        if (preview) return preview;
      }
    }
  } catch {
    // Cross-origin or protected images can taint canvas; fall back to URL.
  }

  if (preferredUrl && !preferredUrl.startsWith('blob:') && !preferredUrl.startsWith('data:') && !isPlaceholderImageUrl(preferredUrl)) {
    return preferredUrl;
  }

  const rawNetworkUrl = image.currentSrc || image.src || '';
  const networkUrl = shouldPreserveImageProxyUrl(rawNetworkUrl)
    ? rawNetworkUrl
    : unwrapProxiedImageUrl(rawNetworkUrl);
  if (networkUrl && !networkUrl.startsWith('blob:') && !networkUrl.startsWith('data:') && !isPlaceholderImageUrl(networkUrl)) {
    return networkUrl;
  }

  return '';
}

function buildImageCandidate(
  image: HTMLImageElement,
  domIndex: number,
  baseUrl: string,
  capturables: Map<string, CapturableNode>
): RawImageCandidate | null {
  const descriptors = readImageSourceDescriptors(image);
  // Pick the best resolved URL: prefer data-src family (lazy-load source) over loaded src
  // Filter ensures resolved is non-null; cast to help TypeScript narrow the type.
  const resolved = descriptors
    .map((descriptor) => ({
      ...descriptor,
      resolved: resolveUrl(descriptor.value, baseUrl) as string,
    }))
    .filter((descriptor) => Boolean(descriptor.resolved));

  // Check if current src is a Cloudflare placeholder — if so, skip src/currentSrc
  const currentSrcValue = image.currentSrc || image.src || '';
  const srcIsPlaceholder = isPlaceholderImageUrl(currentSrcValue);

  // Prefer the first data-attribute source (actual high-res)
  // If current src is a Cloudflare placeholder, skip src/currentSrc entries
  const dataAttrCandidate = resolved.find((d) => d.sourceKind.startsWith('data-') && !isPlaceholderImageUrl(d.resolved));
  const nonPlaceholderFallback = resolved.find((d) => !isPlaceholderImageUrl(d.resolved));
  const selected = dataAttrCandidate || (srcIsPlaceholder ? null : nonPlaceholderFallback) || nonPlaceholderFallback;
  if (!selected?.resolved) return null;

  const rect = image.getBoundingClientRect();
  const style = window.getComputedStyle(image);
  const id = `image-${domIndex}`;
  const selectedUrl = shouldPreserveImageProxyUrl(selected.resolved)
    ? selected.resolved
    : unwrapProxiedImageUrl(selected.resolved);
  const isBlobOrData = selectedUrl.startsWith('blob:') || selectedUrl.startsWith('data:');
  const captureStrategy = isBlobOrData ? 'content' : 'network';
  capturables.set(id, image);

  // For images not yet loaded (lazy), use data-width/data-height attributes as hints
  const naturalW = image.naturalWidth || Math.round(rect.width);
  const naturalH = image.naturalHeight || Math.round(rect.height);
  const width = naturalW || Number(image.getAttribute('data-width')) || Number(image.getAttribute('width')) || 0;
  const height = naturalH || Number(image.getAttribute('data-height')) || Number(image.getAttribute('height')) || 0;

  return {
    id,
    url: selectedUrl,
    previewUrl: isPlaceholderImageUrl(selectedUrl) ? '' : (previewFromImage(image, selectedUrl) || selectedUrl),
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
    if (rect.width < 72 || rect.height < 72) return;

    const style = window.getComputedStyle(element);
    const urls = readBackgroundImageUrls(style.backgroundImage);
    const selected = urls
      .map((descriptor) => ({
        ...descriptor,
        resolved: resolveUrl(descriptor.value, baseUrl),
      }))
      .find((descriptor) => descriptor.resolved);
    if (!selected?.resolved) return;
    if (/^data:image\/svg\+xml/i.test(selected.resolved)) return;

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


function svgToDataUrl(svg: SVGSVGElement): string {
  try {
    const serialized = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  } catch {
    return '';
  }
}

/** Collect inline <svg> elements as image candidates */
function collectSvgCandidates(startIndex: number): RawImageCandidate[] {
  const results: RawImageCandidate[] = [];
  [...document.querySelectorAll<SVGSVGElement>('svg')].forEach((svg, index) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return; // Skip tiny inline icons
    const dataUrl = svgToDataUrl(svg);
    if (!dataUrl) return;

    const style = window.getComputedStyle(svg);
    results.push({
      id: `svg-${startIndex + index}`,
      url: dataUrl,
      previewUrl: dataUrl,
      captureStrategy: 'content',
      sourceKind: 'inline-svg',
      origin: 'live-dom',
      width: Math.round(rect.width) || svg.width?.baseVal?.value || 0,
      height: Math.round(rect.height) || svg.height?.baseVal?.value || 0,
      domIndex: startIndex + index,
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      altText: svg.getAttribute('aria-label') || svg.getAttribute('title') || '',
      titleText: '',
      containerSignature: buildContainerSignature(svg),
      visible: isVisible(svg as unknown as HTMLElement, rect, style),
      diagnostics: [],
    });
  });
  return results;
}

/** Collect <video poster>, <embed src>, <object data> image references */
function collectMediaCandidates(baseUrl: string, startIndex: number): RawImageCandidate[] {
  const results: RawImageCandidate[] = [];

  [...document.querySelectorAll<HTMLVideoElement>('video[poster]')].forEach((video, index) => {
    const poster = resolveUrl(video.getAttribute('poster') || '', baseUrl);
    if (!poster) return;
    const rect = video.getBoundingClientRect();
    results.push({
      id: `video-poster-${startIndex + index}`,
      url: poster,
      previewUrl: poster,
      captureStrategy: 'network',
      sourceKind: 'video-poster',
      origin: 'live-dom',
      width: Math.round(rect.width) || video.videoWidth || 0,
      height: Math.round(rect.height) || video.videoHeight || 0,
      domIndex: startIndex + index,
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      altText: video.getAttribute('aria-label') || '',
      titleText: video.getAttribute('title') || '',
      containerSignature: buildContainerSignature(video),
      visible: true,
      diagnostics: [],
    });
  });

  // <picture> <source> elements — often contain higher-res images
  [...document.querySelectorAll<HTMLSourceElement>('picture source[srcset], picture source[src]')].forEach((source, index) => {
    const raw = source.getAttribute('srcset') || source.getAttribute('src') || '';
    const first = raw.split(',')[0].trim().split(/\s+/)[0];
    const resolved = resolveUrl(first, baseUrl);
    if (!resolved) return;
    const picture = source.closest('picture');
    const img = picture?.querySelector('img');
    const rect = img?.getBoundingClientRect() || source.getBoundingClientRect();
    results.push({
      id: `picture-source-${startIndex + 1000 + index}`,
      url: resolved,
      previewUrl: resolved,
      captureStrategy: 'network',
      sourceKind: 'picture-source',
      origin: 'live-dom',
      width: img?.naturalWidth || Math.round(rect.width) || 0,
      height: img?.naturalHeight || Math.round(rect.height) || 0,
      domIndex: startIndex + 1000 + index,
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      altText: img?.alt || '',
      titleText: img?.title || '',
      containerSignature: buildContainerSignature(source),
      visible: true,
      diagnostics: [],
    });
  });

  return results;
}

/** Parse CSS background-image URLs from <style> tag rules */
function collectCssStyleTagCandidates(baseUrl: string, startIndex: number): RawImageCandidate[] {
  const results: RawImageCandidate[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheets blocked
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const bg = rule.style?.backgroundImage;
        if (!bg || bg === 'none') continue;
        const descriptors = readBackgroundImageUrls(bg);
        for (const descriptor of descriptors) {
          const resolved = resolveUrl(descriptor.value, baseUrl);
          if (!resolved) continue;
          results.push({
            id: `css-bg-${startIndex + results.length}`,
            url: resolved,
            previewUrl: resolved,
            captureStrategy: 'network',
            sourceKind: 'css-background',
            origin: 'live-dom',
            width: 0,
            height: 0,
            domIndex: startIndex + results.length,
            top: 0,
            left: 0,
            altText: '',
            titleText: rule.selectorText || '',
            containerSignature: 'css-rule',
            visible: true,
            diagnostics: [],
          });
        }
      }
    }
  } catch {
    // Ignore stylesheet access errors
  }
  return results;
}

/**
 * Collect images hidden inside <noscript> tags.
 * Cloudflare Mirage and some WP lazy-loaders place the real <img> inside <noscript>.
 */
function collectNoscriptCandidates(baseUrl: string, startIndex: number): RawImageCandidate[] {
  const results: RawImageCandidate[] = [];
  const noscripts = [...document.querySelectorAll<HTMLElement>('noscript')];

  noscripts.forEach((ns, index) => {
    const html = ns.textContent || ns.innerHTML || '';
    if (!html.includes('<img')) return;

    // Parse the noscript content to extract img src
    const srcMatch = html.match(/src=["']([^"']+)["']/i);
    const dataSrcMatch = html.match(/data-src=["']([^"']+)["']/i);
    const raw = dataSrcMatch?.[1] || srcMatch?.[1] || '';
    if (!raw) return;

    const resolved = resolveUrl(raw, baseUrl);
    if (!resolved || resolved.startsWith('data:')) return;

    // Extract width/height hints from noscript html
    const widthMatch = html.match(/(?:width|data-width)=["']?(\d+)["']?/i);
    const heightMatch = html.match(/(?:height|data-height)=["']?(\d+)["']?/i);
    const altMatch = html.match(/alt=["']([^"']*)["']/i);
    const width = widthMatch ? Number(widthMatch[1]) : 0;
    const height = heightMatch ? Number(heightMatch[1]) : 0;

    results.push({
      id: `noscript-${startIndex + index}`,
      url: resolved,
      previewUrl: resolved,
      captureStrategy: 'network',
      sourceKind: 'noscript-img',
      origin: 'live-dom',
      width,
      height,
      domIndex: startIndex + index,
      top: 0,
      left: 0,
      altText: altMatch?.[1] || '',
      titleText: '',
      containerSignature: buildContainerSignature(ns),
      visible: true,
      diagnostics: [],
    });
  });

  return results;
}

export async function collectLiveDomImages(
  baseUrl: string,
  options: LiveDomCollectionOptions = {}
): Promise<LiveDomImageCollection> {
  const settings = {
    ...DEFAULT_COLLECTION_OPTIONS,
    ...options,
  };
  const capturables = new Map<string, CapturableNode>();
  const imageCandidates = [...document.querySelectorAll<HTMLImageElement>('img')]
    .map((image, index) => buildImageCandidate(image, index, baseUrl, capturables))
    .filter((candidate): candidate is RawImageCandidate => Boolean(candidate));

  const canvasOffset = imageCandidates.length;
  const canvasCandidates = [...document.querySelectorAll<HTMLCanvasElement>('canvas')]
    .map((canvas, index) => buildCanvasCandidate(canvas, canvasOffset + index, capturables))
    .filter((candidate): candidate is RawImageCandidate => Boolean(candidate));

  const backgroundOffset = canvasOffset + canvasCandidates.length;
  const backgroundCandidates = settings.includeBackgroundCandidates
    ? collectBackgroundCandidates(baseUrl, backgroundOffset)
    : [];

  const svgOffset = backgroundOffset + backgroundCandidates.length;
  const svgCandidates = settings.includeSvgCandidates ? collectSvgCandidates(svgOffset) : [];

  const mediaOffset = svgOffset + svgCandidates.length;
  const mediaCandidates = settings.includeMediaCandidates
    ? collectMediaCandidates(baseUrl, mediaOffset)
    : [];

  const cssOffset = mediaOffset + mediaCandidates.length;
  const cssCandidates = settings.includeCssRuleCandidates
    ? collectCssStyleTagCandidates(baseUrl, cssOffset)
    : [];

  // Noscript candidates: Cloudflare Mirage hides real images in <noscript>
  const noscriptOffset = cssOffset + cssCandidates.length;
  const noscriptCandidates = collectNoscriptCandidates(baseUrl, noscriptOffset);

  // Multi-strategy: JSON embedded + inline scripts
  const jsonCandidates = settings.includeScriptCandidates ? collectJsonEmbeddedImages(document, baseUrl) : [];
  const scriptCandidates = settings.includeScriptCandidates ? collectInlineScriptImages(document, baseUrl) : [];

  return {
    candidates: imageCandidates.concat(
      canvasCandidates,
      backgroundCandidates,
      svgCandidates,
      mediaCandidates,
      cssCandidates,
      noscriptCandidates,
      jsonCandidates,
      scriptCandidates
    ),
    capturables,
  };
}
