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

function createMangaDexApiChapter(id: string, chapter: string, language = 'fr') {
  return {
    id,
    type: 'chapter',
    attributes: {
      chapter,
      title: null,
      translatedLanguage: language,
      volume: null,
      pages: 12,
    },
    relationships: [],
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

  it('drops listing pagination urls from discovered chapters and probes guessed listing pages', async () => {
    const initialScan = createScan(
      'https://example.com/series/chapter-3',
      [
        createChapterLink('https://example.com/series/page/3/', 'candidate', 3, 1),
      ],
      'https://example.com/series/'
    );

    const fetchDocument = jest.fn(async (url: string) => {
      if (url === 'https://example.com/series/page/2/') {
        return `
          <html><body>
            <ul class="main version-chap">
              <li class="wp-manga-chapter"><a href="https://example.com/series/chapter-2">Chapitre 2</a></li>
              <li class="wp-manga-chapter"><a href="https://example.com/series/chapter-1">Chapitre 1</a></li>
            </ul>
          </body></html>
        `;
      }
      return '<html><body></body></html>';
    });

    const scanPage = jest.fn(async (url: string) => {
      if (url === 'https://example.com/series/') {
        return createScan('https://example.com/series/', [], 'https://example.com/series/');
      }
      if (url === 'https://example.com/series/page/2/') {
        return createScan('https://example.com/series/page/2/', [
          createChapterLink('https://example.com/series/chapter-2', 'candidate', 2, 1),
          createChapterLink('https://example.com/series/chapter-1', 'candidate', 1, 1),
        ]);
      }
      return createScan(url, []);
    });

    const chapters = await discoverChapters(initialScan, {
      fetchDocument,
      scanPage,
    }, { maxListingPages: 3 });

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2]);
    expect(chapters.every((chapter) => !/\/page\/\d+/.test(chapter.url))).toBe(true);
  });

  it('repairs small chapter gaps by scanning reader navigation', async () => {
    const initialScan = createScan(
      'https://astral-manga.fr/manga/series',
      [
        createChapterLink('https://astral-manga.fr/manga/series/chapter/chapter-1-id', 'candidate', 1, 90),
        createChapterLink('https://astral-manga.fr/manga/series/chapter/chapter-3-id', 'candidate', 3, 90),
      ],
      'https://astral-manga.fr/manga/series'
    );

    const fetchDocument = jest.fn(async (url: string) => {
      if (url.includes('/chapter/')) {
        return '<html><body><h1>Chapitre</h1></body></html>';
      }
      return `
      <html><body>
        <a href="https://astral-manga.fr/manga/series/chapter/chapter-1-id">Chapitre 1</a>
        <a href="https://astral-manga.fr/manga/series/chapter/chapter-3-id">Chapitre 3</a>
      </body></html>
    `;
    });
    const scanPage = jest.fn(async (url: string) => {
      if (url.includes('chapter-3-id')) {
        return {
          ...createScan(url, [createChapterLink(url, 'current', 3, 100)]),
          manga: {
            ...createScan(url, [createChapterLink(url, 'current', 3, 100)]).manga,
            navigation: {
              current: createChapterLink(url, 'current', 3, 100),
              previous: {
                ...createChapterLink('https://astral-manga.fr/manga/series/chapter/chapter-2-id', 'previous', 0, 98),
                label: 'Précédent',
                chapterNumber: null,
              },
            },
          },
        };
      }
      return createScan(url, []);
    });

    const chapters = await discoverChapters(
      initialScan,
      { fetchDocument, scanPage },
      { maxDurationMs: 20_000 }
    );

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
    expect(chapters.find((chapter) => chapter.chapterNumber === 2)?.label).toBe('Chapitre 2');
    expect(scanPage).toHaveBeenCalledWith(
      'https://astral-manga.fr/manga/series/chapter/chapter-3-id',
      expect.objectContaining({ forceLive: true })
    );
  });

  it('loads MangaDex chapter lists from the public feed API on title pages', async () => {
    const mangaId = 'aac2001d-1b47-4103-9e78-7f3e72ea9851';
    const initialScan = createScan(`https://mangadex.org/title/${mangaId}/series`, []);
    const fetchDocument = jest.fn(async (url: string) => {
      if (url.startsWith(`https://api.mangadex.org/manga/${mangaId}/feed`)) {
        return JSON.stringify({
          total: 3,
          limit: 100,
          offset: 0,
          data: [
            createMangaDexApiChapter('a606faeb-fd0d-4cd8-8e33-2820e047332d', '1', 'en'),
            createMangaDexApiChapter('9a7a6f6c-5379-46e9-8fef-9baabe51fb30', '2', 'en'),
            createMangaDexApiChapter('19160590-69e1-44ea-bdfe-0536e02688ac', '3', 'en'),
          ],
        });
      }
      return '<html><body></body></html>';
    });

    const chapters = await discoverChapters(initialScan, { fetchDocument });

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3]);
    expect(chapters[1]?.url).toBe('https://mangadex.org/chapter/9a7a6f6c-5379-46e9-8fef-9baabe51fb30');
    expect(chapters[1]?.label).toBe('Chapitre 2 (en)');
  });

  it('uses MangaDex chapter metadata to fetch the feed in the current chapter language', async () => {
    const mangaId = 'aac2001d-1b47-4103-9e78-7f3e72ea9851';
    const chapterId = 'fc16ef74-2e52-4db7-a69d-4081282b6219';
    const initialScan = createScan(`https://mangadex.org/chapter/${chapterId}`, []);
    const fetchDocument = jest.fn(async (url: string) => {
      if (url.startsWith(`https://api.mangadex.org/chapter/${chapterId}`)) {
        return JSON.stringify({
          data: {
            ...createMangaDexApiChapter(chapterId, '13', 'fr'),
            relationships: [{ id: mangaId, type: 'manga' }],
          },
        });
      }
      if (url.startsWith(`https://api.mangadex.org/manga/${mangaId}/feed`)) {
        const feedUrl = new URL(url);
        expect(feedUrl.searchParams.get('translatedLanguage[]')).toBe('fr');
        return JSON.stringify({
          total: 2,
          limit: 100,
          offset: 0,
          data: [
            createMangaDexApiChapter('a606faeb-fd0d-4cd8-8e33-2820e047332d', '1', 'fr'),
            createMangaDexApiChapter('9a7a6f6c-5379-46e9-8fef-9baabe51fb30', '2', 'fr'),
          ],
        });
      }
      return '<html><body></body></html>';
    });

    const chapters = await discoverChapters(initialScan, { fetchDocument });

    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2]);
    expect(chapters[0]?.label).toBe('Chapitre 1');
    expect(fetchDocument).toHaveBeenCalledWith(
      expect.stringContaining(`https://api.mangadex.org/chapter/${chapterId}`),
      expect.anything()
    );
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

  it('falls back to static/html preview when live scan only returns the first image', async () => {
    const chapterUrl = 'https://reader.example.com/series/chapter-2';
    const preview = await loadChapterPreview(
      chapterUrl,
      {
        scanPage: jest.fn().mockResolvedValue({
          page: {
            url: chapterUrl,
            title: 'Chapter 2',
            host: 'reader.example.com',
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
                  url: 'https://cdn.example.com/series/chapter-2/page-001.jpg',
                  previewUrl: 'https://cdn.example.com/series/chapter-2/page-001.jpg',
                  referrer: chapterUrl,
                  headers: undefined,
                  transform: undefined,
                  canonicalUrl: 'https://cdn.example.com/series/chapter-2/page-001.jpg',
                  querylessUrl: 'https://cdn.example.com/series/chapter-2/page-001.jpg',
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
                  filenameHint: 'page-001.jpg',
                  extensionHint: 'jpg',
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
        fetchDocument: jest.fn().mockResolvedValue(`
          <html>
            <body>
              <div class="reading-content">
                <img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" data-src="https://cdn.example.com/series/chapter-2/page-001.jpg" />
                <img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" data-src="https://cdn.example.com/series/chapter-2/page-002.jpg" />
              </div>
            </body>
          </html>
        `),
      },
      { referrer: 'https://reader.example.com/series/' }
    );

    expect(preview.items.map((item) => item.url)).toEqual([
      'https://cdn.example.com/series/chapter-2/page-001.jpg',
      'https://cdn.example.com/series/chapter-2/page-002.jpg',
    ]);
  });

  it('filters svg extras out of chapter previews', async () => {
    const chapterUrl = 'https://reader.example.com/series/chapter-3';
    const preview = await loadChapterPreview(
      chapterUrl,
      {
        fetchDocument: jest.fn().mockResolvedValue(`
          <html>
            <body>
              <img src="https://cdn.example.com/series/chapter-3/page-001.jpg" alt="Page 1" />
              <img src="https://cdn.example.com/series/chapter-3/page-002.jpg" alt="Page 2" />
              <img src="data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E" alt="placeholder" />
            </body>
          </html>
        `),
      }
    );

    expect(preview.items).toHaveLength(2);
    expect(preview.items.some((item) => item.url.startsWith('data:image/svg+xml'))).toBe(false);
  });

  it('loads WeebCentral images from the htmx long-strip fragment', async () => {
    const chapterUrl = 'https://weebcentral.com/chapters/abc123';
    const fetchDocument = jest.fn(async (url: string) => {
      if (url === chapterUrl) {
        return `
          <html><body>
            <div id="last-chapter-top"></div>
            <div hx-get="/chapter/pages/abc123"></div>
          </body></html>
        `;
      }
      if (url === 'https://weebcentral.com/chapter/pages/abc123?is_prev=False&current_page=1&reading_style=long_strip') {
        return `
          <html><body>
            <section>
              <img src="/images/abc123/001.jpg" alt="Page 1" />
              <img src="/images/abc123/002.jpg" alt="Page 2" />
            </section>
          </body></html>
        `;
      }
      return '<html><body></body></html>';
    });

    const preview = await loadChapterPreview(chapterUrl, { fetchDocument });

    expect(preview.items.map((item) => item.url)).toEqual([
      'https://weebcentral.com/images/abc123/001.jpg',
      'https://weebcentral.com/images/abc123/002.jpg',
    ]);
    expect(fetchDocument).toHaveBeenCalledWith(
      'https://weebcentral.com/chapter/pages/abc123?is_prev=False&current_page=1&reading_style=long_strip',
      expect.objectContaining({ referrer: chapterUrl })
    );
  });

  it('loads MangaDex images directly from the at-home API', async () => {
    const chapterId = 'fc16ef74-2e52-4db7-a69d-4081282b6219';
    const chapterUrl = `https://mangadex.org/chapter/${chapterId}`;
    const fetchDocument = jest.fn(async (url: string) => {
      if (url === `https://api.mangadex.org/at-home/server/${chapterId}`) {
        return JSON.stringify({
          baseUrl: 'https://cmdxd98sb0x3yprd.mangadex.network',
          chapter: {
            hash: 'aff285f6aa83af6102b2e00f4e4a7f13',
            data: ['001.jpg', '002.jpg'],
            dataSaver: [],
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const preview = await loadChapterPreview(chapterUrl, { fetchDocument });

    expect(preview.items.map((item) => item.url)).toEqual([
      'https://cmdxd98sb0x3yprd.mangadex.network/data/aff285f6aa83af6102b2e00f4e4a7f13/001.jpg',
      'https://cmdxd98sb0x3yprd.mangadex.network/data/aff285f6aa83af6102b2e00f4e4a7f13/002.jpg',
    ]);
    expect(fetchDocument).toHaveBeenCalledTimes(1);
  });

  it('crawls legacy sequential reader pages when total_pages is embedded in scripts', async () => {
    const chapterUrl = 'https://www.mangatown.com/manga/series/c001/';
    const fetchDocument = jest.fn(async (url: string) => {
      if (url === chapterUrl) {
        return `
          <html><body>
            <script>var total_pages = 3;</script>
            <div class="read_img"><img id="image" src="https://cdn.example.com/c001/1.jpg" /></div>
          </body></html>
        `;
      }
      if (url === 'https://www.mangatown.com/manga/series/c001/2.html') {
        return '<html><body><div class="read_img"><img id="image" src="https://cdn.example.com/c001/2.jpg" /></div></body></html>';
      }
      if (url === 'https://www.mangatown.com/manga/series/c001/3.html') {
        return '<html><body><div class="read_img"><img id="image" src="https://cdn.example.com/c001/3.jpg" /></div></body></html>';
      }
      return '<html><body></body></html>';
    });

    const preview = await loadChapterPreview(chapterUrl, { fetchDocument });

    expect(preview.items.map((item) => item.url)).toEqual([
      'https://cdn.example.com/c001/1.jpg',
      'https://cdn.example.com/c001/2.jpg',
      'https://cdn.example.com/c001/3.jpg',
    ]);
  });
});
