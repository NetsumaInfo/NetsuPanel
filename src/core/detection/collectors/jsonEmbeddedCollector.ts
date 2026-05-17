/**
 * jsonEmbeddedCollector.ts
 *
 * Collecte des URLs d'images depuis les données JSON embarquées dans la page :
 * - Balises <script type="application/json"> ou <script type="application/ld+json">
 * - Variables JS inline contenant des URLs d'images
 * - Propriétés communes : pages, images, images_urls, chapter_data, etc.
 *
 * Stratégie : extract → parse JSON → walk recursively → filter URLs image
 */

import type { RawImageCandidate } from '@shared/types';

const IMAGE_URL_RE = /https?:\/\/[^\s"'<>\\]+\.(?:jpe?g|png|webp|avif|gif|bmp|tiff?)(?:[?#][^\s"'<>\\]*)?/gi;
// Looser: catch CDN URLs whose extension is in the querystring (e.g. /img?file=foo.jpg)
const QUERY_EXT_URL_RE = /https?:\/\/[^\s"'<>\\]+\?[^\s"'<>\\]*\.(?:jpe?g|png|webp|avif|gif|bmp)(?:[&\s"'<>\\]|$)/gi;
const IMAGE_EXT_HINT_RE = /\.(?:jpe?g|png|webp|avif|gif|bmp|tiff?)\b/i;

/** Clés JSON connues contenant des listes d'URLs de pages manga (lowercased) */
const PAGE_ARRAY_KEYS = new Set([
  'pages', 'images', 'imagelist', 'image_list', 'imgs', 'img_list',
  'chapterimages', 'chapter_images', 'pagelist', 'page_list',
  'data', 'files', 'cdn_list', 'urls', 'sources', 'srcs',
]);

/** Clés JSON connues contenant une URL d'image individuelle (lowercased) */
const PAGE_URL_KEYS = new Set([
  'url', 'src', 'image', 'img', 'file', 'path', 'cdn_url',
  'imageurl', 'image_url', 'img_url', 'page_url', 'contenturl', 'thumbnailurl',
]);

function isImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('http') && !value.startsWith('//')) return false;
  return IMAGE_EXT_HINT_RE.test(value);
}

// Used when walking known image-array keys: accept any http URL even without extension,
// because manga CDNs frequently serve images via opaque proxy paths.
function isProbableImageUrlInKnownContext(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('http') && !value.startsWith('//')) return false;
  // Reject obvious non-image asset URLs.
  if (/\.(?:m?js|css|html?|json|xml|txt)(?:$|[?#])/i.test(value)) return false;
  return true;
}

/**
 * Walk a parsed JSON value recursively and collect image URLs with an optional
 * ordering hint derived from the JSON traversal order.
 */
function walkJson(
  node: unknown,
  collected: Array<{ url: string; order: number }>,
  depth = 0,
  trusted = false
): void {
  if (depth > 10) return; // avoid deep recursion on giant objects

  if (typeof node === 'string') {
    if (trusted ? isProbableImageUrlInKnownContext(node) : isImageUrl(node)) {
      collected.push({ url: node, order: collected.length });
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => walkJson(item, collected, depth + 1, trusted));
    return;
  }

  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (PAGE_ARRAY_KEYS.has(lowerKey) && Array.isArray(value)) {
        // Trust strings within known image-array keys even without extension.
        walkJson(value, collected, depth + 1, true);
      } else if (PAGE_URL_KEYS.has(lowerKey) && (isImageUrl(value) || (trusted && isProbableImageUrlInKnownContext(value)))) {
        collected.push({ url: value as string, order: collected.length });
      } else {
        walkJson(value, collected, depth + 1, trusted);
      }
    }
  }
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Extract image URLs from all JSON-bearing script tags.
 */
export function collectJsonEmbeddedImages(
  document: ParentNode,
  baseUrl: string
): RawImageCandidate[] {
  const scripts = Array.from(
    (document as Document).querySelectorAll<HTMLScriptElement>(
      'script[type="application/json"], script[type="application/ld+json"], script:not([src])'
    )
  );

  const allFound: Array<{ url: string; order: number; scriptIndex: number }> = [];

  for (const [scriptIndex, script] of scripts.entries()) {
    const text = script.textContent?.trim() ?? '';
    if (!text || text.length < 20) continue;

    // Fast pre-filter: text must look image-related to avoid parsing every JSON blob.
    const hasExtHint = IMAGE_EXT_HINT_RE.test(text);
    const hasArrayKeyHint = /\b(?:pages|images|imageList|image_list|imgs|img_list|chapterImages|chapter_images|pageList|page_list|cdn_list)\b/i.test(text);
    if (!hasExtHint && !hasArrayKeyHint) continue;

    const parsed = parseJsonSafe(text);
    if (parsed !== null) {
      const before = allFound.length;
      const localFound: Array<{ url: string; order: number }> = [];
      walkJson(parsed, localFound);
      localFound.forEach((item, index) => {
        allFound.push({
          url: item.url,
          order: before + index,
          scriptIndex,
        });
      });
    } else {
      // Fallback: regex on raw text for non-JSON scripts (JS variable assignments)
      IMAGE_URL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMAGE_URL_RE.exec(text)) !== null) {
        allFound.push({ url: m[0], order: allFound.length, scriptIndex });
      }
      QUERY_EXT_URL_RE.lastIndex = 0;
      let q: RegExpExecArray | null;
      while ((q = QUERY_EXT_URL_RE.exec(text)) !== null) {
        const raw = q[0].replace(/[&,\s"'<>\\]+$/, '');
        allFound.push({ url: raw, order: allFound.length, scriptIndex });
      }
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const candidates: RawImageCandidate[] = [];

  for (const { url, order, scriptIndex } of allFound) {
    let resolvedUrl = url;
    try {
      resolvedUrl = new URL(url, baseUrl).href;
    } catch { /* keep original */ }

    if (seen.has(resolvedUrl)) continue;
    seen.add(resolvedUrl);

    candidates.push({
      id: `json-embed-${order}`,
      url: resolvedUrl,
      previewUrl: resolvedUrl,
      captureStrategy: 'network',
      sourceKind: 'json-embedded',
      origin: 'live-dom',
      width: 0,
      height: 0,
      domIndex: order,
      top: 0,
      left: 0,
      altText: '',
      titleText: '',
      containerSignature: `script:json-${scriptIndex}`,
      visible: false,
      diagnostics: [],
    });
  }

  return candidates;
}
