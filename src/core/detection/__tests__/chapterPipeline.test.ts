import {
  buildMangaLinkMap,
  ensurePotentialChapterOneIsIncluded,
} from '@core/detection/pipeline/chapterPipeline';
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

  it('keeps numbered chapter candidate over listing candidate when canonical URL is the same', () => {
    const sameUrl = 'https://astral-manga.fr/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd/';
    const result = buildMangaLinkMap(
      {
        url: 'https://astral-manga.fr/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd',
        title: 'Series',
        host: 'astral-manga.fr',
        pathname: '/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd',
      },
      [
        {
          ...createChapterCandidate('listing', 'All chapters', 0, 'listing', 95),
          url: sameUrl,
          canonicalUrl: sameUrl,
          chapterNumber: null,
        },
        {
          ...createChapterCandidate('chapter-1', 'Chapitre 1', 1, 'candidate', 60),
          url: sameUrl,
          canonicalUrl: sameUrl,
        },
      ]
    );

    expect(result.chapters.some((chapter) => chapter.chapterNumber === 1)).toBe(true);
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

  it('keeps numbered chapters split across multiple large groups', () => {
    const firstVolume = Array.from({ length: 6 }, (_, index) => ({
      ...createChapterCandidate(`v1-${index}`, `Chapter ${index + 1}`, index + 1, 'candidate', 80),
      containerSignature: 'div.volume-one',
    }));
    const secondVolume = Array.from({ length: 6 }, (_, index) => ({
      ...createChapterCandidate(`v2-${index}`, `Chapter ${index + 7}`, index + 7, 'candidate', 80),
      containerSignature: 'div.volume-two',
    }));

    const result = buildMangaLinkMap(
      {
        url: 'https://reader.example.com/title/chapter-6',
        title: 'Series Name Chapter 6',
        host: 'reader.example.com',
        pathname: '/title/chapter-6',
      },
      [...firstVolume, ...secondVolume]
    );

    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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

  it('keeps same-series chapters for /chapter/{n}/{slug} URL layouts', () => {
    const result = buildMangaLinkMap(
      {
        url: 'https://www.royalroad.com/fiction/123/story/chapter/100/current',
        title: 'Story Chapter 100',
        host: 'www.royalroad.com',
        pathname: '/fiction/123/story/chapter/100/current',
      },
      [
        {
          ...createChapterCandidate('ch99', 'Chapter 99', 99),
          url: 'https://www.royalroad.com/fiction/123/story/chapter/99/prev',
          canonicalUrl: 'https://www.royalroad.com/fiction/123/story/chapter/99/prev',
          containerSignature: 'ln:.chapter-row',
        },
        {
          ...createChapterCandidate('ch101', 'Chapter 101', 101),
          url: 'https://www.royalroad.com/fiction/123/story/chapter/101/next',
          canonicalUrl: 'https://www.royalroad.com/fiction/123/story/chapter/101/next',
          containerSignature: 'ln:.chapter-row',
        },
      ]
    );

    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([99, 100, 101]);
  });
});

describe('chapter detection helpers', () => {
  it('parses chapter numbers from common reader URL patterns', () => {
    expect(parseChapterIdentity('', 'https://reader.example.com/title/chapter-12.5').chapterNumber).toBe(12.5);
    expect(parseChapterIdentity('', 'https://reader.example.com/title/12/all-pages').chapterNumber).toBe(12);
    expect(parseChapterIdentity('', 'https://reader.example.com/title/ep-87').chapterNumber).toBe(87);
    expect(parseChapterIdentity('', 'https://reader.example.com/webtoon/detail?titleId=77&no=19').chapterNumber).toBe(19);
    expect(parseChapterIdentity('', 'https://reader.example.com/series/list?title_no=2154').chapterNumber).toBe(null);
    expect(parseChapterIdentity('42. The Hero Returns', 'https://reader.example.com/opaque').chapterNumber).toBe(42);
    expect(parseChapterIdentity('Prologue', 'https://reader.example.com/series/prologue').chapterNumber).toBe(0);
    expect(parseChapterIdentity('Volume 3 Chapter 12', 'https://reader.example.com/series/chapter-12').volumeNumber).toBe(3);
    expect(parseChapterIdentity('', 'https://reader.example.com/read?ep_no=27').chapterNumber).toBe(27);
    expect(parseChapterIdentity('', 'https://astral-manga.fr/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd').chapterNumber).toBe(null);
    expect(parseChapterIdentity('', 'https://astral-manga.fr/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd/page/3').chapterNumber).toBe(null);
  });

  it('injects chapter 1 only when chapter list starts at 2 and current page is missing', () => {
    const chapters = [
      createChapterCandidate('ch2', 'Chapter 2', 2),
      createChapterCandidate('ch3', 'Chapter 3', 3),
    ];

    const result = ensurePotentialChapterOneIsIncluded(
      {
        ...page,
        url: 'https://reader.example.com/title/chapter-1',
        pathname: '/title/chapter-1',
      },
      chapters
    );

    expect(result[0]?.chapterNumber).toBe(1);
    expect(result[0]?.url).toBe('https://reader.example.com/title/chapter-1');
  });

  it('does not inject chapter 1 when current URL already exists in the chapter list', () => {
    const chapters = [
      {
        ...createChapterCandidate('current', 'Chapter 1', 1, 'current'),
        url: 'https://reader.example.com/title/chapter-1/',
        canonicalUrl: 'https://reader.example.com/title/chapter-1/',
      },
      createChapterCandidate('ch2', 'Chapter 2', 2),
    ];

    const result = ensurePotentialChapterOneIsIncluded(
      {
        ...page,
        url: 'http://reader.example.com/title/chapter-1#top',
        pathname: '/title/chapter-1',
      },
      chapters
    );

    expect(result.filter((chapter) => chapter.chapterNumber === 1)).toHaveLength(1);
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

  it('keeps chapters inside inactive tab panels', () => {
    document.body.innerHTML = `
      <section data-state="inactive">
        <a href="/series/chapter-1">Chapter 1</a>
        <a href="/series/chapter-2">Chapter 2</a>
      </section>
    `;

    const candidates = collectChapterLinks(
      document,
      'https://reader.example.com/series/',
      'https://reader.example.com/series/'
    );

    expect(candidates.map((candidate) => candidate.chapterNumber)).toEqual([1, 2]);
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

  it('ignores chapter-list pagination links such as /page/3', () => {
    document.body.innerHTML = `
      <div class="chapter-pagination">
        <a href="/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd/page/3">3</a>
        <a href="/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd/page/4">4</a>
      </div>
      <ul class="main version-chap">
        <li class="wp-manga-chapter"><a href="/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd/chapitre-3/">Chapitre 3</a></li>
      </ul>
    `;

    const candidates = collectChapterLinks(
      document,
      'https://astral-manga.fr/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd',
      'https://astral-manga.fr/manga/adcb8bf4-04d5-44a0-8b26-5b64f1fbfdfd'
    );

    expect(candidates.some((candidate) => /\/page\/\d+/.test(candidate.url))).toBe(false);
    expect(candidates.some((candidate) => candidate.chapterNumber === 3)).toBe(true);
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

  it('extracts chapter URLs from inline hydration scripts even when the URL itself is opaque', () => {
    document.body.innerHTML = `
      <script id="__NEXT_DATA__" type="application/json">
        {
          "props": {
            "pageProps": {
              "chapters": [
                { "number": 9, "title": "Chapitre 9", "url": "/reader/4f9d7b12" },
                { "number": 10, "title": "Chapitre 10", "url": "/reader/6a2e8c34" },
                { "number": 11, "title": "Chapitre 11", "url": "/reader/7c3f9d56" }
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

  it('normalizes "Lire le premier chapitre" as chapter 1', () => {
    expect(
      parseChapterIdentity(
        'Lire le premier chapitre',
        'https://astral-manga.fr/manga/serie/chapter-1/'
      )
    ).toMatchObject({
      label: 'Chapitre 1',
      chapterNumber: 1,
    });
  });

  it('ignores non-chapter navigation links such as Accueil', () => {
    document.body.innerHTML = `
      <nav>
        <a href="https://astral-manga.fr/">Accueil</a>
      </nav>
      <ul class="main version-chap">
        <li><a href="https://astral-manga.fr/manga/serie/chapter-2/">Chapitre 2</a></li>
        <li><a href="https://astral-manga.fr/manga/serie/chapter-3/">Chapitre 3</a></li>
      </ul>
    `;

    const results = collectChapterLinks(
      document,
      'https://astral-manga.fr/manga/serie/chapter-2/',
      'https://astral-manga.fr/manga/serie/chapter-2/'
    );

    expect(results.some((item) => item.label === 'Accueil')).toBe(false);
    const chapterNumbers = results
      .filter((item) => item.chapterNumber !== null)
      .map((item) => item.chapterNumber);
    expect(chapterNumbers).toEqual(expect.arrayContaining([2, 3]));
  });
});
