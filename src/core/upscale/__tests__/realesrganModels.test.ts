import { getRealesrganModelUrl, getRealesrganPreset, getRealesrganStorageKey } from '@core/upscale/realesrganModels';

describe('realesrgan model presets', () => {
  it('uses a 2x realcugan preset for manga mode', () => {
    const preset = getRealesrganPreset('manga');
    expect(preset.type).toBe('realcugan');
    expect(preset.factor).toBe(2);
    expect(preset.denoise).toBe('conservative');
  });

  it('builds stable model URLs and cache keys', () => {
    const preset = getRealesrganPreset('general');
    expect(getRealesrganModelUrl(preset, 64)).toBe('https://upscale.chino.icu/realcugan/2x-no-denoise-64/model.json');
    expect(getRealesrganStorageKey(preset, 64)).toBe('realcugan-2x-no-denoise-64');
  });
});
