import { lightNovelAdapter } from '@core/detection/adapters/lightNovelAdapter';
import type { PageIdentity, RawImageCandidate } from '@shared/types';

function makePage(url: string, title = 'Chapter 100'): PageIdentity {
  const parsed = new URL(url);
  return {
    url,
    title,
    host: parsed.host,
    pathname: parsed.pathname,
  };
}

function scanHtml(html: string, url: string, title = 'Chapter 100', imageCandidates: RawImageCandidate[] = []) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return lightNovelAdapter.scan({
    document,
    page: makePage(url, title),
    origin: 'static-html',
    imageCandidates,
  });
}

describe('lightNovelAdapter', () => {
  test('matches known light novel domains and fiction paths', () => {
    expect(lightNovelAdapter.matches('https://www.royalroad.com/fiction/123/story-name/chapter/100')).toBe(true);
    expect(lightNovelAdapter.matches('https://reader.example.com/fiction/123/story-name/chapter-12')).toBe(true);
    expect(lightNovelAdapter.matches('https://reader.example.com/manga/series/12')).toBe(false);
  });

  test('detects chapter list and navigation on a reader page', () => {
    const result = scanHtml(
      `
        <table id="chapters">
          <tr class="chapter-row"><td><a href="/fiction/123/story/chapter/99/prev">Chapter 99</a></td></tr>
          <tr class="chapter-row"><td><a href="/fiction/123/story/chapter/100/current">Chapter 100</a></td></tr>
          <tr class="chapter-row"><td><a href="/fiction/123/story/chapter/101/next">Chapter 101</a></td></tr>
        </table>
        <a rel="prev" href="/fiction/123/story/chapter/99/prev">Previous</a>
        <a rel="next" href="/fiction/123/story/chapter/101/next">Next</a>
      `,
      'https://www.royalroad.com/fiction/123/story/chapter/100/current',
      'Story Chapter 100'
    );

    expect(result.chapters.map((chapter) => chapter.chapterNumber)).toEqual([99, 100, 101]);
    expect(result.navigation.previous?.chapterNumber).toBe(99);
    expect(result.navigation.next?.chapterNumber).toBe(101);
  });

  test('does not infer fake chapter 1 on a listing page starting at chapter 2', () => {
    const result = scanHtml(
      `
        <table id="chapters">
          <tr class="chapter-row"><td><a href="/fiction/123/story/chapter/2/second">Chapter 2</a></td></tr>
          <tr class="chapter-row"><td><a href="/fiction/123/story/chapter/3/third">Chapter 3</a></td></tr>
        </table>
      `,
      'https://www.royalroad.com/fiction/123/story',
      'Story Index'
    );

    expect(result.chapters.some(
      (chapter) =>
        chapter.chapterNumber === 1 &&
        chapter.url === 'https://www.royalroad.com/fiction/123/story'
    )).toBe(false);
    expect(result.chapters.filter((chapter) => chapter.chapterNumber !== null).map((chapter) => chapter.chapterNumber)).toEqual([2, 3]);
  });
});
