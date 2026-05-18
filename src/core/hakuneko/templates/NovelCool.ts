/**
 * NovelCool template.
 *
 * Source: HakuNeko connectors/templates/NovelCool.mjs (Unlicense).
 * Novel-mode rendering (html2canvas) is skipped — MV3 cannot run that flow
 * silently. Only manga chapters with image pages are supported.
 */

import type { HakuNekoChapter, HakuNekoContext, HakuNekoManga, HakuNekoPage, HakuNekoTemplate } from '../types';

const DEFAULTS = {
  chapter_selector: 'div.chapter-item-list a',
  page_selector: 'select.sl-page',
  image_selector: 'div.pic_box source.manga_pic',
  text_novel_selector: 'p.chapter-start-mark',
};

export const NovelCoolTemplate: HakuNekoTemplate = {
  name: 'NovelCool',

  async getChapters(manga: HakuNekoManga, ctx: HakuNekoContext): Promise<HakuNekoChapter[]> {
    const uri = new URL(manga.id, ctx.connector.url);
    const els = (await ctx.fetchDOM({ url: uri.href }, DEFAULTS.chapter_selector)) as HTMLAnchorElement[];
    return els.map((el) => ({
      id: ctx.getRootRelativeOrAbsoluteLink(el, ctx.connector.url),
      title: (el.getAttribute('title') || el.textContent || '').trim(),
      language: '',
    }));
  },

  async getPages(chapter: HakuNekoChapter, ctx: HakuNekoContext): Promise<HakuNekoPage[]> {
    const uri = new URL(chapter.id, ctx.connector.url);
    const dom = (await ctx.fetchDOM({ url: uri.href })) as HTMLElement;
    if (dom.querySelector(DEFAULTS.text_novel_selector)) {
      throw new Error('NovelCool: text novel chapters not supported in MV3');
    }
    const pageLinks = dom.querySelector(DEFAULTS.page_selector);
    if (!pageLinks) return [];
    const options = Array.from(pageLinks.querySelectorAll<HTMLOptionElement>('option'));
    // Each option value is a page URL; that page hosts an <img> we need to resolve to a real CDN URL.
    const pages: HakuNekoPage[] = [];
    for (const opt of options) {
      const pageURL = opt.value;
      try {
        const pageDom = (await ctx.fetchDOM({ url: pageURL })) as HTMLElement;
        const img = pageDom.querySelector<HTMLElement>(DEFAULTS.image_selector);
        const src = img?.getAttribute('src');
        if (src) pages.push({ url: ctx.getAbsolutePath(src, pageURL), referer: pageURL });
      } catch {
        // skip
      }
    }
    return pages;
  },
};
