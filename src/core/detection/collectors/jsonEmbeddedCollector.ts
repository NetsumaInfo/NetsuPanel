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

const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|avif|gif)(?:[?#][^\s"'<>]*)?/gi;

/** Clés JSON connues contenant des listes d'URLs de pages manga */
const PAGE_ARRAY_KEYS = new Set([
  'pages', 'images', 'imageList', 'image_list', 'imgs', 'img_list',
  'chapterImages', 'chapter_images', 'pageList', 'page_list',
  'data', 'files', 'cdn_list', 'urls',
]);

/** Clés JSON connues contenant une URL d'image individuelle */
const PAGE_URL_KEYS = new Set([
  'url', 'src', 'image', 'img', 'file', 'path', 'cdn_url',
  'imageUrl', 'image_url', 'img_url', 'page_url',
]);

function isImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('http')) return false;
  return /\.(jpe?g|png|webp|avif|gif)/i.test(value) || IMAGE_URL_RE.test(value);
}

/**
 * Walk a parsed JSON value recursively and collect image URLs with an optional
 * ordering hint derived from the JSON traversal order.
 */
function walkJson(
  node: unknown,
  collected: Array<{ url: string; order: number }>,
  depth = 0
): void {
  if (depth > 8) return; // avoid deep recursion on giant objects

  if (typeof node === 'string') {
    if (isImageUrl(node)) {
      collected.push({ url: node, order: collected.length });
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => walkJson(item, collected, depth + 1));
    return;
  }

  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (PAGE_ARRAY_KEYS.has(key) && Array.isArray(value)) {
        // Prioritize known page-array keys
        walkJson(value, collected, depth + 1);
      } else if (PAGE_URL_KEYS.has(key) && isImageUrl(value)) {
        collected.push({ url: value as string, order: collected.length });
      } else {
        walkJson(value, collected, depth + 1);
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

    // Fast pre-filter: must contain an image extension
    if (!/\.(jpe?g|png|webp|avif)/i.test(text)) continue;

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
