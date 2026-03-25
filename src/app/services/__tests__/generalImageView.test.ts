import type { ImageCandidate } from '@shared/types';
import {
  applyGeneralImageView,
  buildGeneralTypeOptions,
  resolveGeneralImageType,
} from '@app/services/generalImageView';

function createItem(overrides: Partial<ImageCandidate>): ImageCandidate {
  const url = overrides.url || 'https://cdn.example.com/chapter/001.jpg';
  return {
    id: overrides.id || 'item-1',
    url,
    previewUrl: overrides.previewUrl || url,
    canonicalUrl: overrides.canonicalUrl || url,
    querylessUrl: overrides.querylessUrl || url.split('?')[0],
    captureStrategy: overrides.captureStrategy || 'network',
    sourceKind: overrides.sourceKind || 'img-src',
    origin: overrides.origin || 'live-dom',
    width: overrides.width ?? 1080,
    height: overrides.height ?? 1600,
    area: overrides.area ?? 1_728_000,
    domIndex: overrides.domIndex ?? 0,
    top: overrides.top ?? 0,
    left: overrides.left ?? 0,
    altText: overrides.altText || '',
    titleText: overrides.titleText || '',
    containerSignature: overrides.containerSignature || 'reader',
    familyKey: overrides.familyKey || 'cdn.example.com/chapter',
    visible: overrides.visible ?? true,
    filenameHint: overrides.filenameHint || '001.jpg',
    extensionHint: overrides.extensionHint || 'jpg',
    pageNumber: overrides.pageNumber ?? 1,
    score: overrides.score ?? 80,
    diagnostics: overrides.diagnostics || [],
    referrer: overrides.referrer,
    headers: overrides.headers,
    transform: overrides.transform,
  };
}

describe('generalImageView helpers', () => {
  it('resolves image type from extension and source kind', () => {
    expect(resolveGeneralImageType(createItem({ extensionHint: 'jpeg' }))).toBe('jpeg');
    expect(resolveGeneralImageType(createItem({ sourceKind: 'background-image', extensionHint: 'png' }))).toBe('background');
    expect(resolveGeneralImageType(createItem({ sourceKind: 'canvas', extensionHint: '' }))).toBe('canvas');
  });

  it('builds type options from available item types', () => {
    const options = buildGeneralTypeOptions([
      createItem({ id: 'jpg', extensionHint: 'jpg' }),
      createItem({ id: 'webp', extensionHint: 'webp' }),
      createItem({ id: 'svg', extensionHint: 'svg', sourceKind: 'inline-svg' }),
    ]);

    expect(options[0].value).toBe('all');
    expect(options.some((option) => option.value === 'jpeg')).toBe(true);
    expect(options.some((option) => option.value === 'webp')).toBe(true);
    expect(options.some((option) => option.value === 'svg')).toBe(true);
  });

  it('filters and sorts by size descending', () => {
    const items = [
      createItem({ id: 'small', extensionHint: 'jpg', area: 100 }),
      createItem({ id: 'big', extensionHint: 'jpg', area: 500 }),
      createItem({ id: 'webp', extensionHint: 'webp', area: 300 }),
    ];

    const filtered = applyGeneralImageView(items, 'jpeg', 'size-desc');
    expect(filtered.map((item) => item.id)).toEqual(['big', 'small']);
  });
});
