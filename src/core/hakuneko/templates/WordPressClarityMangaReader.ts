/**
 * WordPressClarityMangaReader template.
 *
 * Source: HakuNeko connectors/templates/WordPressClarityMangaReader.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface ClarityOverrides {
  queryChapters?: string;
}

const DEFAULTS = {
  queryChapters: 'div.chapter-list div.itemlist p.listcap',
};

export const WordPressClarityMangaReaderTemplate: HakuNekoTemplate = {
  name: 'WordPressClarityMangaReader',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as ClarityOverrides;
    const selector = overrides.queryChapters || DEFAULTS.queryChapters;

    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements
      .map((element) => {
        const ref = element.dataset?.ref;
        if (!ref) return null;
        return {
          id: ctx.getRootRelativeOrAbsoluteLink(ref, uri.href),
          title: (element.textContent || '').replace(manga.title, '').trim(),
          language: '',
        };
      })
      .filter((c): c is HakuNekoChapter => c !== null);
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    // Pages live in window.obj; requires live tab eval.
    const uri = new URL(chapter.id, ctx.connector.url);
    const pages = (await ctx.fetchUI<string[]>(
      uri,
      `new Promise(resolve => setTimeout(() => {
        resolve(obj.images.map(img => obj.image_url + obj.title + '_' + img.manga_id + '/ch_' + obj.actual + '/' + img.image_name));
      }, 2000));`,
    )) || [];
    return pages.map((url) => ({ url: ctx.getAbsolutePath(url, uri.href), referer: uri.href }));
  },
};
