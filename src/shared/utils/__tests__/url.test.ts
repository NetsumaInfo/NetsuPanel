import { unwrapProxiedImageUrl } from '@shared/utils/url';

describe('url utils', () => {
  test('unwraps _next/image style proxy url', () => {
    expect(
      unwrapProxiedImageUrl(
        'https://astral-manga.fr/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fchapter%2F001.webp&w=1920&q=75'
      )
    ).toBe('https://cdn.example.com/chapter/001.webp');
  });

  test('unwraps cloudflare cdn-cgi image proxy path', () => {
    expect(
      unwrapProxiedImageUrl(
        'https://astral-manga.fr/cdn-cgi/image/width=960,quality=85/https://cdn.example.com/chapter/002.webp'
      )
    ).toBe('https://cdn.example.com/chapter/002.webp');
  });

  test('keeps direct image url unchanged', () => {
    expect(
      unwrapProxiedImageUrl('https://cdn.example.com/chapter/003.webp')
    ).toBe('https://cdn.example.com/chapter/003.webp');
  });
});
