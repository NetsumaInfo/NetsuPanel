/**
 * SinMH template (CN manhua, runtime JS).
 *
 * Source: HakuNeko connectors/templates/SinMH.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface SinMHOverrides {
  api?: string;
  queryChapters?: string;
  chaptersScript?: string;
  pagesScript?: string;
}

const DEFAULTS = {
  api: 'SinMH',
  queryChapters: 'div.comic-chapters ul li a',
};

export const SinMHTemplate: HakuNekoTemplate = {
  name: 'SinMH',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as SinMHOverrides;
    const sel = overrides.queryChapters || DEFAULTS.queryChapters;
    const uri = new URL(manga.id, ctx.connector.url);

    // Try static DOM first; SinMH chapter lists are usually server-rendered.
    try {
      const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLAnchorElement[];
      if (els.length) {
        return els.map((el) => ({
          id: new URL(el.getAttribute('href') || '', uri.href).pathname,
          title: (el.textContent || '').trim().replace(/\d+p$/, ''),
          language: '',
        }));
      }
    } catch {
      // fall through
    }
    // Live tab fallback (adult gate via #checkAdult click).
    const script =
      overrides.chaptersScript ||
      `new Promise(resolve => {
        let btn = document.querySelector('#checkAdult'); if(btn) btn.click();
        let list = [...document.querySelectorAll('${sel}')].map(el => ({
          id: new URL(el.href, window.location).pathname,
          title: (el.textContent||'').trim().replace(/\\d+p$/, ''),
          language: ''
        }));
        resolve(list);
      });`;
    return ((await ctx.fetchUI<HakuNekoChapter[]>(uri, script)) || []);
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as SinMHOverrides;
    const api = overrides.api || DEFAULTS.api;
    const script =
      overrides.pagesScript ||
      `new Promise(resolve => {
        let out = [];
        let count = ${api}.getChapterImageCount();
        for(let i = 1; i <= count; i++) out.push(${api}.getChapterImage(i));
        resolve(out);
      });`;
    const uri = new URL(chapter.id, ctx.connector.url);
    const pages = (await ctx.fetchUI<string[]>(uri, script)) || [];
    return pages.map((url) => ({ url, referer: uri.href }));
  },
};
