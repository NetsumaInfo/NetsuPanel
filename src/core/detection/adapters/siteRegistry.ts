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
import { wordpressMangaAdapter } from './wordpressMangaAdapter';
import { mangadexAdapter } from './mangadexAdapter';
import { webtoonAdapter } from './webtoonAdapter';
import { asuracomicAdapter } from './asuracomicAdapter';
import { mangagoAdapter } from './mangagoAdapter';
import { genericSiteAdapter } from './genericSiteAdapter';

/**
 * Ordered list of site adapters.
 * First matching adapter wins. genericSiteAdapter always matches (last resort).
 */
const ADAPTERS: SiteAdapter[] = [
  mangadexAdapter,          // MangaDex (API publique)
  webtoonAdapter,           // Webtoons.com (LINE Webtoon)
  asuracomicAdapter,        // AsuraComic, AnimeSama, MangaBuddy, GalaxyManga (Next.js)
  mangagoAdapter,           // Mangago.me, Utoon (var imglist=[])
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
