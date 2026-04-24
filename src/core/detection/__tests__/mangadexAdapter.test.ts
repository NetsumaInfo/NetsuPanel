import { mangadexAdapter } from '@core/detection/adapters/mangadexAdapter';

describe('mangadexAdapter', () => {
  it('does not treat MangaDex home/feed links as a chapter list', () => {
    document.body.innerHTML = `
      <a href="/chapter/7f1c352b-2d1e-476d-bcaf-2705d5519317">Ch. 7 Random update</a>
      <a href="/chapter/21b2582b-f3fd-45eb-bee2-5cd36ac30aa2">Ch. 21 Another update</a>
    `;

    const result = mangadexAdapter.scan({
      document,
      page: {
        url: 'https://mangadex.org/',
        title: 'MangaDex - The Home of Comics and Manga',
        host: 'mangadex.org',
        pathname: '/',
      },
      origin: 'live-dom',
      imageCandidates: [],
    });

    expect(result.chapters).toEqual([]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'mangadex-no-series-context')).toBe(true);
  });
});
