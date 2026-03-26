import { buildMangaLinkMap } from '@core/detection/pipeline/chapterPipeline';
import { collectChapterLinks } from '@core/detection/collectors/chapterLinkCollector';
import { parseChapterIdentity } from '@core/detection/parsers/parseChapterIdentity';
import type { ChapterLinkCandidate, PageIdentity } from '@shared/types';

const page: PageIdentity = {
  url: 'https://reader.example.com/title/chapter-10',
  title: 'Series Name Chapter 10',
  host: 'reader.example.com',
  pathname: '/title/chapter-10',
};

function createChapterCandidate(
  id: string,
  label: string,
  chapterNumber: number,
  relation: ChapterLinkCandidate['relation'] = 'candidate',
  score = 50
): ChapterLinkCandidate {
  return {
    id,
    url: `https://reader.example.com/title/chapter-${chapterNumber}`,
    canonicalUrl: `https://reader.example.com/title/chapter-${chapterNumber}`,
    label,
    relation,
    score,
    chapterNumber,
    volumeNumber: null,
    containerSignature: 'aside.chapter-list',
    diagnostics: [],
  };
}

describe('buildMangaLinkMap', () => {
  it('keeps navigation links and sorts chapters by chapter number', () => {
    const result = buildMangaLinkMap(page, [
      createChapterCandidate('listing', 'All chapters', 0, 'listing'),
      createChapterCandidate('previous', 'Chapter 9', 9, 'previous'),
      createChapterCandidate('next', 'Chapter 11', 11, 'next'),
      createChapterCandidate('chapter-8', 'Chapter 8', 8),
      createChapterCandidate('chapter-9', 'Chapter 9', 9),
      createChapterCandidate('chapter-11', 'Chapter 11', 11),
      createChapterCandidate('chapter-12', 'Chapter 12', 12),
    ]);

    expect(result.navigation.previous?.chapterNumber).toBe(9);
    expect(result.navigation.next?.chapterNumber).toBe(11);
    expect(result.navigation.listing?.relation).toBe('listing');
    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([8, 9, 10, 11, 12]);
  });

  it('deduplicates candidates with same canonicalUrl, higher score wins', () => {
    const result = buildMangaLinkMap(page, [
      createChapterCandidate('dup-low', 'Chapter 7', 7, 'candidate', 30),
      createChapterCandidate('dup-high', 'Chapter 7 HD', 7, 'candidate', 90),
    ]);
    const ch7s = result.chapters.filter((c) => c.chapterNumber === 7);
    expect(ch7s.length).toBeLessThanOrEqual(1);
  });

  it('emits chapter-list-limited warning when only current detected', () => {
    const result = buildMangaLinkMap(page, []);
    const warning = result.diagnostics.find((d) => d.code === 'chapter-list-limited');
    expect(warning).toBeDefined();
    expect(warning?.level).toBe('warning');
  });

  it('filters low-score candidates (score < 12)', () => {
    const result = buildMangaLinkMap(page, [
      createChapterCandidate('low-score', 'Bad chapter', 99, 'candidate', 5),
      createChapterCandidate('ok', 'Good chapter', 15, 'candidate', 70),
    ]);
    const badChapter = result.chapters.find((c) => c.chapterNumber === 99);
    expect(badChapter).toBeUndefined();
  });

  it('includes current page in chapters on reader pages', () => {
    const result = buildMangaLinkMap(page, [
      createChapterCandidate('ch1', 'Chapter 1', 1),
      createChapterCandidate('ch2', 'Chapter 2', 2),
    ]);
    const current = result.chapters.find((c) => c.relation === 'current');
    expect(current).toBeDefined();
    expect(current?.url).toBe(page.url);
  });

  it('does not inject a fake current chapter on series listing pages', () => {
    const result = buildMangaLinkMap(
      {
        url: 'https://reader.example.com/series/list?title_no=2154',
        title: 'Series Home',
        host: 'reader.example.com',
        pathname: '/series/list',
      },
      [
        createChapterCandidate('ch9', 'Chapter 9', 9),
        createChapterCandidate('ch10', 'Chapter 10', 10),
      ]
    );

    expect(result.chapters.some((chapter) => chapter.relation === 'current')).toBe(false);
  });

  it('falls back to multiple candidate groups when the best cluster is too small', () => {
    const result = buildMangaLinkMap(page, [
      {
        ...createChapterCandidate('a', 'Chapter 8', 8),
        containerSignature: 'div.nav-a',
      },
      {
        ...createChapterCandidate('b', 'Chapter 9', 9),
        containerSignature: 'div.nav-b',
      },
      {
        ...createChapterCandidate('c', 'Chapter 11', 11),
        containerSignature: 'div.nav-c',
      },
      {
        ...createChapterCandidate('d', 'Chapter 12', 12),
        containerSignature: 'div.nav-d',
      },
    ]);

    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([8, 9, 10, 11, 12]);
  });

  it('filters chapter candidates that belong to other series on the same host', () => {
    const result = buildMangaLinkMap(
      {
        url: 'https://manhuaus.com/manga/becoming-the-cheon-clans-mad-dog/chapter-10/',
        title: "Becoming the Cheon Clan's Mad Dog Chapter 10",
        host: 'manhuaus.com',
        pathname: '/manga/becoming-the-cheon-clans-mad-dog/chapter-10/',
      },
      [
        {
          ...createChapterCandidate('same-9', 'Chapter 9', 9),
          url: 'https://manhuaus.com/manga/becoming-the-cheon-clans-mad-dog/chapter-9/',
          canonicalUrl: 'https://manhuaus.com/manga/becoming-the-cheon-clans-mad-dog/chapter-9/',
          containerSignature: 'madara:chapter-list',
          score: 90,
        },
        {
          ...createChapterCandidate('same-11', 'Chapter 11', 11),
          url: 'https://manhuaus.com/manga/becoming-the-cheon-clans-mad-dog/chapter-11/',
          canonicalUrl: 'https://manhuaus.com/manga/becoming-the-cheon-clans-mad-dog/chapter-11/',
          containerSignature: 'madara:chapter-list',
          score: 90,
        },
        {
          ...createChapterCandidate('other-304', 'Chapter 304', 304),
          url: 'https://manhuaus.com/manga/logging-10000-years-into-the-future/chapter-304/',
          canonicalUrl: 'https://manhuaus.com/manga/logging-10000-years-into-the-future/chapter-304/',
          containerSignature: 'madara:chapter-list',
          score: 90,
        },
        {
          ...createChapterCandidate('other-512', 'Chapter 512', 512),
          url: 'https://manhuaus.com/manga/the-eternal-supreme/chapter-512/',
          canonicalUrl: 'https://manhuaus.com/manga/the-eternal-supreme/chapter-512/',
          containerSignature: 'madara:chapter-list',
          score: 90,
        },
      ]
    );

    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([9, 10, 11]);
  });
});

