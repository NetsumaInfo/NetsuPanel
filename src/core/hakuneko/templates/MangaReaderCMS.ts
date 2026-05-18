/**
 * MangaReaderCMS template (legacy MangaReader.cc clone).
 *
 * Source: HakuNeko connectors/templates/MangaReaderCMS.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MangaReaderCMSOverrides {
  queryChapters?: string;
  queryPages?: string;
  language?: string;
}

const DEFAULTS = {
  queryChapters: 'ul.chapters li h5.chapter-title-rtl',
  queryPages: 'div#all source.img-responsive',
  language: '',
};

export const MangaReaderCMSTemplate: HakuNekoTemplate = {
  name: 'MangaReaderCMS',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MangaReaderCMSOverrides;
    const selector = overrides.queryChapters || DEFAULTS.queryChapters;
    const language = overrides.language ?? DEFAULTS.language;

    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements.map((element) => {
      const anchor =
        element.tagName.toLowerCase() === 'a'
          ? (element as HTMLAnchorElement)
          : element.querySelector<HTMLAnchorElement>('a');
      if (!anchor) return { id: '', title: '', language };
      const text = ((element as HTMLElement).innerText || element.textContent || '')
        .replace(/\s*:\s*$/, '')
        .replace(manga.title, '')
        .trim();
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(anchor, ctx.connector.url),
        title: text,
        language,
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MangaReaderCMSOverrides;
    const selector = overrides.queryPages || DEFAULTS.queryPages;

    const uri = new URL(chapter.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements.map((element) => {
      const ds = element.dataset || ({} as DOMStringMap);
      try {
        if (ds.src) {
          const stripped = ds.src.split('://').pop();
          if (stripped) {
            const decoded = decodeURIComponent(atob(stripped));
            return { url: decoded, referer: uri.href };
          }
        }
      } catch {
        // fall through
      }
      const raw = (ds.src || element.getAttribute('src') || '').trim();
      return { url: new URL(raw, uri.href).href, referer: uri.href };
    });
  },
};
