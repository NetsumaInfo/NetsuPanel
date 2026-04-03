/**
 * pageStrategy.ts
 *
 * Analyse le HTML brut d'une page de chapitre et décide de la meilleure
 * stratégie d'extraction d'images :
 *
 *  'static-html'  — les URLs sont accessibles dans le HTML (img tags, ts_reader.run,
 *                   chapterPages=[], __NEXT_DATA__, noscript imgs). Pas besoin d'onglet.
 *
 *  'live-dom'     — le contenu est rendu côté client (SPA/hydration Next.js/Nuxt,
 *                   API dynamique, viewer JS pur). Il faut ouvrir un onglet et scroller.
 *
 *  'cloudflare'   — Cloudflare Rocket Loader / Mirage / IUAM cache les images dans
 *                   des attributs data- ou noscript. On peut les récupérer en HTML
 *                   mais avec une logique spéciale.
 */

export type PageFetchStrategy = 'static-html' | 'live-dom' | 'cloudflare';

export interface PageStrategyResult {
  strategy: PageFetchStrategy;
  /** 0–1 : certitude de la stratégie choisie */
  confidence: number;
  /** Images déjà trouvées dans le HTML statique (ts_reader, noscript, img tags…) */
  staticImageCount: number;
  /** Signaux détectés (pour diagnostics) */
  signals: string[];
}

// ─── Patterns ──────────────────────────────────────────────────────────────────