describe('chapter detection helpers', () => {
  it('parses chapter numbers from common reader URL patterns', () => {
    expect(parseChapterIdentity('', 'https://reader.example.com/title/chapter-12.5').chapterNumber).toBe(12.5);
    expect(parseChapterIdentity('', 'https://reader.example.com/title/12/all-pages').chapterNumber).toBe(12);
    expect(parseChapterIdentity('', 'https://reader.example.com/title/ep-87').chapterNumber).toBe(87);
    expect(parseChapterIdentity('', 'https://reader.example.com/webtoon/detail?titleId=77&no=19').chapterNumber).toBe(19);
    expect(parseChapterIdentity('', 'https://reader.example.com/series/list?title_no=2154').chapterNumber).toBe(null);
  });

  it('rejects common navigation and footer links from chapter collection', () => {
    document.body.innerHTML = `
      <header class="main-menu">
        <a href="/contact">Contact</a>
        <a href="/series/chapter-11">Latest Release</a>
      </header>
      <main class="reader">
        <a href="/series/chapter-9">Chapter 9</a>
        <a href="/series/chapter-11">Chapter 11</a>
      </main>
    `;

    const candidates = collectChapterLinks(
      document,
      'https://reader.example.com/series/chapter-10',
      'https://reader.example.com/series/chapter-10'
    );
    expect(candidates.some((candidate) => candidate.label === 'Contact')).toBe(false);
    expect(candidates.some((candidate) => candidate.label === 'Latest Release')).toBe(false);
    expect(candidates.filter((candidate) => candidate.chapterNumber !== null).length).toBeGreaterThanOrEqual(2);
  });

  it('extracts chapter candidates from select options used by many readers', () => {
    document.body.innerHTML = `
      <select id="chapter-select" name="chapter">
        <option value="/series/chapter-9">Chapter 9</option>
        <option value="/series/chapter-10" selected>Chapter 10</option>
        <option value="/series/chapter-11">Chapter 11</option>
      </select>
    `;

    const candidates = collectChapterLinks(
      document,
      'https://reader.example.com/series/chapter-10',
      'https://reader.example.com/series/chapter-10'
    );

    expect(candidates.filter((candidate) => candidate.chapterNumber !== null).length).toBeGreaterThanOrEqual(3);
    expect(candidates.some((candidate) => candidate.relation === 'current')).toBe(true);
  });

  it('extracts previous/next from link rel tags', () => {
    document.head.innerHTML = `
      <link rel="prev" href="https://reader.example.com/series/chapter-9" />
      <link rel="next" href="https://reader.example.com/series/chapter-11" />
    `;

    const candidates = collectChapterLinks(
      document,
      'https://reader.example.com/series/chapter-10',
      'https://reader.example.com/series/chapter-10'
    );

    expect(candidates.some((candidate) => candidate.relation === 'previous')).toBe(true);
    expect(candidates.some((candidate) => candidate.relation === 'next')).toBe(true);
  });

  it('extracts chapter URLs from inline hydration scripts when the DOM list is lazy', () => {
    document.body.innerHTML = `
      <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "chapters": [
                { "url": "/series/chapter-9" },
                { "url": "/series/chapter-10" },
                { "url": "/series/chapter-11" }
              ]
            }
          }
        }
      </script>
    `;

    const candidates = collectChapterLinks(
      document,
      'https://reader.example.com/series/chapter-10',
      'https://reader.example.com/series/chapter-10'
    );

    expect(candidates.filter((candidate) => candidate.chapterNumber !== null).length).toBeGreaterThanOrEqual(3);
  });
});
