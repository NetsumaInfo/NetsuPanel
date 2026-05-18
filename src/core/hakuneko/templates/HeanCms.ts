/**
 * HeanCms template (JSON API).
 *
 * Source: HakuNeko connectors/templates/HeanCms.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface HeanCmsOverrides {
  api: string;
}

interface HeanCmsManga {
  id: number;
  slug: string;
}

interface HeanCmsChapter {
  id: number;
  slug: string;
}

interface HeanCmsApiChapter {
  id: number;
  chapter_slug: string;
  chapter_name?: string;
  chapter_title?: string | null;
}

interface HeanCmsApiSeasons {
  seasons?: Array<{ index: number; chapters: HeanCmsApiChapter[] }>;
}

interface HeanCmsApiQuery {
  data?: HeanCmsApiChapter[];
}

interface HeanCmsApiPages {
  paywall?: boolean;
  chapter: {
    chapter_type: string;
    storage: 's3' | 'local';
    chapter_data?: { images: string[] };
  };
  data?: string[];
}

function deProxifyStatically(uri: string): string {
  const url = uri
    .replace(/cdn\.statically\.io\/img\/(bacakomik\/)?/, '')
    .replace(/\/(w=\d+|h=\d+|q=\d+|f=auto)(,(w=\d+|h=\d+|q=\d+|f=auto))*\//, '/');
  return new URL(url).href;
}

function getApi(ctx: HakuNekoContext): string {
  const o = (ctx.connector.overrides || {}) as Partial<HeanCmsOverrides>;
  if (!o.api) throw new Error('HeanCms requires overrides.api');
  return o.api;
}

export const HeanCmsTemplate: HakuNekoTemplate = {
  name: 'HeanCms',

  async getMangaFromURI(uri, ctx) {
    const api = getApi(ctx);
    const slug = uri.pathname.split('/').filter(Boolean)[1];
    const data = await ctx.fetchJSON<{ id: number; title: string; series_slug: string }>(`${api}/series/${slug}`);
    return {
      id: JSON.stringify({ id: data.id, slug: data.series_slug } satisfies HeanCmsManga),
      title: data.title,
    };
  },

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const api = getApi(ctx);
    let parsed: HeanCmsManga;
    try {
      parsed = JSON.parse(manga.id) as HeanCmsManga;
    } catch {
      return [];
    }
    // v1: seasons embedded in series payload
    try {
      const data = await ctx.fetchJSON<HeanCmsApiSeasons>(`${api}/series/${parsed.slug}`);
      const seasons = data.seasons || [];
      const out: HakuNekoChapter[] = [];
      seasons.forEach((season) => {
        season.chapters.forEach((chapter) => {
          out.push({
            id: JSON.stringify({ id: chapter.id, slug: chapter.chapter_slug } satisfies HeanCmsChapter),
            title: `${seasons.length > 1 ? 'S' + season.index : ''} ${chapter.chapter_name || ''} ${chapter.chapter_title || ''}`.trim(),
          });
        });
      });
      if (out.length) return out;
    } catch {
      // fall through to v2
    }
    // v2: dedicated chapter query endpoint
    const data = await ctx.fetchJSON<HeanCmsApiQuery>(
      `${api}/chapter/query?series_id=${parsed.id}&perPage=9999&page=1`,
    );
    return (data.data || []).map((chapter) => ({
      id: JSON.stringify({ id: chapter.id, slug: chapter.chapter_slug } satisfies HeanCmsChapter),
      title: `${chapter.chapter_name || ''} ${chapter.chapter_title || ''}`.trim(),
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const api = getApi(ctx);
    // chapter.id holds {id,slug}; we need the manga slug — caller must pass it via overrides.mangaSlug
    let chapterParsed: HeanCmsChapter;
    try {
      chapterParsed = JSON.parse(chapter.id) as HeanCmsChapter;
    } catch {
      throw new Error('HeanCms: chapter.id is not parseable JSON');
    }
    const mangaSlug = (ctx.connector.overrides as { mangaSlug?: string } | undefined)?.mangaSlug;
    if (!mangaSlug) throw new Error('HeanCms.getPages requires overrides.mangaSlug for this chapter');

    const data = await ctx.fetchJSON<HeanCmsApiPages>(`${api}/chapter/${mangaSlug}/${chapterParsed.slug}`);
    if (data.paywall) throw new Error(`${chapter.title} is paywalled.`);
    if (data.chapter.chapter_type.toLowerCase() === 'novel') {
      throw new Error('Novel chapters not supported in MV3 (requires html2canvas eval).');
    }
    const images = data.data || data.chapter.chapter_data?.images || [];
    return images.map((image) => {
      let link: string;
      switch (data.chapter.storage) {
        case 's3':
          link = new URL(image).href;
          break;
        case 'local':
          link = new URL(image, api).href;
          break;
        default:
          link = image;
      }
      return { url: deProxifyStatically(link), referer: ctx.connector.url };
    });
  },
};
