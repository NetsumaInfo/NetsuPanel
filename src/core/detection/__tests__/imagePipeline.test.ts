/**
 * Tests critiques : pipeline imageCandidatePipeline
 * - tri des pages manga
 * - déduplication
 * - normalisation
 * - sélection du cluster narratif
 */
import type { RawImageCandidate } from '@shared/types';
import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';

function makeMangaCandidate(overrides: Partial<RawImageCandidate> & { id: string; url: string }): RawImageCandidate {
  return {
    previewUrl: overrides.url,
    captureStrategy: 'network',
    sourceKind: 'img-tag',
    origin: 'live-dom',
    width: 800,
    height: 1200,
    domIndex: 0,
    top: 0,
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: 'div:reader',
    visible: true,
    diagnostics: [],
    ...overrides,
  };
}

describe('buildImageCollection — mode manga', () => {
  test('returns empty when no candidates', () => {
    const result = buildImageCollection([], 'manga');
    expect(result.items).toHaveLength(0);
  });

  test('deduplicates candidates with same URL', () => {
    const url = 'https://cdn.example.com/manga/ch01/001.jpg';
    const candidates = [
      makeMangaCandidate({ id: 'a', url }),
      makeMangaCandidate({ id: 'b', url }),
      makeMangaCandidate({ id: 'c', url }),
    ];
    const result = buildImageCollection(candidates, 'manga');
    const urls = result.items.map((i) => i.url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  test('filters obviously junk images (logo, icon, pixel)', () => {
    const candidates = [
      makeMangaCandidate({ id: 'logo', url: 'https://site.com/logo.png', width: 64, height: 64 }),
      makeMangaCandidate({ id: 'ad', url: 'https://ads.site.com/banner/tracking.gif', width: 1, height: 1 }),
      makeMangaCandidate({ id: 'page1', url: 'https://cdn.site.com/manga/001.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page2', url: 'https://cdn.site.com/manga/002.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page3', url: 'https://cdn.site.com/manga/003.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page4', url: 'https://cdn.site.com/manga/004.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page5', url: 'https://cdn.site.com/manga/005.jpg', width: 800, height: 1200 }),
    ];
    const result = buildImageCollection(candidates, 'manga');
    // Junk items should not dominate
    const junkInResult = result.items.filter((i) =>
      /logo|tracking|banner/.test(i.url)
    );
    expect(junkInResult).toHaveLength(0);
  });

  test('filters thumbnail urls from manga page candidates', () => {
    const candidates = [
      makeMangaCandidate({ id: 'thumb-1', url: 'https://cdn.site.com/thumb_001.jpg', width: 202, height: 142 }),
      makeMangaCandidate({ id: 'thumb-2', url: 'https://cdn.site.com/thumbnail-002.jpg', width: 202, height: 142 }),
      makeMangaCandidate({ id: 'page1', url: 'https://cdn.site.com/chapter/001.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page2', url: 'https://cdn.site.com/chapter/002.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page3', url: 'https://cdn.site.com/chapter/003.jpg', width: 800, height: 1200 }),
      makeMangaCandidate({ id: 'page4', url: 'https://cdn.site.com/chapter/004.jpg', width: 800, height: 1200 }),
    ];
    const result = buildImageCollection(candidates, 'manga');
    expect(result.items.some((item) => /thumb|thumbnail/i.test(item.url))).toBe(false);
  });

  test('does not reject normal upload URLs as ads', () => {
    const candidates = [
      makeMangaCandidate({
        id: 'upload-1',
        url: 'https://site.com/wp-content/uploads/manga/chapter/01_clean.webp',
        width: 0,
        height: 0,
        visible: true,
      }),
      makeMangaCandidate({
        id: 'upload-2',
        url: 'https://site.com/wp-content/uploads/manga/chapter/02_clean.webp',
        width: 0,
        height: 0,
        visible: true,
      }),
    ];
    const result = buildImageCollection(candidates, 'manga');
    expect(result.items).toHaveLength(2);
  });

  test('handles candidates without dimensions gracefully', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeMangaCandidate({
        id: `nodim-${i}`,
        url: `https://cdn.example.com/manga/ch01/${String(i + 1).padStart(3, '0')}.jpg`,
        width: 0,
        height: 0,
      })
    );
    expect(() => buildImageCollection(candidates, 'manga')).not.toThrow();
  });

  test('sequential manga pages get high quality score cluster', () => {
    const base = 'https://cdn.example.com/manga/chapter-1';
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeMangaCandidate({
        id: `p${i}`,
        url: `${base}/${String(i + 1).padStart(3, '0')}.jpg`,
        width: 800,
        height: 1200,
        top: i * 1200,
        domIndex: i,
      })
    );
    const result = buildImageCollection(candidates, 'manga');
    // Should find at least 15 of the 20 sequential pages
    expect(result.items.length).toBeGreaterThanOrEqual(15);
  });
});

