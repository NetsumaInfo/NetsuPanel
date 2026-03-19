import { validateBinaryImage } from '@shared/utils/imageBinary';

describe('validateBinaryImage', () => {
  test('accepts JPEG bytes by signature', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00]);
    const result = validateBinaryImage(jpeg.buffer, 'image/jpeg');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/jpeg');
  });

  test('rejects HTML payloads even when non-empty', () => {
    const html = new TextEncoder().encode('<!DOCTYPE html><html><body>blocked</body></html>');
    const result = validateBinaryImage(html.buffer, 'text/html');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/expected image bytes/i);
  });

  test('accepts SVG when declared as image/svg+xml', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = validateBinaryImage(svg.buffer, 'image/svg+xml');
    expect(result.valid).toBe(true);
    expect(result.mime).toBe('image/svg+xml');
  });
});
