import type { ChapterItem, ImageCollectionResult, PageScanResult } from '@shared/types';
import { appReducer, initialAppState, resolvePreferredMode } from '@app/state/appState';

const emptyPreview: ImageCollectionResult = {
  items: [],
  totalCandidates: 0,
  diagnostics: [],
};

function createChapter(url: string, label: string, previewStatus: ChapterItem['previewStatus'] = 'idle'): ChapterItem {
  return {
    id: url,
    url,
    canonicalUrl: url,
    label,
    relation: 'candidate',
    chapterNumber: null,
    volumeNumber: null,
    score: 100,
    previewStatus,
    preview: previewStatus === 'ready' ? emptyPreview : undefined,
    previewError: previewStatus === 'error' ? 'failed' : undefined,
    diagnostics: [],
  };
}

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

describe('appReducer chapters', () => {
  it('preserves loaded chapter previews when async chapter discovery refreshes the list', () => {
    const chapterUrl = 'https://reader.example.com/chapter/abc';
    const state = {
      ...initialAppState,
      chapters: [
        createChapter(chapterUrl, 'Chapitre 1', 'ready'),
      ],
    };

    const next = appReducer(state, {
      type: 'set-chapters',
      chapters: [
        createChapter(chapterUrl, 'Chapitre 1 corrigé'),
        createChapter('https://reader.example.com/chapter/def', 'Chapitre 2'),
      ],
    });

    expect(next.chapters[0]?.label).toBe('Chapitre 1 corrigé');
    expect(next.chapters[0]?.previewStatus).toBe('ready');
    expect(next.chapters[0]?.preview).toBe(emptyPreview);
    expect(next.chapters[1]?.previewStatus).toBe('idle');
  });
});
