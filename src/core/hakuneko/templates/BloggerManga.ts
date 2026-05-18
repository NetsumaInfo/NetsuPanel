/**
 * BloggerManga template (Google Blogger feed-based).
 *
 * Source: HakuNeko connectors/templates/BloggerManga.mjs (Unlicense).
 * Chapter listing here is heuristic: Blogger sites typically render
 * post anchors via og:title meta + sequential pages. We focus on the
 * static DOM path; the JSON feed flow targets manga discovery.
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface BloggerOverrides {
  queryChapters?: string;
  queryPages?: string;
}

const DEFAULTS = {
  queryChapters: 'div#main div.post article h2.post-title a',
  queryPages: 'div.post-body img[src]',
};

export const BloggerMangaTemplate: HakuNekoTemplate = {
  name: 'BloggerManga',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as BloggerOverrides;
    const sel = overrides.queryChapters || DEFAULTS.queryChapters;
    const uri = new URL(manga.id, ctx.connector.url);
    uri.searchParams.set('max-results', '999');
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, uri.href),
      title: (el.textContent || '').replace(manga.title, '').trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as BloggerOverrides;
    const sel = overrides.queryPages || DEFAULTS.queryPages;
    const uri = new URL(chapter.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    return els
      .map((el) => el.getAttribute('src') || '')
      .filter((url) => !!url)
      .map((url) => ({ url: ctx.getAbsolutePath(url, uri.href), referer: uri.href }));
  },
};
