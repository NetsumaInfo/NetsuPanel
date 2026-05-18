/**
 * HakuNeko connector registry.
 *
 * Maps hostname → connector descriptor (template ref + per-site overrides).
 *
 * This file is a hand-curated subset of the upstream HakuNeko connectors
 * collection (Unlicense). Each entry covers one site via one of the ported
 * templates in ./templates/index.ts.
 *
 * To regenerate or extend with the full ~1000-site catalog, see
 * scripts/build-hakuneko-registry.ts (TODO).
 */

import type { HakuNekoConnector } from './types';

const CONNECTORS: HakuNekoConnector[] = [
  // ────────────────────────────────────────────────────────────────────
  // MangaNel family (Manganato / MangaKakalot / MangaBat clones)
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'manganato',
    label: 'Manganato',
    url: 'https://www.manganato.gg',
    template: 'MangaNel',
    tags: ['manga', 'english'],
  },
  {
    id: 'mangakakalot',
    label: 'MangaKakalot',
    url: 'https://www.mangakakalot.gg',
    template: 'MangaNel',
    tags: ['manga', 'english'],
  },
  {
    id: 'mangabat',
    label: 'MangaBat',
    url: 'https://h.mangabat.com',
    template: 'MangaNel',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // WP-Madara family (~300 sites — listed: top picks)
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'mangaread',
    label: 'MangaRead',
    url: 'https://www.mangaread.org',
    template: 'WordPressMadara',
    tags: ['manga', 'english'],
  },
  {
    id: 'manhuaplus',
    label: 'ManhuaPlus',
    url: 'https://manhuaplus.com',
    template: 'WordPressMadara',
    tags: ['manhua', 'english'],
  },
  {
    id: 'toonily',
    label: 'Toonily',
    url: 'https://toonily.com',
    template: 'WordPressMadara',
    tags: ['webtoon', 'english'],
  },
  {
    id: 'manhuaus',
    label: 'ManhuaUS',
    url: 'https://manhuaus.com',
    template: 'WordPressMadara',
    tags: ['manhua', 'english'],
  },
  {
    id: 'manhwaclan',
    label: 'ManhwaClan',
    url: 'https://manhwaclan.com',
    template: 'WordPressMadara',
    tags: ['manhwa', 'english'],
  },
  {
    id: 'flamecomics',
    label: 'Flame Comics',
    url: 'https://flamecomics.xyz',
    template: 'WordPressMadara',
    tags: ['manga', 'english'],
  },
  {
    id: 'reaperscans',
    label: 'Reaper Scans',
    url: 'https://reaperscans.com',
    template: 'WordPressMadara',
    tags: ['manga', 'english'],
  },
  {
    id: 'mangakitsune',
    label: 'Manga Kitsune',
    url: 'https://mangakitsune.com',
    template: 'WordPressMadara',
    tags: ['manga', 'english'],
  },
  {
    id: 'sushiscan',
    label: 'SushiScan',
    url: 'https://sushiscan.fr',
    template: 'WordPressMadara',
    tags: ['manga', 'french'],
  },
  {
    id: 'scanmanga',
    label: 'Scan-Manga',
    url: 'https://scan-manga.com',
    template: 'WordPressMadara',
    tags: ['manga', 'french'],
  },
  {
    id: 'arenascan',
    label: 'ArenaScan',
    url: 'https://arenascan.com',
    template: 'WordPressMadara',
    tags: ['manga', 'french'],
  },
  {
    id: 'astralmanga',
    label: 'Astral Manga',
    url: 'https://astral-manga.fr',
    template: 'WordPressMadara',
    tags: ['manga', 'french'],
  },

  // ────────────────────────────────────────────────────────────────────
  // MadTheme family (MangaBuddy / MangaFire clones)
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'mangabuddy',
    label: 'MangaBuddy',
    url: 'https://mangabuddy.com',
    template: 'MadTheme',
    tags: ['manga', 'english'],
  },
  {
    id: 'mangafire',
    label: 'MangaFire',
    url: 'https://mangafire.to',
    template: 'MadTheme',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // WP-Mangastream / ThemeSia family
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'asuracomic',
    label: 'AsuraComic',
    url: 'https://asuracomic.net',
    template: 'WordPressMangastream',
    tags: ['manga', 'english'],
  },
  {
    id: 'shimo',
    label: 'Shimo Scans',
    url: 'https://shimo.coffee',
    template: 'WordPressMangastream',
    tags: ['manga', 'english'],
  },
  {
    id: 'kunmanga',
    label: 'KunManga',
    url: 'https://kunmanga.com',
    template: 'WordPressMadara',
    tags: ['manga', 'english'],
  },
  {
    id: 'mangaball',
    label: 'MangaBall',
    url: 'https://mangaball.net',
    template: 'WordPressMadara',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // FlatManga
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'mangaowl',
    label: 'MangaOwl',
    url: 'https://mangaowl.io',
    template: 'FlatManga',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // FoolSlide
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'jaiminisbox',
    label: "Jaimini's Box",
    url: 'https://jaiminisbox.com/reader',
    template: 'FoolSlide',
    tags: ['manga', 'english'],
  },
  {
    id: 'kireicake',
    label: 'Kirei Cake',
    url: 'https://reader.kireicake.com',
    template: 'FoolSlide',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // Genkan
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'leviatanscans',
    label: 'Leviatan Scans',
    url: 'https://leviatanscans.com',
    template: 'Genkan',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // HeanCms
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'reaperscans-id',
    label: 'Reaper Scans ID',
    url: 'https://reaperscans.id',
    template: 'HeanCms',
    overrides: { api: 'https://api.reaperscans.id' },
    tags: ['manga', 'indonesian'],
  },

  // ────────────────────────────────────────────────────────────────────
  // SinMH / ZYMK (CN)
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'gufengmh',
    label: 'GufengMH',
    url: 'https://www.gufengmh.com',
    template: 'SinMH',
    overrides: { api: 'SinMH' },
    tags: ['manhua', 'chinese'],
  },
  {
    id: 'zymk',
    label: 'ZYMK',
    url: 'https://www.zymk.cn',
    template: 'ZYMK',
    tags: ['manhua', 'chinese'],
  },

  // ────────────────────────────────────────────────────────────────────
  // PizzaReader / MangaReaderCMS
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'tuttoanimemanga',
    label: 'Tutto Anime Manga',
    url: 'https://tuttoanimemanga.net',
    template: 'PizzaReader',
    tags: ['manga', 'italian'],
  },

  // ────────────────────────────────────────────────────────────────────
  // WordPressJarida (REST API)
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'mangaonline',
    label: 'MangaOnline',
    url: 'https://mangaonline.cc',
    template: 'WordPressJarida',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // WordPressZbulu
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'mangaforfree',
    label: 'MangaForFree',
    url: 'https://mangaforfree.com',
    template: 'WordPressZbulu',
    tags: ['manga', 'english'],
  },

  // ────────────────────────────────────────────────────────────────────
  // MangaToon
  // ────────────────────────────────────────────────────────────────────
  {
    id: 'mangatoon',
    label: 'MangaToon',
    url: 'https://mangatoon.mobi',
    template: 'MangaToon',
    overrides: { baseURL: 'https://mangatoon.mobi' },
    tags: ['manga', 'english'],
  },
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Resolve a connector descriptor for the given page URL.
 * Returns undefined when no connector matches.
 */
export function resolveConnector(pageUrl: string): HakuNekoConnector | undefined {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  for (const conn of CONNECTORS) {
    if (conn.unsupported) continue;
    const baseHost = hostnameOf(conn.url);
    if (host === baseHost) return conn;
    if (host.endsWith('.' + baseHost)) return conn;
    if (conn.hostnames) {
      for (const h of conn.hostnames) {
        const lower = h.toLowerCase();
        if (host === lower || host.endsWith('.' + lower)) return conn;
      }
    }
  }
  return undefined;
}

export function listConnectors(): HakuNekoConnector[] {
  return CONNECTORS;
}
