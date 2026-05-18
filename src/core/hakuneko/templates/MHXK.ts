/**
 * MHXK template (JSON API).
 *
 * Source: HakuNeko connectors/templates/MHXK.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MHXKOverrides {
  apiURL?: string;
  subdomain?: string;
  productId?: number;
  productName?: string;
  platformName?: string;
  format?: 'webp' | 'jpg';
  quality?: 'low' | 'middle' | 'high';
}

interface MHXKChapter {
  chapter_id: string;
  chapter_newid: string;
  chapter_name: string;
}

interface MHXKChapterInfo {
  data: {
    current_chapter: {
      start_num: number;
      end_num: number;
      rule: string;
      chapter_domain: string;
    };
  };
}

export const MHXKTemplate: HakuNekoTemplate = {
  name: 'MHXK',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL('/api/getComicInfoBody/', ctx.connector.url);
    uri.searchParams.set('comic_id', manga.id);
    const data = await ctx.fetchJSON<{ data: { comic_chapter: MHXKChapter[] } }>({ url: uri.href });
    return data.data.comic_chapter.map((c) => ({
      id: c.chapter_newid,
      title: c.chapter_name,
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MHXKOverrides;
    const subdomain = overrides.subdomain || 'mhpic.';
    const format = overrides.format || 'webp';
    const quality = overrides.quality || 'middle';
    const productName = overrides.productName || '';

    // Caller must pass comic_id via chapter.id... but original code uses chapter.manga.id.
    // We expose it via overrides.mangaId set by the bridge.
    const mangaId = (ctx.connector.overrides as { mangaId?: string } | undefined)?.mangaId;
    if (!mangaId) throw new Error('MHXK.getPages requires overrides.mangaId');

    const uri = new URL('/api/getchapterinfo', ctx.connector.url);
    uri.searchParams.set('comic_id', mangaId);
    uri.searchParams.set('chapter_newid', chapter.id);
    const data = await ctx.fetchJSON<MHXKChapterInfo>({ url: uri.href });
    const cur = data.data.current_chapter;
    const pages: HakuNekoPage[] = [];
    for (let i = cur.start_num; i <= cur.end_num; i += 1) {
      const page = new URL(cur.rule.replace('$$', String(i)), uri.href);
      page.hostname = subdomain + cur.chapter_domain;
      page.pathname += `-${productName}.${quality}.${format}`;
      pages.push({ url: page.href, referer: ctx.connector.url });
    }
    return pages;
  },
};
