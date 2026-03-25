export function coerceArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
  }

  // Base64 string (new primary format)
  if (typeof value === 'string') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Legacy number[] format (backward compat)
  if (Array.isArray(value)) {
    return Uint8Array.from(value as number[]).buffer;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.data)) {
      return Uint8Array.from(record.data as number[]).buffer;
    }

    const numericEntries = Object.entries(record)
      .filter(([key, entryValue]) => /^\d+$/.test(key) && typeof entryValue === 'number')
      .sort((left, right) => Number(left[0]) - Number(right[0]));

    if (numericEntries.length > 0) {
      return Uint8Array.from(numericEntries.map(([, entryValue]) => Number(entryValue))).buffer;
    }
  }

  throw new Error('Unable to coerce binary payload to ArrayBuffer.');
}

/**
 * Serialize ArrayBuffer to base64 string for runtime messaging.
 * Base64 has ~33% overhead vs ~500% for JSON number arrays.
 */
export function serializeArrayBuffer(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  const CHUNK = 32768;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}
