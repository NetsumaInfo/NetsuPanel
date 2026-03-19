import { buildImageCollection } from '@core/detection/pipeline/imageCandidatePipeline';
import type { RawImageCandidate } from '@shared/types';

function createCandidate(index: number): RawImageCandidate {
  return {
    id: `candidate-${index}`,
    url: `https://fast.example.com/webtoon/episode-77/page-${index + 1}.jpg`,
    previewUrl: `https://fast.example.com/webtoon/episode-77/page-${index + 1}.jpg`,
    captureStrategy: 'network',
    sourceKind: 'img-current-src',
    origin: 'static-html',
    width: 1080,
    height: 1920,
    domIndex: index,
    top: index,
    left: 0,
    altText: `page ${index + 1}`,
    titleText: '',
    containerSignature: 'section.reader',
    visible: true,
    diagnostics: [],
  };
}

describe('buildImageCollection performance', () => {
  it('handles a large chapter in a bounded time budget', () => {
    const candidates = Array.from({ length: 450 }, (_, index) => createCandidate(index));
    const start = performance.now();
    const result = buildImageCollection(candidates, 'manga');
    const duration = performance.now() - start;

    expect(result.items).toHaveLength(450);
    expect(duration).toBeLessThan(1500);
  });
});
