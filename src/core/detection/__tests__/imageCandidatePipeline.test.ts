import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import type { RawImageCandidate } from '@shared/types';

function createCandidate(index: number, overrides: Partial<RawImageCandidate> = {}): RawImageCandidate {
  return {
    id: `candidate-${index}`,
    url: `https://cdn.example.com/series/chapter-12/page-${String(index + 1).padStart(3, '0')}.jpg`,
    previewUrl: `https://cdn.example.com/series/chapter-12/page-${String(index + 1).padStart(3, '0')}.jpg`,
    captureStrategy: 'network',
    sourceKind: 'img-current-src',
    origin: 'live-dom',
    width: 1200,
    height: 1800,
    domIndex: index,
    top: index * 10,
    left: 0,
    altText: `page ${index + 1}`,
    titleText: '',
    containerSignature: 'main.reader',
    visible: true,
    diagnostics: [],
    ...overrides,
  };
}

describe('buildImageCollection', () => {
  it('selects the dominant narrative cluster for manga mode', () => {
    const pages = Array.from({ length: 12 }, (_, index) => createCandidate(index));
    const junk = [
      createCandidate(100, {
        id: 'junk-1',
        url: 'https://cdn.example.com/assets/logo.png',
        previewUrl: 'https://cdn.example.com/assets/logo.png',
        width: 80,
        height: 80,
        altText: 'logo',
      }),
      createCandidate(101, {
        id: 'junk-2',
        url: 'https://cdn.example.com/assets/avatar.jpg',
        previewUrl: 'https://cdn.example.com/assets/avatar.jpg',
        width: 96,
        height: 96,
        altText: 'avatar',
      }),
    ];

    const result = buildImageCollection([...pages, ...junk], 'manga');

    expect(result.items).toHaveLength(12);
    expect(result.items[0].pageNumber).toBe(1);
    expect(result.items[11].pageNumber).toBe(12);
    expect(result.items.every((item) => item.url.includes('/chapter-12/'))).toBe(true);
  });

  it('deduplicates identical queryless resources', () => {
    const candidates = [
      createCandidate(0),
      createCandidate(1, {
        id: 'dup',
        url: 'https://cdn.example.com/series/chapter-12/page-001.jpg?cache=123',
        previewUrl: 'https://cdn.example.com/series/chapter-12/page-001.jpg?cache=123',
        domIndex: 99,
      }),
    ];

    const result = buildImageCollection(candidates, 'general');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].querylessUrl).toContain('page-001.jpg');
  });

  it('does not treat chapter numbers in path segments as page numbers', () => {
    const result = buildImageCollection(
      [
        createCandidate(0, {
          url: 'https://cdn.example.com/series/chapter-12/cover.jpg',
          previewUrl: 'https://cdn.example.com/series/chapter-12/cover.jpg',
          altText: 'cover art',
          titleText: '',
        }),
      ],
      'manga'
    );

    expect(result.items[0]?.pageNumber).toBeNull();
  });

  it('keeps a dimensioned DOM cluster over a script-only cluster of the same family', () => {
    const liveDomPages = Array.from({ length: 4 }, (_, index) =>
      createCandidate(index, {
        id: `live-${index}`,
        containerSignature: 'main.reader',
        width: 1200,
        height: 1800,
        visible: true,
      })
    );
    const scriptPages = Array.from({ length: 4 }, (_, index) =>
      createCandidate(index + 20, {
        id: `script-${index}`,
        containerSignature: 'script:inline-2',
        sourceKind: 'inline-script',
        width: 0,
        height: 0,
        visible: false,
        top: 0,
      })
    );

    const result = buildImageCollection([...scriptPages, ...liveDomPages], 'manga');

    expect(result.items).toHaveLength(4);
    expect(result.items.every((item) => item.containerSignature === 'main.reader')).toBe(true);
  });
});
