import type { ChapterLinkCandidate, ImageCollectionResult, PageScanResult } from '@shared/types';
import { discoverChapters, loadChapterPreview } from '@core/manga/chapterCrawler';

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

  it('fetches paginated listing pages to recover older chapters (including chapter 1)', async () => {
    const current = createChapterLink('https://example.com/series/chapter-3', 'current', 3, 1);
    const initialScan = createScan(
      'https://example.com/series/chapter-3',
      [current],
      'https://example.com/series/'
    );

    const fetchDocument = jest.fn(async (url: string) => {
      if (url === 'https://example.com/series/') {
        return `
          <html><body>
            <div class="main version-chap">
              <a href="https://example.com/series/chapter-3">Chapitre 3</a>
              <a href="https://example.com/series/chapter-2">Chapitre 2</a>
            </div>
            <div class="pagination">
              <a href="https://example.com/series/page/2/">2</a>
            </div>
          </body></html>
        `;
      }
      if (url === 'https://example.com/series/page/2/') {
        return `
          <html><body>
            <div class="main version-chap">
              <a href="https://example.com/series/chapter-1">Chapitre 1</a>
            </div>
          </body></html>
        `;
      }
      return '<html><body></body></html>';
    });

    const chapters = await discoverChapters(initialScan, { fetchDocument }, { maxListingPages: 3 });

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
    expect(fetchDocument).toHaveBeenCalledWith('https://example.com/series/page/2/', expect.anything());
  });

  it('merges raw chapter links from listing HTML when scan result misses some chapters', async () => {
    const current = createChapterLink('https://example.com/series/chapter-3', 'current', 3, 1);
    const initialScan = createScan(
      'https://example.com/series/chapter-3',
      [current],
      'https://example.com/series/'
    );

    const fetchDocument = jest.fn(async (url: string) => {
      if (url === 'https://example.com/series/') {
        return `
          <html><body>
            <ul class="main version-chap">
              <li class="wp-manga-chapter"><a href="https://example.com/series/chapter-3">Chapitre 3</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/series/chapter-2">Chapitre 2</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/series/chapter-1">Chapitre 1</a></li>
            </ul>
          </body></html>
        `;
      }
      return '<html><body></body></html>';
    });

    const scanPage = jest.fn().mockResolvedValue(createScan('https://example.com/series/', [], 'https://example.com/series/'));

    const chapters = await discoverChapters(initialScan, { fetchDocument, scanPage });

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
  });
});

describe('chapterCrawler loadChapterPreview', () => {
  it('prefers live scan results when scanPage dependency is available', async () => {
    const preview = await loadChapterPreview(
      'https://example.com/series/chapter-2',
      {
        fetchDocument: jest.fn(),
        scanPage: jest.fn().mockResolvedValue({
          page: {
            url: 'https://example.com/series/chapter-2',
            title: 'Chapter 2',
            host: 'example.com',
            pathname: '/series/chapter-2',
          },
          general: {
            items: [],
            totalCandidates: 0,
            diagnostics: [],
          },
          manga: {
            adapterId: 'generic',
            currentPages: {
              items: [
                {
                  id: 'live-1',
                  url: 'https://cdn.example.com/chapter-2/001.webp',
                  previewUrl: 'https://cdn.example.com/chapter-2/001.webp',
                  referrer: 'https://example.com/series/chapter-2',
                  headers: undefined,
                  transform: undefined,
                  canonicalUrl: 'https://cdn.example.com/chapter-2/001.webp',
                  querylessUrl: 'https://cdn.example.com/chapter-2/001.webp',
                  captureStrategy: 'network',
                  sourceKind: 'img-current-src',
                  origin: 'live-dom',
                  width: 1200,
                  height: 1800,
                  area: 2160000,
                  domIndex: 0,
                  top: 0,
                  left: 0,
                  altText: '',
                  titleText: '',
                  containerSignature: 'reader',
                  familyKey: 'cdn.example.com/chapter-2',
                  visible: true,
                  filenameHint: '001.webp',
                  extensionHint: 'webp',
                  pageNumber: 1,
                  score: 100,
                  diagnostics: [],
                },
              ],
              totalCandidates: 1,
              diagnostics: [],
            },
            chapters: [],
            navigation: {},
            diagnostics: [],
          },
        }),
      },
      { referrer: 'https://example.com/series/', tabId: 123 }
    );

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.url).toBe('https://cdn.example.com/chapter-2/001.webp');
    expect(preview.items[0]?.origin).toBe('static-html');
  });

  it('extracts images from embedded JSON/script when chapter HTML has no img tags', async () => {
    const chapterUrl = 'https://reader.example.com/series/chapter-2';
    const fetchDocument = jest.fn().mockResolvedValue(`
      <html>
        <head><title>Series Chapter 2</title></head>
        <body>
          <script type="application/json">
            {
              "pages": [
                "https://cdn.example.com/series/chapter-2/page-001.jpg",
                "https://cdn.example.com/series/chapter-2/page-002.jpg"
              ]
            }
          </script>
        </body>
      </html>
    `);

    const preview = await loadChapterPreview(chapterUrl, { fetchDocument }, { referrer: 'https://reader.example.com/series/' });

    expect(preview.items.length).toBeGreaterThanOrEqual(2);
    expect(preview.items.map((item) => item.url)).toEqual([
      'https://cdn.example.com/series/chapter-2/page-001.jpg',
      'https://cdn.example.com/series/chapter-2/page-002.jpg',
    ]);
  });
});
