/**
 * WordPressJarida template (WP REST API based).
 *
 * Source: HakuNeko connectors/templates/WordPressJarida.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

const API_PATH = '/wp-json/wp/v2/';

interface WPPost {
  link: string;
  title: { rendered: string };
  slug?: string;
}

export const WordPressJaridaTemplate: HakuNekoTemplate = {
  name: 'WordPressJarida',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const out: HakuNekoChapter[] = [];
    for (let page = 1; page < 50; page += 1) {
      const uri = new URL(API_PATH + 'posts', ctx.connector.url);
      uri.searchParams.set('page', String(page));
      uri.searchParams.set('per_page', '100');
      uri.searchParams.set('categories', manga.id);
      let batch: WPPost[];
      try {
        batch = await ctx.fetchJSON<WPPost[]>({ url: uri.href });
      } catch {
        break;
      }
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const post of batch) {
        out.push({
          id: ctx.getRootRelativeOrAbsoluteLink(post.link, ctx.connector.url),
          title: (post.title?.rendered || '').replace(manga.title, '').trim(),
          language: '',
        });
      }
      if (batch.length < 100) break;
    }
    return out;
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const uri = new URL(chapter.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM(
      { url: uri.href },
      'div.entry figure.wp-block-image source',
    )) as HTMLElement[];
    return elements.map((el) => ({
      url: ctx.getAbsolutePath(el.dataset?.lazySrc || el, uri.href),
      referer: uri.href,
    }));
  },
};
