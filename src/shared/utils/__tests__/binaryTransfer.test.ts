import { coerceArrayBuffer, serializeArrayBuffer } from '@shared/utils/binaryTransfer';

describe('coerceArrayBuffer', () => {
  test('returns native ArrayBuffer unchanged', () => {
    const input = new Uint8Array([1, 2, 3]).buffer;
    const output = coerceArrayBuffer(input);
    expect(new Uint8Array(output)).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('converts numeric-keyed objects to ArrayBuffer', () => {
    const output = coerceArrayBuffer({ 0: 255, 1: 216, 2: 255 });
    expect(Array.from(new Uint8Array(output))).toEqual([255, 216, 255]);
  });

  test('converts data arrays to ArrayBuffer', () => {
    const output = coerceArrayBuffer({ data: [137, 80, 78, 71] });
    expect(Array.from(new Uint8Array(output))).toEqual([137, 80, 78, 71]);
  });

  test('serializes ArrayBuffer into base64 string', () => {
    const input = new Uint8Array([10, 20, 30]).buffer;
    const result = serializeArrayBuffer(input);
    expect(typeof result).toBe('string');
    // Roundtrip: coerce the serialized value back
    const roundtripped = coerceArrayBuffer(result);
    expect(Array.from(new Uint8Array(roundtripped))).toEqual([10, 20, 30]);
  });

  test('coerces base64 string to ArrayBuffer', () => {
    // btoa(String.fromCharCode(255, 216, 255)) === '/9j/'
    const output = coerceArrayBuffer('/9j/');
    expect(Array.from(new Uint8Array(output))).toEqual([255, 216, 255]);
  });
});
