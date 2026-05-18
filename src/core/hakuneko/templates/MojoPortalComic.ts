/**
 * MojoPortalComic template (TruyenChon theme for mojoPortal CMS).
 *
 * Source: HakuNeko connectors/templates/MojoPortalComic.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MojoOverrides {
  queryChapter?: string;
  queryPages?: string;
}

const DEFAULTS = {
  queryChapter: 'div.list-chapter ul li.row div.chapter a',
  queryPages: 'div.reading div.page-chapter source',
};

function resolveImageReferer(chapterURL: string, imageURL: string): string {
  if (imageURL.includes('mangapark.net')) return chapterURL;
  if (imageURL.includes('mangasy.com')) return 'https://www.mangasy.com/';
  return chapterURL;
}

export const MojoPortalComicTemplate: HakuNekoTemplate = {
  name: 'MojoPortalComic',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MojoOverrides;
    const sel = overrides.queryChapter || DEFAULTS.queryChapter;
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '').replace(manga.title, '').trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MojoOverrides;
    const sel = overrides.queryPages || DEFAULTS.queryPages;
    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els.map((el) => {
      const ds = el.dataset || ({} as DOMStringMap);
      const raw = ds.original || ds.src || el.getAttribute('src') || '';
      const url = ctx.getAbsolutePath(raw, uri.href);
      return { url, referer: resolveImageReferer(uri.href, url) };
    });
  },
};