describe('buildImageCollection — mode general', () => {
  test('returns all valid candidates without manga clustering', () => {
    const candidates = [
      makeMangaCandidate({ id: 'img1', url: 'https://site.com/a.jpg', width: 400, height: 300 }),
      makeMangaCandidate({ id: 'img2', url: 'https://site.com/b.png', width: 1920, height: 1080 }),
      makeMangaCandidate({ id: 'img3', url: 'https://site.com/c.webp', width: 800, height: 600 }),
    ];
    const result = buildImageCollection(candidates, 'general');
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  test('keeps landscape images that would be penalized in manga mode', () => {
    const candidates = [
      makeMangaCandidate({ id: 'landscape1', url: 'https://gallery.com/photo1.jpg', width: 1920, height: 1080 }),
      makeMangaCandidate({ id: 'landscape2', url: 'https://gallery.com/photo2.jpg', width: 800, height: 400 }),
      makeMangaCandidate({ id: 'landscape3', url: 'https://gallery.com/photo3.jpg', width: 1280, height: 720 }),
    ];
    const result = buildImageCollection(candidates, 'general');
    expect(result.items).toHaveLength(3);
  });

  test('keeps medium-size images in general mode', () => {
    const candidates = [
      makeMangaCandidate({ id: 'med1', url: 'https://site.com/item1.jpg', width: 250, height: 250 }),
      makeMangaCandidate({ id: 'med2', url: 'https://site.com/item2.jpg', width: 300, height: 200 }),
      makeMangaCandidate({ id: 'med3', url: 'https://site.com/item3.jpg', width: 200, height: 300 }),
    ];
    const result = buildImageCollection(candidates, 'general');
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });

  test('does not reject URLs containing thumbnail when dimensions are valid', () => {
    const candidates = [
      makeMangaCandidate({ id: 'thumb-valid', url: 'https://cdn.site.com/thumbnail_001.jpg', width: 600, height: 900 }),
      makeMangaCandidate({ id: 'regular', url: 'https://cdn.site.com/gallery/photo.jpg', width: 800, height: 600 }),
    ];
    const result = buildImageCollection(candidates, 'general');
    expect(result.items.some((item) => item.url.includes('thumbnail'))).toBe(true);
  });

  test('rejects social/logo decorative assets even when encoded in URL query', () => {
    const candidates = [
      makeMangaCandidate({
        id: 'discord',
        url: 'https://astral-manga.fr/icons/discord_color.svg',
        width: 128,
        height: 128,
      }),
      makeMangaCandidate({
        id: 'next-logo',
        url: 'https://astral-manga.fr/_next/image?url=%2Fimages%2Flogo.png&w=256&q=75',
        width: 256,
        height: 256,
      }),
      makeMangaCandidate({
        id: 'page',
        url: 'https://cdn.astral-manga.fr/scans/series/chapter-3/page-001.webp',
        width: 800,
        height: 1200,
        altText: 'Page 1',
      }),
    ];

    const result = buildImageCollection(candidates, 'general');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('page');
  });
});