const RASTER_EXT_RE = /\.(?:jpe?g|png|webp|avif|gif)(?:$|[?#])/i;
const FULL_IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|avif|gif)(?:[?#][^\s"'<>]*)?/gi;

/** Sélecteurs de conteneurs de pages manga typiques (lecture verticale) */
const MANGA_CONTAINER_SELECTORS = [
  '.reading-content img',
  '.chapter-content img',
  '.page-break img',
  '#readerarea img',
  '.wp-manga-chapter-img',
  '.ts-main-image',
  '.viewer_lst img',
  '.chapter-images img',
  '.entry-content img',
  '#image-container img',
  '.container-chapter-reader img',
  'img.wp-manga-chapter-img',
  'img[class*="chapter-img"]',
  'img[id*="chapter-img"]',
].join(', ');

/** Patterns inline-script pour ts_reader, chapterPages, imglist */
const STATIC_SCRIPT_PATTERNS: RegExp[] = [
  /ts_reader(?:\.run)?\s*\(/,
  /(?:var|let|const)\s+(?:chapterPages|imglist|images?|pages)\s*=\s*\[/i,
  /window\.__NEXT_DATA__/,
  /window\.__NUXT__/,
  /window\.initialPages\s*=/i,
  /window\.pageImages\s*=/i,
  /"images"\s*:\s*\[.*?"https?:/s,
  /"pages"\s*:\s*\[.*?"https?:/s,
];

/** Signaux Cloudflare */
const CF_SIGNALS: RegExp[] = [
  /data-cfsrc=/i,
  /cdn-cgi\/mirage/i,
  /rocket-loader/i,
  /__cf_bm/i,
  /cf-ray/i,
  /cloudflare/i,
];

/** Signaux de rendu client-side (live DOM nécessaire) */
const SPA_SIGNALS: RegExp[] = [
  /<div[^>]+id="__nuxt"/i,
  /<div[^>]+id="app"[^>]*>\s*<\/div>/i,          // Vue / Nuxt empty mount
  /<div[^>]+id="root"[^>]*>\s*<\/div>/i,          // React empty mount
  /__NEXT_DATA__.*"props":.*{}\s*}/s,              // Next SSR but no page data
  /data-reactroot/i,
  /ng-version/i,                                   // Angular
];

// ─── Noscript image extraction ────────────────────────────────────────────────

/** Extrait les <img> cachées dans des balises <noscript> (pattern Cloudflare Mirage) */
function countNoscriptImages(doc: Document): number {
  let count = 0;
  doc.querySelectorAll('noscript').forEach((ns) => {
    const text = ns.textContent || '';
    if (text.includes('<img') && RASTER_EXT_RE.test(text)) {
      count++;
    }
  });
  return count;
}

/** Compte les images dans les sélecteurs de conteneurs manga avec src réels */
function countMangaContainerImages(doc: Document): number {
  const imgs = doc.querySelectorAll<HTMLImageElement>(MANGA_CONTAINER_SELECTORS);
  let count = 0;
  imgs.forEach((img) => {
    const src =
      img.getAttribute('data-cfsrc') ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('src') ||
      '';
    if (src && RASTER_EXT_RE.test(src) && !src.startsWith('data:image/gif;base64,R0lGOD') && !src.startsWith('data:image/svg')) {
      count++;
    }
  });
  return count;
}

/** Compte les URLs d'images trouvées dans les scripts inline */
function countScriptImageUrls(doc: Document): { count: number; hasStaticPatterns: boolean } {
  let count = 0;
  let hasStaticPatterns = false;

  doc.querySelectorAll<HTMLScriptElement>('script:not([src])').forEach((script) => {
    const text = script.textContent || '';
    if (!text) return;

    // Check known static patterns
    for (const pattern of STATIC_SCRIPT_PATTERNS) {
      if (pattern.test(text)) {
        hasStaticPatterns = true;
        break;
      }
    }

    // Count image URLs in script
    FULL_IMAGE_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FULL_IMAGE_URL_RE.exec(text)) !== null) {
      count++;
    }
  });

  return { count, hasStaticPatterns };
}

/** Vérifie si on a un __NEXT_DATA__ avec des images */
function hasNextDataImages(doc: Document): boolean {
  const el = doc.getElementById('__NEXT_DATA__');
  if (!el?.textContent) return false;
  const text = el.textContent;
  return RASTER_EXT_RE.test(text) && (text.includes('"images"') || text.includes('"pages"') || text.includes('"url"'));
}

/** Vérifie les signaux Cloudflare dans le HTML brut */
function detectCloudflareSignals(html: string): string[] {
  const found: string[] = [];
  for (const re of CF_SIGNALS) {
    if (re.test(html)) {
      found.push(re.source.replace(/\\/g, ''));
    }
  }
  return found;
}

/** Vérifie les signaux SPA (application mono-page) nécessitant le DOM live */
function detectSpaSignals(html: string): string[] {
  const found: string[] = [];
  for (const re of SPA_SIGNALS) {
    if (re.test(html)) {
      found.push(re.source.slice(0, 40).replace(/\\/g, ''));
    }
  }
  return found;
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Analyse le HTML brut d'une page de chapitre et détermine la meilleure
 * stratégie pour en extraire les images.
 *
 * @param html   - Le HTML brut de la page (string)
 * @param url    - L'URL de la page (pour construire des URLs relatives)
 */
export function detectPageStrategy(html: string, url: string): PageStrategyResult {
  const signals: string[] = [];
  let staticScore = 0;      // Plus élevé = static-html préféré
  let liveScore = 0;        // Plus élevé = live-dom nécessaire
  let cloudflareScore = 0;  // Plus élevé = cloudflare

  // Parse the document
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return { strategy: 'live-dom', confidence: 0.5, staticImageCount: 0, signals: ['html-parse-failed'] };
  }

  // ── 1. Manga container images (strongest static signal) ─────────────────────
  const mangaImgCount = countMangaContainerImages(doc);
  if (mangaImgCount >= 3) {
    staticScore += 50;
    signals.push(`manga-container-imgs:${mangaImgCount}`);
  } else if (mangaImgCount >= 1) {
    staticScore += 20;
    signals.push(`manga-container-imgs:${mangaImgCount}`);
  }

  // ── 2. Noscript images (Cloudflare Mirage) ───────────────────────────────────
  const noscriptCount = countNoscriptImages(doc);
  if (noscriptCount >= 2) {
    cloudflareScore += 40;
    staticScore += 30; // Can still be extracted without live DOM
    signals.push(`noscript-imgs:${noscriptCount}`);
  }

  // ── 3. Script analysis ───────────────────────────────────────────────────────
  const { count: scriptUrlCount, hasStaticPatterns } = countScriptImageUrls(doc);
  if (hasStaticPatterns) {
    staticScore += 45;
    signals.push('static-script-patterns');
  }
  if (scriptUrlCount >= 3) {
    staticScore += 20;
    signals.push(`script-image-urls:${scriptUrlCount}`);
  }

  // ── 4. __NEXT_DATA__ with images ────────────────────────────────────────────
  if (hasNextDataImages(doc)) {
    staticScore += 40;
    signals.push('next-data-images');
  }

  // ── 5. Cloudflare signals ────────────────────────────────────────────────────
  const cfSignals = detectCloudflareSignals(html);
  if (cfSignals.length > 0) {
    cloudflareScore += cfSignals.length * 15;
    signals.push(...cfSignals.map((s) => `cf:${s}`));
  }

  // ── 6. SPA / empty mount signals ────────────────────────────────────────────
  const spaSignals = detectSpaSignals(html);
  if (spaSignals.length > 0) {
    liveScore += spaSignals.length * 20;
    signals.push(...spaSignals.map((s) => `spa:${s}`));
  }

  // ── 7. data-src lazy attributes (images not yet loaded) ─────────────────────
  // If most images only have data-src and no src, live DOM may be needed
  const allImgs = doc.querySelectorAll('img');
  let dataSrcOnly = 0;
  let realSrc = 0;
  allImgs.forEach((img) => {
    const hasDataSrc = img.hasAttribute('data-src') || img.hasAttribute('data-lazy-src') || img.hasAttribute('data-cfsrc') || img.hasAttribute('data-original');
    const src = img.getAttribute('src') || '';
    const isFakeSrc = !src || src.startsWith('data:image/gif;base64,R0lGOD') || src.startsWith('data:image/svg');
    if (hasDataSrc && isFakeSrc) {
      dataSrcOnly++;
    } else if (src && !isFakeSrc) {
      realSrc++;
    }
  });

  if (dataSrcOnly > 0 && realSrc === 0) {
    // All images are lazy — the static collector can still grab data-src attrs
    if (dataSrcOnly >= 3) {
      staticScore += 25;
      signals.push(`data-src-lazy:${dataSrcOnly}`);
    } else {
      liveScore += 15;
      signals.push(`data-src-few:${dataSrcOnly}`);
    }
  } else if (realSrc >= 3) {
    staticScore += 15;
    signals.push(`real-src-imgs:${realSrc}`);
  }

  // ── 8. Empty body / minimal content ─────────────────────────────────────────
  const bodyLength = doc.body?.textContent?.trim().length || 0;
  if (bodyLength < 500) {
    liveScore += 30;
    signals.push('empty-body');
  }

  void url; // available for future URL-based heuristics

  // ── Decision ─────────────────────────────────────────────────────────────────
  const totalStatic = mangaImgCount + noscriptCount + (scriptUrlCount >= 3 ? scriptUrlCount : 0);

  let strategy: PageFetchStrategy;
  let confidence: number;

  if (cloudflareScore > liveScore && cloudflareScore > staticScore && noscriptCount >= 2) {
    strategy = 'cloudflare';
    confidence = Math.min(0.95, 0.5 + cloudflareScore / 200);
  } else if (staticScore >= liveScore) {
    strategy = 'static-html';
    confidence = Math.min(0.95, 0.5 + (staticScore - liveScore) / 100);
  } else {
    strategy = 'live-dom';
    confidence = Math.min(0.95, 0.5 + (liveScore - staticScore) / 100);
  }

  return {
    strategy,
    confidence,
    staticImageCount: totalStatic,
    signals,
  };
}
