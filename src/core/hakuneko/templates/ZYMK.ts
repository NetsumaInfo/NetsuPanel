/**
 * ZYMK template.
 *
 * Source: HakuNeko connectors/templates/ZYMK.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface ZYMKOverrides {
  queryChapters?: string;
  format?: string;
  quality?: string;
  pagesScript?: string;
}

const DEFAULTS = {
  queryChapters: 'ul.chapter-list li.item a',
};

export const ZYMKTemplate: HakuNekoTemplate = {
  name: 'ZYMK',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as ZYMKOverrides;
    const sel = overrides.queryChapters || DEFAULTS.queryChapters;
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '').trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as ZYMKOverrides;
    const script =
      overrides.pagesScript ||
      `new Promise(resolve => {
        resolve(new Array(__cr.totalPage).fill().map((_, i) => new URL(__cr.getPicUrl(i+1), window.location.origin).href));
      });`;
    const uri = new URL(chapter.id, ctx.connector.url);
    const pages = (await ctx.fetchUI<string[]>(uri, script)) || [];
    return pages.map((url) => {
      const parts = url.split('.');
      const fmtOrig = parts.pop() || '';
      const qOrig = parts.pop() || '';
      parts.push(overrides.quality || qOrig);
      parts.push(overrides.format || fmtOrig);
      return { url: parts.join('.'), referer: uri.href };
    });
  },
};
