/**
 * HakuNeko → NetsuPanel chapter list adapter.
 *
 * Wires the @core/hakuneko bridge to the existing chapterCrawler
 * accumulator (Map<canonicalUrl, ChapterItem>).
 */

import type { ChapterItem } from '@shared/types';
import { fetchChaptersForUrl, resolveConnector } from '@core/hakuneko';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';

export interface HakuNekoChapterBridgeDeps {
  fetchDocument(url: string, options?: { referrer?: string; tabId?: number }): Promise<string>;
  referrer?: string;
  tabId?: number;
}

function buildItem(absoluteUrl: string, title: string, language?: string): ChapterItem {
  const identity = parseChapterIdentity(title || absoluteUrl, absoluteUrl);
  const canonicalUrl = absoluteUrl.split('#')[0];
  return {
    id: canonicalUrl,
    url: absoluteUrl,
    canonicalUrl,
    label: identity.label || title || absoluteUrl,
    relation: 'candidate',
    chapterNumber: identity.chapterNumber,
    volumeNumber: identity.volumeNumber,
    score: 8, // template-sourced — higher confidence than generic heuristic.
    previewStatus: 'idle',
    diagnostics: language ? [`language=${language}`] : [],
  };
}

/**
 * Try to fetch the chapter list for `pageUrl` via the HakuNeko template registry.
 * Returns [] when no template matches or when the lookup fails.
 */
export async function discoverHakuNekoChapters(
  pageUrl: string,
  deps: HakuNekoChapterBridgeDeps,
): Promise<ChapterItem[]> {
  const connector = resolveConnector(pageUrl);
  if (!connector || connector.unsupported) return [];

  try {
    const result = await fetchChaptersForUrl({
      pageUrl,
      connector,
      deps: {
        fetchHtml: (url, options) =>
          deps.fetchDocument(url, {
            referrer: options?.referrer || deps.referrer,
            tabId: deps.tabId,
          }),
      },
    });
    if (!result) return [];
    const out: ChapterItem[] = [];
    for (const chapter of result.chapters) {
      try {
        const absolute = new URL(chapter.id, connector.url).href;
        out.push(buildItem(absolute, chapter.title || '', chapter.language));
      } catch {
        // Skip chapters with unparseable id.
      }
    }
    return out;
  } catch {
    return [];
  }
}

export { resolveConnector };
