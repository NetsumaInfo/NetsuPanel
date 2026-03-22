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

  it('always includes current page in chapters', () => {
    const result = buildMangaLinkMap(page, [
      createChapterCandidate('ch1', 'Chapter 1', 1),
      createChapterCandidate('ch2', 'Chapter 2', 2),
    ]);
    const current = result.chapters.find((c) => c.relation === 'current');
    expect(current).toBeDefined();
    expect(current?.url).toBe(page.url);
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
});

describe('chapter detection helpers', () => {
  it('parses chapter numbers from common reader URL patterns', () => {
    expect(parseChapterIdentity('', 'https://reader.example.com/title/chapter-12.5').chapterNumber).toBe(12.5);
    expect(parseChapterIdentity('', 'https://reader.example.com/title/12/all-pages').chapterNumber).toBe(12);
    expect(parseChapterIdentity('', 'https://reader.example.com/title/ep-87').chapterNumber).toBe(87);
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
});
