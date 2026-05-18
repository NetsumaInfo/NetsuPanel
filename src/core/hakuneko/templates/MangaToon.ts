/**
 * MangaToon template.
 *
 * Source: HakuNeko connectors/templates/MangaToon.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

const LOCK_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMTAwIiB3aWR0aD0iMjAwIj48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZHk9IjAuMjVlbSIgZmlsbD0icmVkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DaGFwdGVyIGlzIExvY2tlZCE8L3RleHQ+PC9zdmc+';

export const MangaToonTemplate: HakuNekoTemplate = {
  name: 'MangaToon',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const base = (ctx.connector.overrides as { baseURL?: string } | undefined)?.baseURL || ctx.connector.url;
    const uri = new URL(manga.id + '/episodes', base);
    const els = (await ctx.fetchDOM(
      { url: uri.href },
      'div.episode-content-asc div.episodes-wrap a.episode-item, div.episode-content-asc div.episodes-wrap-new a.episode-item-new',
    )) as HTMLAnchorElement[];
    return els.map((el) => {
      const titleEl = el.querySelector<HTMLElement>('div.episode-title, div.episode-title-new:last-of-type');
      const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').replace(manga.title, '').trim();
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
        title,
        language: '',
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const base = (ctx.connector.overrides as { baseURL?: string } | undefined)?.baseURL || ctx.connector.url;
    const uri = new URL(chapter.id, base);
    const dom = (await ctx.fetchDOM({ url: uri.href })) as HTMLElement;
    const html = dom.outerHTML;
    const m = html.match(/pictures\s*=\s*(\[.+?\])\s*;/);
    if (!m) return [{ url: LOCK_IMAGE }];
    const pictures = JSON.parse(m[1]) as Array<{ url: string }>;
    return pictures.map((picture) => {
      const parts = picture.url.replace('/encrypted/', '/watermark/').split('.');
      parts[parts.length - 1] = 'jpg';
      return { url: ctx.getAbsolutePath(parts.join('.'), uri.href), referer: uri.href };
    });
  },
};
