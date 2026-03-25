import type { PageScanResult } from '@shared/types';
import { resolvePreferredMode } from '@app/state/appState';

function createScan(overrides: Partial<PageScanResult>): PageScanResult {
  return {
    page: {
      url: 'https://example.com/page',
      title: 'Example',
      host: 'example.com',
      pathname: '/page',
    },
    general: {
      items: [],
      totalCandidates: 0,
      diagnostics: [],
    },
    manga: {
      adapterId: 'generic',
      currentPages: {
        items: [],
        totalCandidates: 0,
        diagnostics: [],
      },
      chapters: [],
      navigation: {},
      diagnostics: [],
    },
    ...overrides,
  };
}

describe('resolvePreferredMode', () => {
  it('returns manga when scan has reader cues', () => {
    expect(
      resolvePreferredMode(
        createScan({
          manga: {
            adapterId: 'generic',
            currentPages: {
              items: [
                {
                  id: 'p1',
                  url: 'https://cdn.example.com/p1.jpg',
                  previewUrl: 'https://cdn.example.com/p1.jpg',
                  canonicalUrl: 'https://cdn.example.com/p1.jpg',
                  querylessUrl: 'https://cdn.example.com/p1.jpg',
                  captureStrategy: 'network',
                  sourceKind: 'img-src',
                  origin: 'live-dom',
                  width: 900,
                  height: 1400,
                  area: 1_260_000,
                  domIndex: 1,
                  top: 0,
                  left: 0,
                  altText: '',
                  titleText: '',
                  containerSignature: 'reader',
                  familyKey: 'reader',
                  visible: true,
                  filenameHint: '001.jpg',
                  extensionHint: 'jpg',
                  pageNumber: 1,
                  score: 92,
                  diagnostics: [],
                },
              ],
              totalCandidates: 1,
              diagnostics: [],
            },
            chapters: [],
            navigation: {},
            diagnostics: [],
          },
        })
      )
    ).toBe('manga');
  });

  it('returns general when no reader cues are present', () => {
    expect(resolvePreferredMode(createScan({}))).toBe('general');
  });
});
