/**
 * FlatManga template.
 *
 * Source: HakuNeko connectors/templates/FlatManga.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface FlatMangaOverrides {
  queryChapters?: string;
  queryChapterTitle?: string;
  queryPages?: string;
  language?: string;
}

const DEFAULTS = {
  queryChapters: 'div#tab-chapper table tr td a.chapter',
  queryPages: 'source.chapter-img',
  language: 'jp',
};

function tryAtob(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return atob(value);
  } catch {
    return undefined;
  }
}

export const FlatMangaTemplate: HakuNekoTemplate = {
  name: 'FlatManga',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as FlatMangaOverrides;
    const selector = overrides.queryChapters || DEFAULTS.queryChapters;
    const titleQuery = overrides.queryChapterTitle;
    const language = overrides.language || DEFAULTS.language;

    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements.map((element) => {
      const ds = element.dataset || ({} as DOMStringMap);
      if (ds.href) {
        element.setAttribute('href', ds.href + (element.getAttribute('href') || ''));
      }
      let title = titleQuery
        ? element.querySelector(titleQuery)?.textContent || ''
        : element.textContent || '';
      title = title.replace(manga.title, '');
      const safeMangaTitle = manga.title.replace(/[*^.|$?+\-()[\]{}\\/]/g, '\\$&').replace(/\s*-\s*RAW$/, '');
      if (safeMangaTitle) title = title.replace(new RegExp(safeMangaTitle), '');
      title = title.replace(/^\s*-\s*/, '').replace(/-\s*-\s*Read\s*Online\s*$/, '').trim();
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(element, ctx.connector.url),
        title,
        language,
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as FlatMangaOverrides;
    const selector = overrides.queryPages || DEFAULTS.queryPages;

    const uri = new URL(chapter.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements
      .map((element) => {
        const ds = element.dataset || ({} as DOMStringMap);
        const src =
          tryAtob(ds.aload) ||
          tryAtob(ds.src) ||
          tryAtob(ds.srcset) ||
          tryAtob(ds.original) ||
          tryAtob(ds.pagespeedLazySrc) ||
          ds.aload ||
          ds.src ||
          ds.srcset ||
          ds.original ||
          ds.pagespeedLazySrc ||
          element.getAttribute('src') ||
          '';
        if (!src) return null;
        return ctx.getAbsolutePath(src, uri.href);
      })
      .filter((url): url is string => !!url && !url.includes('3282f6a4b7_o') && !url.includes('donate'))
      .map((url) => ({ url, referer: uri.href }));
  },
};
