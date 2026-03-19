import { webtoonAdapter } from '@core/detection/adapters/webtoonAdapter';
import type { PageIdentity, RawImageCandidate } from '@shared/types';

function makePage(url: string, title = 'Episode 69'): PageIdentity {
  const parsed = new URL(url);
  return {
    url,
    title,
    host: parsed.host,
    pathname: parsed.pathname,
  };
}

function scanHtml(html: string, url: string, imageCandidates: RawImageCandidate[] = []) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return webtoonAdapter.scan({
    document,
    page: makePage(url),
    origin: 'static-html',
    imageCandidates,
  });
}

describe('webtoonAdapter', () => {
  test('matches Naver Webtoon domains', () => {
    expect(webtoonAdapter.matches('https://comic.naver.com/webtoon/detail?titleId=1&no=2')).toBe(true);
  });

  test('prefers data-src over thumb src on viewer pages', () => {
    const result = scanHtml(
      `
        <div id="sectionContWide">
          <img src="https://webtoon-phinf.pstatic.net/thumb_001.jpg"
               data-src="https://webtoon-phinf.pstatic.net/full_001.jpg" />
          <img src="https://webtoon-phinf.pstatic.net/thumb_002.jpg"
               data-url="https://webtoon-phinf.pstatic.net/full_002.jpg" />
        </div>
      `,
      'https://comic.naver.com/webtoon/detail?titleId=1&no=69'
    );

    expect(result.currentPages.items.length).toBeGreaterThan(0);
    expect(result.currentPages.items.every((item) => !/thumb/i.test(item.url))).toBe(true);
  });

  test('ignores listing thumbnails when not on an episode page', () => {
    const result = scanHtml(
      `
        <div class="episode_lst">
          <a href="/webtoon/detail?titleId=1&no=69">Episode 69</a>
          <img src="https://webtoon-phinf.pstatic.net/thumb_001.jpg" />
          <img src="https://webtoon-phinf.pstatic.net/thumb_002.jpg" />
        </div>
      `,
      'https://comic.naver.com/webtoon/list?titleId=1',
      [
        {
          id: 'thumb-1',
          url: 'https://webtoon-phinf.pstatic.net/thumb_001.jpg',
          previewUrl: 'https://webtoon-phinf.pstatic.net/thumb_001.jpg',
          captureStrategy: 'network',
          sourceKind: 'img-src',
          origin: 'live-dom',
          width: 202,
          height: 142,
          domIndex: 0,
          top: 0,
          left: 0,
          altText: '',
          titleText: '',
          containerSignature: 'div:episode-list',
          visible: true,
          diagnostics: [],
        },
      ]
    );

    expect(result.currentPages.items).toHaveLength(0);
    expect(result.diagnostics.some((item) => item.code === 'webtoon-listing-page')).toBe(true);
    expect(result.chapters.length).toBeGreaterThan(0);
  });
});
