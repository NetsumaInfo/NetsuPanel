import { dataUrlToBytes } from '@shared/utils/dataUrl';

describe('dataUrlToBytes', () => {
  test('decodes base64 image data urls into bytes', () => {
    const result = dataUrlToBytes('data:image/png;base64,iVBORw0KGgo=');
    expect(result.mime).toBe('image/png');
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  test('rejects invalid data urls', () => {
    expect(() => dataUrlToBytes('not-a-data-url')).toThrow(/invalid data url/i);
  });
});
