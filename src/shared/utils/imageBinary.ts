import { isSupportedFetchedImageMime } from './resourcePolicy';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_SIGNATURE = [0x47, 0x49, 0x46];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];

function bytesMatch(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature[index]) return false;
  }

  return true;
}

function normalizeMime(mime?: string): string | null {
  if (!mime) return null;
  return mime.split(';')[0].trim().toLowerCase() || null;
}

function isSvgBytes(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg')) return true;
  if (head.startsWith('<?xml') && head.includes('<svg')) return true;
  if (head.startsWith('<!doctype svg')) return true;
  return false;
}

function detectMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytesMatch(bytes, 0, JPEG_SIGNATURE)) return 'image/jpeg';
  if (bytesMatch(bytes, 0, PNG_SIGNATURE)) return 'image/png';
  if (bytesMatch(bytes, 0, GIF_SIGNATURE)) return 'image/gif';

  if (
    bytesMatch(bytes, 0, RIFF_SIGNATURE) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  const ftyp = String.fromCharCode(...bytes.slice(4, 12));
  if (ftyp.startsWith('ftypavif') || ftyp.startsWith('ftypavis')) {
    return 'image/avif';
  }

  // SVG detection from bytes (handles wrong/missing Content-Type)
  if (isSvgBytes(bytes)) return 'image/svg+xml';

  return null;
}

function looksLikeTextPayload(bytes: Uint8Array): boolean {
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  // SVG is text but valid — handled above via detectMimeFromBytes
  if (sample.startsWith('<svg') || (sample.startsWith('<?xml') && sample.includes('svg'))) return false;
  return (
    sample.startsWith('<!doctype') ||
    sample.startsWith('<html') ||
    sample.startsWith('<body') ||
    sample.startsWith('<?xml') ||
    sample.startsWith('{') ||
    sample.startsWith('[')
  );
}

export function validateBinaryImage(
  arrayBuffer: ArrayBuffer,
  declaredMime?: string
): { valid: boolean; mime: string; reason?: string } {
  if (arrayBuffer.byteLength === 0) {
    return { valid: false, mime: 'image/jpeg', reason: 'Empty image body.' };
  }

  const bytes = new Uint8Array(arrayBuffer);
  const detectedMime = detectMimeFromBytes(bytes);
  if (detectedMime) {
    if (!isSupportedFetchedImageMime(detectedMime)) {
      return {
        valid: false,
        mime: detectedMime,
        reason: `Unsupported image format (${detectedMime}).`,
      };
    }
    return { valid: true, mime: detectedMime };
  }

  const normalizedMime = normalizeMime(declaredMime);
  if (looksLikeTextPayload(bytes)) {
    return {
      valid: false,
      mime: normalizedMime || 'image/jpeg',
      reason: `Expected image bytes but received ${normalizedMime || 'text/unknown'}.`,
    };
  }

  if (normalizedMime && isSupportedFetchedImageMime(normalizedMime)) {
    return { valid: true, mime: normalizedMime };
  }

  return {
    valid: false,
    mime: normalizedMime || 'image/jpeg',
    reason: `Unexpected or unsupported binary payload (${normalizedMime || 'unknown mime'}).`,
  };
}

export async function assertDecodableImage(arrayBuffer: ArrayBuffer, mime: string): Promise<void> {
  if (mime === 'image/svg+xml' || mime === 'image/gif') return;
  if (typeof createImageBitmap !== 'function') return;

  const blob = new Blob([arrayBuffer], { type: mime });
  await createImageBitmap(blob);
}
