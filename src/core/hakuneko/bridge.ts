/**
 * HakuNeko bridge — public entry point for NetsuPanel callers.
 *
 * Given a page URL and an engine adapter, resolves the matching connector
 * + template, then runs getChapters / getPages.
 *
 * Use this from chapterCrawler.ts (or anywhere that needs site-specific
 * chapter list extraction) to skip the generic heuristic when a HakuNeko
 * template can give us a clean answer.
 */

import { createContext, type EngineDependencies } from './engine';
import { findInfyURL, type InfyResult } from './infyDetect';
import { resolveConnector } from './registry';
import { getTemplate } from './templates';
import type { HakuNekoChapter, HakuNekoConnector, HakuNekoManga, HakuNekoPage } from './types';

export interface HakuNekoBridgeOptions {
  /** Optional pre-resolved connector (skips registry lookup). */
  connector?: HakuNekoConnector;
  /** Page URL the user is currently on. */
  pageUrl: string;
  /** Engine dependencies — at minimum, fetchHtml. */
  deps: EngineDependencies;
  /** Optional pre-fetched manga descriptor. */
  manga?: HakuNekoManga;
}

export interface HakuNekoChaptersResult {
  connector: HakuNekoConnector;
  manga: HakuNekoManga;
  chapters: HakuNekoChapter[];
}

export interface HakuNekoPagesResult {
  connector: HakuNekoConnector;
  pages: HakuNekoPage[];
}

/**
 * Resolve a manga descriptor from a page URL.
 * Tries template.getMangaFromURI, falls back to heuristic id = pathname.
 */
async function deriveManga(
  pageUrl: string,
  connector: HakuNekoConnector,
  deps: EngineDependencies,
): Promise<HakuNekoManga> {
  const template = getTemplate(connector.template);
  const uri = new URL(pageUrl);
  const ctx = createContext(connector, deps);
  if (template?.getMangaFromURI) {
    try {
      return await template.getMangaFromURI(uri, ctx);
    } catch {
      // fall through to heuristic
    }
  }
  // Heuristic: strip trailing /chapter-XX/ segments to get manga root.
  let pathname = uri.pathname;
  pathname = pathname.replace(/\/(chapter|ch|c|episode|ep|read)[-/_][\w.-]+\/?$/i, '/');
  pathname = pathname.replace(/\/$/, '');
  return { id: pathname || '/', title: '' };
}

/**
 * Fetch chapter list for the manga that contains a given page URL.
 * Returns undefined when no connector matches the URL.
 */
export async function fetchChaptersForUrl(options: HakuNekoBridgeOptions): Promise<HakuNekoChaptersResult | undefined> {
  const connector = options.connector || resolveConnector(options.pageUrl);
  if (!connector || connector.unsupported) return undefined;
  const template = getTemplate(connector.template);
  if (!template?.getChapters) return undefined;
  const manga = options.manga || (await deriveManga(options.pageUrl, connector, options.deps));
  const ctx = createContext(connector, options.deps);
  const chapters = await template.getChapters(manga, ctx);
  return { connector, manga, chapters };
}

/**
 * Fetch pages for a specific chapter via the connector's template.
 */
export async function fetchPagesForChapter(
  chapter: HakuNekoChapter,
  options: HakuNekoBridgeOptions,
): Promise<HakuNekoPagesResult | undefined> {
  const connector = options.connector || resolveConnector(options.pageUrl);
  if (!connector || connector.unsupported) return undefined;
  const template = getTemplate(connector.template);
  if (!template?.getPages) return undefined;
  const ctx = createContext(connector, options.deps);
  const pages = await template.getPages(chapter, ctx);
  return { connector, pages };
}

/**
 * Detect the next chapter URL on the current document using the Infy Scroll
 * keyword algorithm. Returns undefined when no link is found.
 */
export function detectNextChapterLink(document_: Document, selector?: string): InfyResult | undefined {
  return findInfyURL(document_, { direction: 'next', selector, keywordsEnabled: true });
}

export function detectPrevChapterLink(document_: Document, selector?: string): InfyResult | undefined {
  return findInfyURL(document_, { direction: 'prev', selector, keywordsEnabled: true });
}

export { resolveConnector, getTemplate };
