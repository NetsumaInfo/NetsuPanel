/**
 * HakuNeko-compatible chapter extraction module.
 *
 * Public surface:
 *   - resolveConnector(url): connector descriptor for a page URL
 *   - fetchChaptersForUrl(opts): chapter list via per-site template
 *   - fetchPagesForChapter(chapter, opts): page URLs via per-site template
 *   - detectNextChapterLink(doc): Infy-Scroll next-link detection
 *   - findInfyURL(doc, opts): generic next/prev detector
 */

export type {
  HakuNekoChapter,
  HakuNekoConnector,
  HakuNekoContext,
  HakuNekoManga,
  HakuNekoPage,
  HakuNekoTemplate,
  RequestLike,
} from './types';
export { createContext, createDOM, getAbsolutePath, getRootRelativeOrAbsoluteLink, type EngineDependencies } from './engine';
export { resolveConnector, listConnectors } from './registry';
export { getTemplate, listTemplates } from './templates';
export {
  fetchChaptersForUrl,
  fetchPagesForChapter,
  detectNextChapterLink,
  detectPrevChapterLink,
  type HakuNekoBridgeOptions,
  type HakuNekoChaptersResult,
  type HakuNekoPagesResult,
} from './bridge';
export {
  findInfyURL,
  INFY_NEXT_KEYWORDS,
  INFY_PREV_KEYWORDS,
  type InfyDetectOptions,
  type InfyResult,
} from './infyDetect';
