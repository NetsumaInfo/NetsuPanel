/**
 * PizzaReader template (JSON API).
 *
 * Source: HakuNeko connectors/templates/PizzaReader.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface PizzaChapter {
  url: string;
  full_title: string;
}

interface PizzaComic {
  comic: { title: string; chapters: PizzaChapter[] };
}

interface PizzaPages {
  chapter: { pages: string[] };
}

export const PizzaReaderTemplate: HakuNekoTemplate = {
  name: 'PizzaReader',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL('/api/comics/' + manga.id, ctx.connector.url);
    const data = await ctx.fetchJSON<PizzaComic>({ url: uri.href });
    return data.comic.chapters.map((c) => ({
      id: c.url,
      title: c.full_title,
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const uri = new URL('/api' + chapter.id, ctx.connector.url);
    const data = await ctx.fetchJSON<PizzaPages>({ url: uri.href });
    return data.chapter.pages.map((url) => ({ url, referer: ctx.connector.url }));
  },
};
