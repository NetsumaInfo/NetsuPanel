export type UpscaleBackend = 'webgl' | 'cpu';

export function preferredBlockSizes(byteLength: number): number[] {
  if (byteLength < 1_000_000) return [64, 48, 32, 24, 16, 12, 8];
  if (byteLength < 4_000_000) return [48, 32, 24, 16, 12, 8];
  return [32, 24, 16, 12, 8, 6];
}

export function isRetryableUpscaleError(message: string): boolean {
  return /oom|memory|allocate|texture|webgl|gl_|context lost|max texture|shader|compile|program|timeout/i.test(message);
}

export function buildUpscaleFailureMessage(lastError?: string): string {
  if (!lastError) {
    return 'Upscale failed after exhausting available tile sizes.';
  }

  return `Upscale failed: ${lastError}`;
}
