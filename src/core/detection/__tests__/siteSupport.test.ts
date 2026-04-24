import { resolveSiteSupport } from '@core/detection/adapters/siteSupport';

describe('resolveSiteSupport', () => {
  test('marks listed WP-Manga domains as supported', () => {
    const support = resolveSiteSupport('https://sushiscan.fr/manga/foo/chapter-1/');
    expect(support.status).toBe('supported');
    expect(support.family).toBe('WP-Manga / Madara');
  });

  test('marks webtoon/naver family as supported', () => {
    const support = resolveSiteSupport('https://comic.naver.com/webtoon/detail?titleId=1&no=2');
    expect(support.status).toBe('supported');
    expect(support.family).toBe('Webtoon / Naver');
  });

  test('marks locked readers as unsupported', () => {
    const support = resolveSiteSupport('https://page.kakao.com/content/12345');
    expect(support.status).toBe('unsupported');
    expect(support.family).toBe('Locked Reader');
  });

  test('marks Manga Downloader Plus reader-pattern domains as supported', () => {
    const support = resolveSiteSupport('https://readopm.com/manga/onepunch-man/chapter-200/');
    expect(support.status).toBe('supported');
    expect(support.family).toBe('Manga Downloader Plus reader patterns');
  });

  test('falls back to experimental for unknown domains', () => {
    const support = resolveSiteSupport('https://reader.example.com/series/chapter-1');
    expect(support.status).toBe('experimental');
    expect(support.family).toBe('Generic / Heuristic');
  });
});
