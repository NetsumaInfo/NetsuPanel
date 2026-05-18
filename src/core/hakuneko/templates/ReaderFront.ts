/**
 * ReaderFront template (GraphQL API).
 *
 * Source: HakuNeko connectors/templates/ReaderFront.mjs (Unlicense).
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

interface ReaderFrontOverrides {
  apiURL: string;
  cdn: string;
  language?: string;
}

interface RFChapter {
  id: number;
  stub: string;
  volume: number;
  chapter: number;
  subchapter: number;
  name: string;
  language: number;
}

interface RFChapterById {
  uniqid: string;
  work: { uniqid: string };
  pages: Array<{ id: number; filename: string }>;
}

const LANGUAGE_MAP: Record<string, number> = { '': 0, es: 1, en: 2 };

function getOpts(ctx: HakuNekoContext): ReaderFrontOverrides {
  const o = (ctx.connector.overrides || {}) as Partial<ReaderFrontOverrides>;
  if (!o.apiURL || !o.cdn) throw new Error('ReaderFront requires overrides.apiURL and overrides.cdn');
  return o as ReaderFrontOverrides;
}

async function gql<T>(ctx: HakuNekoContext, apiURL: string, operationName: string, query: string, variables: unknown): Promise<T> {
  const res = await ctx.fetchJSON<{ data: T; errors?: Array<{ message: string }> }>({
    url: apiURL,
    method: 'POST',
    body: JSON.stringify({ operationName, query, variables }),
    headers: { 'content-type': 'application/json' },
  });
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('\n'));
  return res.data;
}

export const ReaderFrontTemplate: HakuNekoTemplate = {
  name: 'ReaderFront',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const opts = getOpts(ctx);
    const lang = LANGUAGE_MAP[opts.language || ''] ?? 0;
    const data = await gql<{ work: { chapters: RFChapter[] } }>(
      ctx,
      opts.apiURL,
      'Work',
      `query Work($language: Int, $stub: String) {
        work(language: $language, stub: $stub, showHidden: true) {
          chapters { id stub volume chapter subchapter name language }
        }
      }`,
      { language: lang, stub: manga.id },
    );
    return data.work.chapters.map((c) => ({
      id: String(c.id),
      title: `Vol. ${c.volume} Ch. ${c.chapter}.${c.subchapter} - ${c.name}`.trim(),
      language: opts.language || '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const opts = getOpts(ctx);
    const data = await gql<{ chapterById: RFChapterById }>(
      ctx,
      opts.apiURL,
      'ChapterById',
      `query ChapterById($id: Int) {
        chapterById(id: $id, showHidden: true) {
          uniqid
          work { uniqid }
          pages { id filename }
        }
      }`,
      { id: Number(chapter.id) },
    );
    const c = data.chapterById;
    return c.pages.map((page) => ({
      url: new URL(['/works', c.work.uniqid, c.uniqid, page.filename].join('/'), opts.cdn).href,
      referer: ctx.connector.url,
    }));
  },
};
