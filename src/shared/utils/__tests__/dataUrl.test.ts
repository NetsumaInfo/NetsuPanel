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

  test('rejects SVG data urls', () => {
    expect(() => dataUrlToBytes('data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E'))
      .toThrow(/unsupported data url image type/i);
  });
});
