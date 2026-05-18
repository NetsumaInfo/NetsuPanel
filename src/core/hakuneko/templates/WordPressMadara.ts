/**
 * WordPressMadara template.
 *
 * Covers ~300 WP-Manga / Madara theme sites. Two chapter AJAX endpoints
 * (old: action=manga_get_chapters, new: <manga>/ajax/chapters/) + DOM fallback.
 *
 * Source: HakuNeko connectors/templates/WordPressMadara.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface MadaraOverrides {
  path?: string;
  queryChapters?: string;
  queryChaptersTitleBloat?: string;
  queryPages?: string;
  queryPlaceholder?: string;
  queryTitleForURI?: string;
}

const DEFAULTS = {
  path: '',
  queryChapters: 'li.wp-manga-chapter > a',
  queryPages: 'div.page-break source',
  queryPlaceholder: '[id^="manga-chapters-holder"][data-id]',
  queryTitleForURI: 'head meta[property="og:title"]',
};

async function fetchChaptersAjaxOld(
  ctx: HakuNekoContext,
  path: string,
  dataID: string,
  selector: string,
): Promise<HTMLElement[]> {
  const uri = new URL(path + '/wp-admin/admin-ajax.php', ctx.connector.url);
  const elements = (await ctx.fetchDOM(
    {
      url: uri.href,
      method: 'POST',
      body: 'action=manga_get_chapters&manga=' + encodeURIComponent(dataID),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-referer': ctx.connector.url,
      },
      referer: ctx.connector.url,
    },
    selector,
  )) as HTMLElement[];
  if (!elements.length) throw new Error('No chapters (old ajax endpoint)');
  return elements;
}

async function fetchChaptersAjaxNew(
  ctx: HakuNekoContext,
  mangaID: string,
  selector: string,
): Promise<HTMLElement[]> {
  const trimmed = mangaID.endsWith('/') ? mangaID : mangaID + '/';
  const uri = new URL(trimmed + 'ajax/chapters/', ctx.connector.url);
  const elements = (await ctx.fetchDOM(
    {
      url: uri.href,
      method: 'POST',
      referer: ctx.connector.url,
    },
    selector,
  )) as HTMLElement[];
  if (!elements.length) throw new Error('No chapters (new ajax endpoint)');
  return elements;
}

export const WordPressMadaraTemplate: HakuNekoTemplate = {
  name: 'WordPressMadara',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const overrides = (ctx.connector.overrides || {}) as MadaraOverrides;
    const selector = overrides.queryChapters || DEFAULTS.queryChapters;
    const placeholderQuery = overrides.queryPlaceholder || DEFAULTS.queryPlaceholder;
    const titleBloat = overrides.queryChaptersTitleBloat;
    const path = overrides.path ?? DEFAULTS.path;

    const uri = new URL(manga.id, ctx.connector.url);
    const root = (await ctx.fetchDOM({ url: uri.href }, 'body')) as HTMLElement[];
    const body = root[0];
    let chapterElements = Array.from(body.querySelectorAll<HTMLElement>(selector));
    const placeholder = body.querySelector<HTMLElement>(placeholderQuery);

    if (placeholder) {
      const dataID = placeholder.dataset?.id || placeholder.getAttribute('data-id') || '';
      const results = await Promise.allSettled([
        fetchChaptersAjaxNew(ctx, manga.id, selector),
        fetchChaptersAjaxOld(ctx, path, dataID, selector),
      ]);
      const fulfilled = results.find((r) => r.status === 'fulfilled');
      if (fulfilled && fulfilled.status === 'fulfilled') {
        chapterElements = fulfilled.value;
      }
    }

    return chapterElements.map((element) => {
      if (titleBloat) {
        element.querySelectorAll(titleBloat).forEach((bloat) => bloat.parentElement?.removeChild(bloat));
      }
      const text = (element.textContent || '').replace(manga.title, '').trim();
      return {
        id: ctx.getRootRelativeOrAbsoluteLink(element, uri.href),
        title: text,
        language: '',
      };
    });
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const overrides = (ctx.connector.overrides || {}) as MadaraOverrides;
    const selector = overrides.queryPages || DEFAULTS.queryPages;

    const uri = new URL(chapter.id, ctx.connector.url);
    uri.searchParams.set('style', 'list');
    let elements = (await ctx.fetchDOM({ url: uri.href, referer: ctx.connector.url }, selector)) as HTMLElement[];

    // Some Madara sites block ?style=list via CloudFlare WAF — retry without.
    if (!elements.length) {
      uri.searchParams.delete('style');
      elements = (await ctx.fetchDOM({ url: uri.href, referer: ctx.connector.url }, selector)) as HTMLElement[];
    }

    return elements.map((element) => {
      const ds = element.dataset || ({} as DOMStringMap);
      const raw = ds.url || ds.src || (element as HTMLImageElement).srcset || element.getAttribute('src') || '';
      if (raw.includes('data:image')) {
        const m = raw.match(/data:image[^\s'"]*/);
        return { url: m ? m[0] : raw, referer: uri.href };
      }
      const absolute = new URL(ctx.getAbsolutePath(raw, uri.href));
      // Some Madara sites proxy through webpc-passthru.php?src=...
      const canonical = absolute.searchParams.get('src');
      if (canonical && /^https?:/.test(canonical)) {
        absolute.href = canonical;
      }
      return {
        url: absolute.href.replace(/\/i\d+\.wp\.com/, ''),
        referer: uri.href,
      };
    });
  },

  async getMangaFromURI(uri, ctx) {
    const overrides = (ctx.connector.overrides || {}) as MadaraOverrides;
    const sel = overrides.queryTitleForURI || DEFAULTS.queryTitleForURI;
    const elements = (await ctx.fetchDOM({ url: uri.href }, sel)) as HTMLElement[];
    const last = elements[elements.length - 1] as HTMLMetaElement | HTMLElement | undefined;
    const title = ((last as HTMLMetaElement)?.content || last?.textContent || '').trim();
    return { id: uri.pathname, title };
  },
};
