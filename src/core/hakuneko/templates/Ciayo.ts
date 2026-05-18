/**
 * Ciayo template (JSON API).
 *
 * Source: HakuNeko connectors/templates/Ciayo.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface CiayoOverrides {
  baseURL?: string;
  language?: string;
}

interface CiayoResponse<T> {
  c: { status: { error: number; message: string }; data: T };
}

interface CiayoChapter {
  alias: string;
  episode: string;
  order: number;
}

interface CiayoPagesResponse {
  slices: Array<{ image: string; order: number }>;
}

function getBase(ctx: HakuNekoContext): string {
  const o = (ctx.connector.overrides || {}) as CiayoOverrides;
  return o.baseURL || ctx.connector.url;
}

function getLanguage(ctx: HakuNekoContext): string {
  return ((ctx.connector.overrides || {}) as CiayoOverrides).language || '';
}

async function requestJSON<T>(ctx: HakuNekoContext, url: string): Promise<T> {
  const data = await ctx.fetchJSON<CiayoResponse<T>>({ url });
  if (data.c.status.error) throw new Error(data.c.status.message);
  return data.c.data;
}

export const CiayoTemplate: HakuNekoTemplate = {
  name: 'Ciayo',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const base = getBase(ctx);
    const lang = getLanguage(ctx);
    const chapters = await requestJSON<CiayoChapter[]>(
      ctx,
      `${base}/comics/${manga.id}/chapters?app=desktop&language=${lang}&count=9999`,
    );
    return chapters
      .sort((a, b) => b.order - a.order)
      .map((item) => ({ id: item.alias, title: item.episode, language: lang }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const base = getBase(ctx);
    const lang = getLanguage(ctx);
    const mangaId = (ctx.connector.overrides as { mangaId?: string } | undefined)?.mangaId;
    if (!mangaId) throw new Error('Ciayo.getPages requires overrides.mangaId');
    const data = await requestJSON<CiayoPagesResponse>(
      ctx,
      `${base}/comics/${mangaId}/chapters/${chapter.id}?app=desktop&language=${lang}&with=slices`,
    );
    return data.slices.sort((a, b) => a.order - b.order).map((s) => ({ url: s.image, referer: base }));
  },
};
