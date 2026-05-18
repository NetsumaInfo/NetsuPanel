/**
 * MadTheme template.
 *
 * Covers: mangabuddy.com, mangafire.to, and ~20 sister sites. Uses JSON
 * API /api/manga/<id>/chapters?source=detail and window.chapImages JS var
 * for pages (requires content-script eval for full pages).
 *
 * Source: HakuNeko connectors/templates/MadTheme.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MadThemeOverrides {
  queryChapterTitle?: string;
  queryPages?: string;
  pagesScript?: string;
}

const DEFAULT_QUERY_CHAPTER_TITLE = 'strong.chapter-title';
const DEFAULT_PAGES_SCRIPT = `new Promise(resolve => {
  let images = (window.chapImages || '').split(',').filter(Boolean);
  resolve(images.map(image => window.mainServer ? window.mainServer + image : image));
});`;

export const MadThemeTemplate: HakuNekoTemplate = {
  name: 'MadTheme',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MadThemeOverrides;
    const titleQuery = overrides.queryChapterTitle || DEFAULT_QUERY_CHAPTER_TITLE;

    const mangaId = manga.id.split('/').filter(Boolean).pop() || '';
    const uri = new URL('/api/manga/' + mangaId + '/chapters?source=detail', ctx.connector.url);
    const anchors = (await ctx.fetchDOM({ url: uri.href, referer: ctx.connector.url }, 'a')) as HTMLElement[];

    return anchors.map((a) => {
      const titleEl = a.querySelector<HTMLElement>(titleQuery);
      const title = (titleEl?.textContent || a.textContent || '').trim();
      const href = a.getAttribute('href') || '';
      const id = href ? new URL(href, ctx.connector.url).pathname : '';
      return { id, title, language: '' };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MadThemeOverrides;
    const script = overrides.pagesScript || DEFAULT_PAGES_SCRIPT;

    const uri = new URL(chapter.id, ctx.connector.url);
    const images = (await ctx.fetchUI<string[]>(uri, script)) || [];
    return images.map((image) => ({
      url: ctx.getAbsolutePath(image, uri.href),
      referer: uri.href,
    }));
  },
};
