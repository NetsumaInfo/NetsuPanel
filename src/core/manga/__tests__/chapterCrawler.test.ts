import type { ChapterLinkCandidate, ImageCollectionResult, PageScanResult } from '@shared/types';
import { discoverChapters } from '@core/manga/chapterCrawler';

const emptyCollection: ImageCollectionResult = {
  items: [],
  totalCandidates: 0,
  diagnostics: [],
};

function createChapterLink(
  url: string,
  relation: ChapterLinkCandidate['relation'],
  chapterNumber: number,
  score = 0.8
): ChapterLinkCandidate {
  return {
    id: url,
    url,
    canonicalUrl: url,
    label: `Chapitre ${chapterNumber}`,
    relation,
    score,
    chapterNumber,
    volumeNumber: null,
    containerSignature: 'test',
    diagnostics: [],
  };
}

function createScan(url: string, chapters: ChapterLinkCandidate[], listingUrl?: string): PageScanResult {
  const parsed = new URL(url);
  return {
    page: {
      url,
      title: 'Test',
      host: parsed.host,
      pathname: parsed.pathname,
    },
    general: emptyCollection,
    manga: {
      adapterId: 'generic',
      currentPages: emptyCollection,
      chapters,
      navigation: {
        current: chapters.find((chapter) => chapter.relation === 'current'),
        listing: listingUrl ? createChapterLink(listingUrl, 'listing', 0, 0.4) : undefined,
      },
      diagnostics: [],
    },
  };
}

describe('chapterCrawler discoverChapters', () => {
  it('keeps initial chapters when remote listing fetch is denied', async () => {
    const current = createChapterLink('https://example.com/chapter-1', 'current', 1, 1);
    const next = createChapterLink('https://example.com/chapter-2', 'next', 2, 0.9);
    const initialScan = createScan(
      'https://example.com/chapter-1',
      [current, next],
      'https://example.com/listing'
    );
    const fetchDocument = jest.fn().mockRejectedValue(new Error('HTTP 403'));

    const chapters = await discoverChapters(initialScan, { fetchDocument });

    expect(chapters).toHaveLength(2);
    expect(chapters.map((chapter) => chapter.canonicalUrl)).toEqual([
      'https://example.com/chapter-1',
      'https://example.com/chapter-2',
    ]);
    expect(fetchDocument).toHaveBeenCalledWith('https://example.com/listing', {});
  });
});

