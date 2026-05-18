/**
 * SoraOne template (Blogger-based reader).
 *
 * Source: HakuNeko connectors/templates/SoraOne.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

export const SoraOneTemplate: HakuNekoTemplate = {
  name: 'SoraOne',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL(manga.id, ctx.connector.url);
    uri.searchParams.set('max-results', '999');
    const els = (await ctx.fetchDOM(
      { url: uri.href },
      'div#main div#Blog1 div.post article h2.post-title a',
    )) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '')
        .replace(manga.title, '')
        .replace(/\(\s*read raw manhua\s*\)/i, '')
        .trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM(
      { url: uri.href },
      'div#main div#Blog1 article div.post-body source',
    )) as HTMLElement[];
    return els
      .map((el) => el.getAttribute('src') || '')
      .filter((url) => !!url)
      .map((url) => ({ url: ctx.getAbsolutePath(url, uri.href), referer: uri.href }));
  },
};
