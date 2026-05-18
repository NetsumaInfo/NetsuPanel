/**
 * Genkan template.
 *
 * Source: HakuNeko connectors/templates/Genkan.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

const DEFAULT_QUERY_CHAPTER_ROW = 'div.col-lg-9 div.card div.list div.list-item';

export const GenkanTemplate: HakuNekoTemplate = {
  name: 'Genkan',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, DEFAULT_QUERY_CHAPTER_ROW)) as HTMLElement[];
    return elements
      .map((element) => {
        const link = element.querySelector<HTMLAnchorElement>('a.item-author');
        const numberEl = element.querySelector<HTMLElement>('span.text-muted');
        if (!link) return null;
        const num = (numberEl?.textContent || '').trim();
        const title = (link.textContent || '').replace(manga.title, '').trim();
        return {
          id: ctx.getRootRelativeOrAbsoluteLink(link, uri.href),
          title: num ? `${num} - ${title}` : title,
          language: '',
        };
      })
      .filter((c): c is HakuNekoChapter => c !== null);
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    // Genkan stores page list in window.chapterPages — requires eval in tab.
    const uri = new URL(chapter.id, ctx.connector.url);
    const pages = (await ctx.fetchUI<string[]>(uri, 'Promise.resolve(window.chapterPages);')) || [];
    return pages.map((p) => ({ url: ctx.getAbsolutePath(p, uri.href), referer: uri.href }));
  },
};
