/**
 * CoreView template (Atom feed chapters + episode-json pages).
 *
 * Source: HakuNeko connectors/templates/CoreView.mjs (Unlicense).
 * Image descrambling (`baku` mode) deferred to NetsuPanel's existing
 * descramble pipeline; only the URL list is produced here.
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface CoreViewOverrides {
  queryChaptersAtomFeed?: string;
  queryChapters?: string;
  queryEpisodeJSON?: string;
}

const DEFAULTS = {
  queryChaptersAtomFeed: 'head link[type*="atom+xml"]',
  queryChapters: 'feed entry',
  queryEpisodeJSON: '#episode-json',
};

interface EpisodeJSON {
  readableProduct: {
    isPublic: boolean;
    hasPurchased: boolean;
    pageStructure: {
      choJuGiga: 'usagi' | 'baku' | string;
      pages: Array<{ type: string; src: string }>;
    };
  };
}

export const CoreViewTemplate: HakuNekoTemplate = {
  name: 'CoreView',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as CoreViewOverrides;
    const feedSel = overrides.queryChaptersAtomFeed || DEFAULTS.queryChaptersAtomFeed;
    const entrySel = overrides.queryChapters || DEFAULTS.queryChapters;

    const uri = new URL(manga.id, ctx.connector.url);
    const links = (await ctx.fetchDOM({ url: uri.href }, feedSel)) as HTMLLinkElement[];
    if (!links.length) return [];
    const feedURI = new URL(links[0].href, ctx.connector.url);
    feedURI.searchParams.set('free_only', '0');
    const entries = (await ctx.fetchDOM({ url: feedURI.href }, entrySel)) as HTMLElement[];
    return entries.map((entry) => {
      const link = entry.querySelector<HTMLAnchorElement>('link');
      const title = entry.querySelector<HTMLElement>('title')?.textContent || '';
      return {
        id: link ? ctx.getRootRelativeOrAbsoluteLink(link, ctx.connector.url) : '',
        title: title.replace(manga.title, '').trim() || manga.title,
        language: '',
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as CoreViewOverrides;
    const sel = overrides.queryEpisodeJSON || DEFAULTS.queryEpisodeJSON;
    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    if (!els.length) throw new Error('CoreView: episode-json not found');
    const data = JSON.parse(els[0].dataset?.value || '{}') as EpisodeJSON;
    if (!data.readableProduct.isPublic && !data.readableProduct.hasPurchased) {
      throw new Error(`Chapter '${chapter.title}' is neither public nor purchased`);
    }
    return data.readableProduct.pageStructure.pages
      .filter((p) => p.type === 'main')
      .map((p) => ({
        url: ctx.getAbsolutePath(p.src, uri.href),
        referer: uri.href,
      }));
  },
};
