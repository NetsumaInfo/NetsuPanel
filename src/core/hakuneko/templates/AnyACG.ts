/**
 * AnyACG template.
 *
 * Source: HakuNeko connectors/templates/AnyACG.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface AnyACGOverrides {
  queryChapters?: string;
  queryPages?: string;
}

const DEFAULTS = {
  queryChapters: 'div.cl ul li span.leftoff a',
  queryPages: 'div#readerarea p#arraydata',
};

export const AnyACGTemplate: HakuNekoTemplate = {
  name: 'AnyACG',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as AnyACGOverrides;
    const sel = overrides.queryChapters || DEFAULTS.queryChapters;
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '')
        .replace(manga.title, '')
        .replace(/-?\s+Read\s+Online/i, '')
        .trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as AnyACGOverrides;
    const sel = overrides.queryPages || DEFAULTS.queryPages;
    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    if (!els.length) return [];
    const text = els[0].textContent || '';
    return text
      .split(',')
      .map((image) => image.trim())
      .filter(Boolean)
      .map((image) => ({ url: ctx.getAbsolutePath(image, uri.href), referer: uri.href }));
  },
};
