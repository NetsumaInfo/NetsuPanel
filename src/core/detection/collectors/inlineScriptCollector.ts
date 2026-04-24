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
const QUOTED_IMAGE_PATH_RE =
  /["'`]((?:https?:\/\/|\/|\.\/|\.\.\/)[^"'`\\<>]+?\.(?:jpe?g|png|webp|avif|gif)(?:[?#][^"'`\\<>]*)?)["'`]/gi;

/**
 * Known global variable patterns where manga readers embed page data.
 * We use regex to extract the value part, then collect URLs from it.
 */
const GLOBAL_VAR_PATTERNS: RegExp[] = [
  // WordPress manga / generic
  /(?:var|let|const)\s+(?:pages|images?|chapter_images?|chapterImages|chapImages|page_list|img_list)\s*=\s*(\[.*?\])\s*;/is,
  // MangaBuddy / MangaBall style: var chapImages = 'url1,url2'; const chapterImages = JSON.parse(`[...]`)
  /(?:var|let|const)\s+(?:chapImages|chapterImages)\s*=\s*(['"`][\s\S]*?['"`])\s*;/i,
  /(?:var|let|const)\s+(?:chapImages|chapterImages)\s*=\s*JSON\.parse\(\s*(['"`][\s\S]*?['"`])\s*\)/i,
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
  QUOTED_IMAGE_PATH_RE.lastIndex = 0;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = FULL_URL_RE.exec(text)) !== null) {
    if (IMAGE_EXT_RE.test(m[0])) {
      urls.push(m[0]);
    }
  }
  while ((m = QUOTED_IMAGE_PATH_RE.exec(text)) !== null) {
    if (m[1] && IMAGE_EXT_RE.test(m[1])) {
      urls.push(m[1].replace(/\\\//g, '/'));
    }
  }
  return urls;
}

function extractUrlsFromJsonString(jsonStr: string): string[] {
  if (!jsonStr) return [];
  if (!IMAGE_EXT_RE.test(jsonStr)) return [];
  const unquoted = jsonStr
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/\\`/g, '`')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/');
  try {
    const parsed = JSON.parse(unquoted);
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
    return extractUrlsFromText(unquoted);
  }
}

export function collectInlineScriptImages(
  document: ParentNode,
  baseUrl: string
): RawImageCandidate[] {
  const scripts = Array.from(
    (document as Document).querySelectorAll<HTMLScriptElement>('script:not([src])')
  );

  const allUrls: Array<{ url: string; scriptIndex: number }> = [];

  for (const [scriptIndex, script] of scripts.entries()) {
    const text = script.textContent?.trim() ?? '';
    if (!text || !IMAGE_EXT_RE.test(text)) continue;

    let foundFromPattern = false;
    for (const pattern of GLOBAL_VAR_PATTERNS) {
      pattern.lastIndex = 0;
      const match = new RegExp(pattern.source, pattern.flags).exec(text);
      if (match?.[1]) {
        const extracted = extractUrlsFromJsonString(match[1]);
        if (extracted.length > 0) {
          allUrls.push(...extracted.map((url) => ({ url, scriptIndex })));
          foundFromPattern = true;
        }
      }
    }

    if (!foundFromPattern) {
      // General fallback : collect all image URLs in the script
      const fallback = extractUrlsFromText(text);
      allUrls.push(...fallback.map((url) => ({ url, scriptIndex })));
    }
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const candidates: RawImageCandidate[] = [];

  for (let i = 0; i < allUrls.length; i++) {
    const { url: raw, scriptIndex } = allUrls[i];
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
      containerSignature: `script:inline-${scriptIndex}`,
      visible: false,
      diagnostics: [],
    });
  }

  return candidates;
}
