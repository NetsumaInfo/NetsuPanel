import { resolveCandidateImageMode, resolveCandidateImageSrc } from '@app/services/imagePresentation';

describe('imagePresentation', () => {
  test('keeps a proxy preview when both proxy and direct image links are available', () => {
    const candidate = {
      url: 'https://cdn.example.com/chapter-12/page-001.webp',
      previewUrl: 'https://reader.example.com/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fchapter-12%2Fpage-001.webp&w=1920&q=75',
      captureStrategy: 'network' as const,
    };

    expect(resolveCandidateImageSrc(candidate)).toBe(
      'https://reader.example.com/_next/image?url=https%3A%2F%2Fcdn.example.com%2Fchapter-12%2Fpage-001.webp&w=1920&q=75'
    );
    expect(resolveCandidateImageMode(candidate)).toBe('auto');
  });

  test('keeps capture-first for content-only image handles', () => {
    const candidate = {
      url: 'content://canvas/image-7',
      previewUrl: '',
      captureStrategy: 'content' as const,
    };

    expect(resolveCandidateImageSrc(candidate)).toBe('content://canvas/image-7');
    expect(resolveCandidateImageMode(candidate)).toBe('capture-first');
  });

  test('keeps inline previews when already renderable', () => {
    const candidate = {
      url: 'https://cdn.example.com/chapter-12/page-003.webp',
      previewUrl: 'data:image/png;base64,AA==',
      captureStrategy: 'network' as const,
    };

    expect(resolveCandidateImageSrc(candidate)).toBe('data:image/png;base64,AA==');
    expect(resolveCandidateImageMode(candidate)).toBe('auto');
  });
});
