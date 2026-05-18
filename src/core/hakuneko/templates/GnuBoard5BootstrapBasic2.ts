/**
 * GnuBoard5BootstrapBasic2 template (KR webtoon aggregators).
 *
 * Source: HakuNeko connectors/templates/GnuBoard5BootstrapBasic2.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface GnuBoardOverrides {
  queryChapters?: string;
  queryChaptersTitleBloat?: string;
  pagesScript?: string;
}

const DEFAULTS = {
  queryChapters: 'div#bo_list table.web_list tbody tr td.content__title',
  pagesScript: `new Promise(resolve => {
    resolve([...document.querySelectorAll('div#toon_img img')].map(img => img.src));
  });`,
};

export const GnuBoard5BootstrapBasic2Template: HakuNekoTemplate = {
  name: 'GnuBoard5BootstrapBasic2',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as GnuBoardOverrides;
    const sel = overrides.queryChapters || DEFAULTS.queryChapters;
    const bloat = overrides.queryChaptersTitleBloat;
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els.map((element) => {
      if (bloat) {
        element.querySelectorAll(bloat).forEach((b) => b.parentElement?.removeChild(b));
      }
      const ref = element.dataset?.role || element;
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(ref, ctx.connector.url),
        title: ((element as HTMLElement).innerText || element.textContent || '').replace(manga.title, '').trim(),
        language: '',
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as GnuBoardOverrides;
    const script = overrides.pagesScript || DEFAULTS.pagesScript;
    const uri = new URL(chapter.id, ctx.connector.url);
    const pages = (await ctx.fetchUI<string[]>(uri, script)) || [];
    return pages.map((url) => ({ url, referer: uri.href }));
  },
};
