import {
  buildUpscaleFailureMessage,
  isRetryableUpscaleError,
  preferredBlockSizes,
} from '@core/upscale/waifu2xFallback';

describe('preferredBlockSizes', () => {
  it('keeps trying down to very small tiles for small inputs', () => {
    expect(preferredBlockSizes(250_000)).toEqual([64, 48, 32, 24, 16, 12, 8]);
  });

  it('uses conservative tiles for larger inputs', () => {
    expect(preferredBlockSizes(8_000_000)).toEqual([32, 24, 16, 12, 8, 6]);
  });
});

describe('isRetryableUpscaleError', () => {
  it('treats memory and webgl failures as retryable', () => {
    expect(isRetryableUpscaleError('WebGL backend error: texture size too large')).toBe(true);
    expect(isRetryableUpscaleError('OOM when allocating tensor')).toBe(true);
  });

  it('does not retry unrelated failures', () => {
    expect(isRetryableUpscaleError('Model weights json is malformed')).toBe(false);
  });
});

describe('buildUpscaleFailureMessage', () => {
  it('includes the real failure cause when available', () => {
    expect(buildUpscaleFailureMessage('cpu/8: invalid dimensions')).toBe('Upscale failed: cpu/8: invalid dimensions');
  });

  it('falls back to the generic message when no detail exists', () => {
    expect(buildUpscaleFailureMessage()).toBe('Upscale failed after exhausting available tile sizes.');
  });
});
