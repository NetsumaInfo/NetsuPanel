import {
  isSafeRenderableImageSrc,
  isSupportedFetchedImageMime,
  normalizeHttpUrl,
  sanitizeRequestHeaders,
} from '@shared/utils/resourcePolicy';

describe('resourcePolicy', () => {
  test('allows only supported raster image mimes', () => {
    expect(isSupportedFetchedImageMime('image/png')).toBe(true);
    expect(isSupportedFetchedImageMime('image/svg+xml')).toBe(false);
  });

  test('normalizes only http and https urls', () => {
    expect(normalizeHttpUrl(' https://example.com/a ')).toBe('https://example.com/a');
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
  });

  test('drops unsafe request headers', () => {
    expect(
      sanitizeRequestHeaders({
        Accept: 'image/webp',
        Cookie: 'blocked=true',
        Authorization: 'secret',
        'X-Requested-With': 'XMLHttpRequest',
      })
    ).toEqual({
      accept: 'image/webp',
      'x-requested-with': 'XMLHttpRequest',
    });
  });

  test('blocks svg data urls in render path', () => {
    expect(isSafeRenderableImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeRenderableImageSrc('data:image/svg+xml,%3Csvg%3E%3C/svg%3E')).toBe(false);
  });
});
