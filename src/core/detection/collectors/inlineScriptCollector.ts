/**
 * inlineScriptCollector.ts
 *
 * Collecte des URLs d'images depuis les scripts inline JavaScript.
 * Cible spécifiquement les patterns courants dans les readers manga :
 *  - var pages = ["url1", "url2", ...]
 *  - const images = [{url: "..."}, ...]
 *  - window.__initialState__ = {...}
 *  - nuxt/next data islands : __NUXT__ / __NEXT_DATA__
 */

import type { RawImageCandidate } from '@shared/types';

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|avif|gif)/i;
const FULL_URL_RE = /https?:\/\/[^\s"'`\\<>]+\.(?:jpe?g|png|webp|avif|gif)(?:[?#][^\s"'`\\<>]*)?/gi;

/**
 * Known global variable patterns where manga readers embed page data.
 * We use regex to extract the value part, then collect URLs from it.
 */
const GLOBAL_VAR_PATTERNS: RegExp[] = [
  // WordPress manga / generic
  /(?:var|let|const)\s+(?:pages|images?|chapter_images?|page_list|img_list)\s*=\s*(\[.*?\])\s*;/is,
  // Nuxt
  /window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i,
  // Next.js
  /"pageProps"\s*:\s*(\{[\s\S]*?\})\s*(?:,"__N_SSP"|\})/,
  // Bilibili / custom
  /window\.__initialState__\s*=\s*(\{[\s\S]*?\})\s*;/i,
  // Simple array assignment
  /(?:var|let|const)\s+\w+\s*=\s*(\[(?:"[^"]*"|'[^']*')[,\s]*(?:"[^"]*"|'[^']*')*\])/g,
];

function extractUrlsFromText(text: string): string[] {
  FULL_URL_RE.lastIndex = 0;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = FULL_URL_RE.exec(text)) !== null) {
    if (IMAGE_EXT_RE.test(m[0])) {
      urls.push(m[0]);
    }
  }
  return urls;
}

function extractUrlsFromJsonString(jsonStr: string): string[] {
  if (!jsonStr) return [];
  if (!IMAGE_EXT_RE.test(jsonStr)) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    const found: string[] = [];
    (function walk(node: unknown, depth: number): void {
      if (depth > 10) return;
      if (typeof node === 'string' && IMAGE_EXT_RE.test(node)) {
        found.push(node);
      } else if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
      } else if (node !== null && typeof node === 'object') {
        Object.values(node as object).forEach((v) => walk(v, depth + 1));
      }
    })(parsed, 0);
    return found;
  } catch {
    // Not valid JSON — fallback to regex
    return extractUrlsFromText(jsonStr);
  }
}

export function collectInlineScriptImages(
  document: ParentNode,
  baseUrl: string
): RawImageCandidate[] {
  const scripts = Array.from(
    (document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])')
  );

  const allUrls: string[] = [];

  for (const script of scripts) {
    const text = script.textContent?.trim() ?? '';
    if (!text || !IMAGE_EXT_RE.test(text)) continue;

    let foundFromPattern = false;
    for (const pattern of GLOBAL_VAR_PATTERNS) {
      pattern.lastIndex = 0;
      const match = new RegExp(pattern.source, pattern.flags).exec(text);
      if (match?.[1]) {
        const extracted = extractUrlsFromJsonString(match[1]);
        if (extracted.length > 0) {
          allUrls.push(...extracted);
          foundFromPattern = true;
        }
      }
    }

    if (!foundFromPattern) {
      // General fallback : collect all image URLs in the script
      const fallback = extractUrlsFromText(text);
      allUrls.push(...fallback);
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const candidates: RawImageCandidate[] = [];

  for (let i = 0; i < allUrls.length; i++) {
    const raw = allUrls[i];
    let url = raw;
    try { url = new URL(raw, baseUrl).href; } catch { /* keep */ }

    if (seen.has(url)) continue;
    seen.add(url);

    candidates.push({
      id: `inline-script-${i}`,
      url,
      previewUrl: url,
      captureStrategy: 'network',
      sourceKind: 'inline-script',
      origin: 'live-dom',
      width: 0,
      height: 0,
      domIndex: i,
      top: 0,
      left: 0,
      altText: '',
      titleText: '',
      containerSignature: 'script',
      visible: false,
      diagnostics: [],
    });
  }

  return candidates;
}
