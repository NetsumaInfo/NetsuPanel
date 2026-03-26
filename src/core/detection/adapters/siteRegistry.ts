/**
 * siteRegistry.ts
 *
 * Registre central des adaptateurs de site.
 * Les adaptateurs sont testés dans l'ordre de priorité (spécifique avant générique).
 *
 * Pour ajouter un nouvel adaptateur :
 *  1. Créer le fichier adapters/myAdapter.ts
 *  2. L'importer ici
 *  3. L'ajouter dans ADAPTERS avant genericSiteAdapter
 */

import type { SiteAdapter } from './types';
import { madaraAdapter } from './madaraAdapter';
import { mangastreamAdapter } from './mangastreamAdapter';
import { wordpressMangaAdapter } from './wordpressMangaAdapter';
import { mangadexAdapter } from './mangadexAdapter';
import { webtoonAdapter } from './webtoonAdapter';
import { weebcentralAdapter } from './weebcentralAdapter';
import { speedbinbAdapter } from './speedbinbAdapter';
import { asuracomicAdapter } from './asuracomicAdapter';
import { mangagoAdapter } from './mangagoAdapter';
import { bilibiliAdapter } from './bilibiliAdapter';
import { genericSiteAdapter } from './genericSiteAdapter';

/**
 * Ordered list of site adapters.
 * First matching adapter wins. genericSiteAdapter always matches (last resort).
 */
const ADAPTERS: SiteAdapter[] = [
  mangadexAdapter,          // MangaDex (API publique)
  webtoonAdapter,           // Webtoons.com (LINE Webtoon), Naver Comic
  weebcentralAdapter,       // WeebCentral
  speedbinbAdapter,         // SpeedBinb readers
  asuracomicAdapter,        // AsuraComic, AnimeSama, MangaBuddy, GalaxyManga (Next.js)
  mangagoAdapter,           // Mangago.me, Utoon (var imglist=[])
  bilibiliAdapter,          // Bilibili Manga, Tencent QQ Comics (ac.qq.com)
  madaraAdapter,            // Madara / WP-Manga with ts_reader and page-break
  mangastreamAdapter,       // MangaStream / ThemeSia-like readers
  wordpressMangaAdapter,    // Tous les sites WP-Manga/Madara (ts_reader.run)
  genericSiteAdapter,       // Fallback générique
];

/**
 * Find the best adapter for a given URL.
 * Returns the first adapter that matches, always at least genericSiteAdapter.
 */
export function resolveAdapter(url: string): SiteAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.id !== 'generic' && adapter.matches(url)) {
      return adapter;
    }
  }
  return genericSiteAdapter;
}

export { ADAPTERS };
