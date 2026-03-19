export function coerceArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
  }

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

export function serializeArrayBuffer(value: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(value));
}
