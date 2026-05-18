/**
 * MangaNel template.
 *
 * Covers: manganato.gg, mangakakalot.gg, mangabat — sites with class
 * `div.chapter-list div.row` and `div.container-chapter-reader`.
 *
 * Source: HakuNeko connectors/MangaNel.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MangaNelOverrides {
  queryChapters?: string;
  queryPages?: string;
  chapterTitleFilter?: string;
}

const DEFAULT_QUERY_CHAPTERS = 'div.chapter-list div.row span a';
const DEFAULT_QUERY_PAGES = 'div.container-chapter-reader source';
const DEFAULT_CHAPTER_TITLE_FILTER = /^\s*(\s+manga|\s+webtoon|\s+others)+/gi;

export const MangaNelTemplate: HakuNekoTemplate = {
  name: 'MangaNel',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MangaNelOverrides;
    const selector = overrides.queryChapters || DEFAULT_QUERY_CHAPTERS;
    const titleFilter = overrides.chapterTitleFilter
      ? new RegExp(overrides.chapterTitleFilter, 'gi')
      : DEFAULT_CHAPTER_TITLE_FILTER;

    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements.map((element) => {
      const text = (element.textContent || '').replace(manga.title, '').replace(titleFilter, '').trim();
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(element, uri.href),
        title: text,
        language: '',
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MangaNelOverrides;
    const selector = overrides.queryPages || DEFAULT_QUERY_PAGES;

    const uri = new URL(chapter.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements.map((element) => {
      const dataSrc = element.dataset?.src;
      const reference = dataSrc || element;
      return {
        url: ctx.getRootRelativeOrAbsoluteLink(reference, uri.href),
        referer: uri.href,
      };
    });
  },
};
