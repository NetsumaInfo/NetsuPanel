export function dataUrlToBytes(dataUrl: string): { bytes: ArrayBuffer; mime: string } {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) {
    throw new Error('Invalid data URL.');
  }

  const mime = match[1] || 'image/png';
  const payload = match[3] || '';

  if (match[2]) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { bytes: bytes.buffer, mime };
  }

  const decoded = new TextEncoder().encode(decodeURIComponent(payload));
  return { bytes: decoded.buffer, mime };
}
