/**
 * WordPressZbulu template.
 *
 * Source: HakuNeko connectors/templates/WordPressZbulu.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface ZbuluOverrides {
  pathChapters?: string;
  queryChapters?: string;
  queryChaptersPageCount?: string;
  queryPages?: string;
}

const DEFAULTS = {
  pathChapters: '/page-%PAGE%/',
  queryChapters: 'div#chapterList div.chapters-wrapper div.r1 h2.chap a',
  queryChaptersPageCount: 'div.pagination-container div.pagination a.next:last-of-type',
  queryPages: 'div.chapter-content-inner source',
};

const TITLE_FILTER = /^\s*(\s+manga|\s+webtoon|\s+others)+/gi;

export const WordPressZbuluTemplate: HakuNekoTemplate = {
  name: 'WordPressZbulu',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as ZbuluOverrides;
    const pageCountSel = overrides.queryChaptersPageCount || DEFAULTS.queryChaptersPageCount;
    const sel = overrides.queryChapters || DEFAULTS.queryChapters;
    const pageTemplate = overrides.pathChapters || DEFAULTS.pathChapters;

    const baseUri = new URL(manga.id, ctx.connector.url);
    const head = (await ctx.fetchDOM({ url: baseUri.href }, pageCountSel)) as HTMLAnchorElement[];
    const pageCount = head[0]
      ? Math.max(1, parseInt(head[0].getAttribute('href')?.match(/(\d+)$/)?.[1] || '1', 10))
      : 1;

    const out: HakuNekoChapter[] = [];
    for (let page = 1; page <= pageCount; page += 1) {
      const uri = new URL(manga.id + pageTemplate.replace('%PAGE%', String(page)), ctx.connector.url);
      uri.pathname = uri.pathname.replace(/\/+/g, '/');
      const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLAnchorElement[];
      for (const el of els) {
        out.push({
          id: new URL(el.getAttribute('href') || '', uri.href).pathname,
          title: (el.textContent || '').replace(manga.title, '').replace(TITLE_FILTER, '').trim(),
          language: 'en',
        });
      }
    }
    return out;
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as ZbuluOverrides;
    const sel = overrides.queryPages || DEFAULTS.queryPages;

    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els.map((el) => ({ url: ctx.getAbsolutePath(el, uri.href), referer: uri.href }));
  },
};
