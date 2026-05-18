/**
 * WordPressMangastream template (ThemeSia MangaStream).
 *
 * Covers ~100 sites using ts_reader.params.sources runtime config.
 *
 * Source: HakuNeko connectors/templates/WordPressMangastream.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';
import { createDOM } from '../engine';

interface MangastreamOverrides {
  queryChapters?: string;
  queryChaptersTitle?: string;
  queryChaptersTitleBloat?: string;
  queryPages?: string;
}

const DEFAULTS = {
  queryChapters: 'div#chapterlist ul li div.eph-num a',
  queryChaptersTitle: 'span.chapternum',
  queryPages: 'div#readerarea img[src]:not([src=""])',
};

const TS_READER_RE = /ts_reader(?:\.run)?\s*\(\s*(\{[\s\S]*?\})\s*\)/;

function tryParseTsReader(html: string): string[] | null {
  const m = html.match(TS_READER_RE);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]) as { sources?: Array<{ images?: string[] }> };
    const imgs = obj.sources?.[0]?.images || [];
    return imgs.length ? imgs : null;
  } catch {
    return null;
  }
}

function unwrapAdLink(element: HTMLAnchorElement): void {
  try {
    const uri = new URL(element.href);
    if (uri.hostname === 'nofil.net' && element.pathname.includes('safeme')) {
      const target = uri.searchParams.get('url');
      if (target) element.setAttribute('href', target);
    }
  } catch {
    // ignore
  }
}

export const WordPressMangastreamTemplate: HakuNekoTemplate = {
  name: 'WordPressMangastream',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MangastreamOverrides;
    const selector = overrides.queryChapters || DEFAULTS.queryChapters;
    const titleSel = overrides.queryChaptersTitle || DEFAULTS.queryChaptersTitle;
    const bloat = overrides.queryChaptersTitleBloat;

    const uri = new URL(manga.id, ctx.connector.url);
    const elements = (await ctx.fetchDOM({ url: uri.href }, selector)) as HTMLElement[];

    return elements.map((element) => {
      if (element.tagName === 'A') unwrapAdLink(element as HTMLAnchorElement);
      if (bloat) {
        element.querySelectorAll(bloat).forEach((b) => b.parentElement?.removeChild(b));
      }
      const titleEl = element.querySelector<HTMLElement>(titleSel);
      const raw = (titleEl?.textContent || element.textContent || '').replace(manga.title, '').trim();
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(element, uri.href),
        title: raw || manga.title,
        language: '',
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MangastreamOverrides;
    const selector = overrides.queryPages || DEFAULTS.queryPages;

    const uri = new URL(chapter.id, ctx.connector.url);
    // Try static HTML first (ts_reader regex). Avoids needing live tab.
    const dom = (await ctx.fetchDOM({ url: uri.href })) as HTMLElement;
    const html = dom.outerHTML;
    const tsImages = tryParseTsReader(html);
    if (tsImages?.length) {
      return tsImages.map((url) => ({
        url: ctx.getAbsolutePath(url, uri.href).replace(/\/i\d+\.wp\.com/, ''),
        referer: uri.href,
      }));
    }

    // Fallback: read selector from static DOM
    const elements = Array.from(dom.querySelectorAll<HTMLElement>(selector));
    return elements
      .map((el) => {
        const ds = el.dataset || ({} as DOMStringMap);
        const raw =
          ds.lazySrc || ds.src || el.getAttribute('original') || el.getAttribute('src') || '';
        if (!raw) return null;
        return ctx.getAbsolutePath(raw, uri.href).replace(/\/i\d+\.wp\.com/, '');
      })
      .filter((url): url is string => !!url && !url.includes('histats.com'))
      .map((url) => ({ url, referer: uri.href }));
  },
};

export { tryParseTsReader, createDOM };
