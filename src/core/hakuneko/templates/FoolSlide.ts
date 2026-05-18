/**
 * FoolSlide template.
 *
 * Source: HakuNeko connectors/templates/FoolSlide.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface FoolSlideOverrides {
  queryChapters?: string;
  language?: string;
}

const DEFAULTS = {
  queryChapters: 'div.list div.element div.title a',
};

export const FoolSlideTemplate: HakuNekoTemplate = {
  name: 'FoolSlide',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as FoolSlideOverrides;
    const selector = overrides.queryChapters || DEFAULTS.queryChapters;
    const language = overrides.language || '';

    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM(
      {
        url: uri.href,
        method: 'POST',
        body: 'adult=true',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
      selector,
    )) as HTMLElement[];

    return elements.map((element) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(element, ctx.connector.url),
      title: (element.textContent || '').trim(),
      language,
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const uri = new URL(chapter.id, ctx.connector.url);
    const dom = (await ctx.fetchDOM({
      url: uri.href,
      method: 'POST',
      body: 'adult=true',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })) as HTMLElement;
    const html = dom.outerHTML;

    let pagesText: string | undefined;
    const rawMatch = html.match(/pages\s*=\s*(\[.*?\])\s*;/);
    if (rawMatch) pagesText = rawMatch[1];
    const b64Match = html.match(/pages\s*=\s*JSON\.parse\s*\(\s*atob\s*\(\s*"(.*?)"\s*\)\s*\)\s*;/);
    if (b64Match) {
      try {
        pagesText = atob(b64Match[1]);
      } catch {
        // ignore
      }
    }
    if (!pagesText) throw new Error('FoolSlide: failed to extract page list');

    const pages = JSON.parse(pagesText) as Array<{ url: string }>;
    return pages.map((page) => ({
      url: ctx.getAbsolutePath(page.url, uri.href),
      referer: uri.href,
    }));
  },
};
