/**
 * ComiCake template.
 *
 * Source: HakuNeko connectors/templates/ComiCake.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface ComiCakeManifest {
  readingOrder: Array<{ href: string }>;
}

export const ComiCakeTemplate: HakuNekoTemplate = {
  name: 'ComiCake',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM(
      { url: uri.href },
      'ul.mdc-list li span.mdc-list-item__text > a',
    )) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '').trim(),
      language: 'english',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const trimmed = chapter.id.endsWith('/') ? chapter.id : chapter.id + '/';
    const uri = new URL(trimmed + 'manifest.json', ctx.connector.url);
    const data = await ctx.fetchJSON<ComiCakeManifest>({ url: uri.href });
    return data.readingOrder.map((p) => ({
      url: ctx.getAbsolutePath(p.href, uri.href),
      referer: ctx.connector.url,
    }));
  },
};
