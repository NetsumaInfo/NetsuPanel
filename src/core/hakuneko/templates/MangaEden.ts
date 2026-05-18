/**
 * MangaEden template.
 *
 * Source: HakuNeko connectors/templates/MangaEden.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

export const MangaEdenTemplate: HakuNekoTemplate = {
  name: 'MangaEden',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, 'table tr td a.chapterLink')) as HTMLAnchorElement[];
    const lang = ctx.connector.id.split('-')[1] || '';
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '').replace(manga.title, '').trim(),
      language: lang,
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const uri = new URL(chapter.id, ctx.connector.url);
    const dom = (await ctx.fetchDOM({ url: uri.href })) as HTMLElement;
    const html = dom.outerHTML;
    if (html.indexOf('licensed in your country') > -1) {
      throw new Error('Manga is licensed and not available in your country');
    }
    const m = html.match(/pages\s*=\s*(\[.*?\])\s*;/);
    if (!m) throw new Error('MangaEden: pages list not found');
    const pages = JSON.parse(m[1]) as Array<{ fs: string }>;
    return pages.map((p) => ({
      url: ctx.getAbsolutePath(p.fs, uri.href),
      referer: uri.href,
    }));
  },
};
