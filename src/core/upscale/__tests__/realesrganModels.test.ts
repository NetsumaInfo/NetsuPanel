import {
  createDefaultUpscaleSettings,
  getBackendPriority,
  getRealesrganModelUrl,
  getRealesrganPreset,
  getRealesrganStorageKey,
  getSupportedDenoiseOptions,
  getUpscaleModelDefinition,
} from '@core/upscale/realesrganModels';

describe('realesrgan model presets', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'platform');

  afterEach(() => {
    if (platformDescriptor) {
      Object.defineProperty(window.navigator, 'platform', platformDescriptor);
    }
  });

  it('uses a 2x realcugan preset for manga mode by default', () => {
    const preset = getRealesrganPreset('manga', createDefaultUpscaleSettings('manga'));
    expect(preset.type).toBe('realcugan');
    expect(preset.id).toBe('realcugan-2x');
    expect(preset.factor).toBe(2);
    expect(preset.denoise).toBe('conservative');
  });

  it('builds stable model URLs and cache keys', () => {
    const preset = getRealesrganPreset('general', { modelId: 'realcugan-2x', denoise: 'no-denoise' });
    expect(getRealesrganModelUrl(preset, 64)).toBe('https://upscale.chino.icu/realcugan/2x-no-denoise-64/model.json');
    expect(getRealesrganStorageKey(preset, 64)).toBe('realcugan-2x-no-denoise-64');
  });

  it('exposes realesrgan and waifu2x models', () => {
    expect(getUpscaleModelDefinition('realesrgan-anime_plus').type).toBe('realesrgan');
    expect(getUpscaleModelDefinition('waifu2x').type).toBe('waifu2x');
    expect(getSupportedDenoiseOptions('realcugan-4x')).toEqual(['conservative', 'no-denoise', 'denoise3x']);
  });

  it('prioritizes webgpu when available', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });
    expect(getBackendPriority()).toEqual(['webgpu', 'webgl', 'cpu']);
  });
});
