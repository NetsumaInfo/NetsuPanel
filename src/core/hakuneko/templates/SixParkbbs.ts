/**
 * SixParkbbs template (Chinese forum / single-chapter posts).
 *
 * Source: HakuNeko connectors/templates/SixParkbbs.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface SixParkOverrides {
  sub?: string;
  queryPage?: string;
}

const DEFAULTS = {
  sub: '',
};

export const SixParkbbsTemplate: HakuNekoTemplate = {
  name: 'SixParkbbs',

  async getChapters(manga: HakuNekoManga): Promise<HakuNekoChapter[]> {
    // SixParkbbs: 1 manga page = 1 chapter
    return [{ id: manga.id, title: manga.title, language: '' }];
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as SixParkOverrides;
    const sub = overrides.sub ?? DEFAULTS.sub;
    const sel = overrides.queryPage;
    if (!sel) throw new Error('SixParkbbs requires overrides.queryPage');
    const uri = new URL(sub + chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els
      .map((el) => el.getAttribute('mydatasrc') || el.getAttribute('src') || '')
      .filter(Boolean)
      .map((url) => ({ url: ctx.getAbsolutePath(url, uri.href), referer: uri.href }));
  },
};
