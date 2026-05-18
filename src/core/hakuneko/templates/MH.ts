/**
 * MH template (manhua sites, CN).
 *
 * Source: HakuNeko connectors/templates/MH.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MHOverrides {
  queryChapter?: string;
  queryPages?: string;
}

const DEFAULTS = {
  queryChapter: 'div#chapterlistload ul#detail-list-select li a',
  queryPages: 'div.comiclist div.comicpage source',
};

export const MHTemplate: HakuNekoTemplate = {
  name: 'MH',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MHOverrides;
    const sel = overrides.queryChapter || DEFAULTS.queryChapter;
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, ctx.connector.url),
      title: (el.childNodes?.[0]?.nodeValue || el.textContent || '').trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MHOverrides;
    const sel = overrides.queryPages || DEFAULTS.queryPages;
    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els.map((el) => {
      const ds = el.dataset || ({} as DOMStringMap);
      const raw = ds.src || ds.original || ds.echo || el.getAttribute('src') || '';
      return { url: ctx.getAbsolutePath(raw, uri.href), referer: uri.href };
    });
  },
};
