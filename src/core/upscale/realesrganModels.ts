import type { AppMode, UpscaleBackendPreference, UpscaleDenoiseLevel, UpscaleSettings } from '@shared/types';

export type UpscaleBackend = Exclude<UpscaleBackendPreference, 'auto'>;
export type RealesrganModelType = 'realcugan' | 'realesrgan';

export interface RealesrganModelPreset {
  type: RealesrganModelType;
  label: string;
  factor: 2 | 4;
  tileSizes: number[];
  minOverlap: number;
  denoise?: UpscaleDenoiseLevel;
  model?: 'anime_fast' | 'anime_plus' | 'general_fast' | 'general_plus';
}

const BASE_MODEL_URL = 'https://upscale.chino.icu';

const PRESET_BY_MODE: Record<AppMode, RealesrganModelPreset> = {
  manga: {
    type: 'realcugan',
    label: 'Real-CUGAN 2x',
    factor: 2,
    denoise: 'conservative',
    tileSizes: [256, 192, 128, 96, 64, 48, 32],
    minOverlap: 12,
  },
  general: {
    type: 'realcugan',
    label: 'Real-CUGAN 2x',
    factor: 2,
    denoise: 'no-denoise',
    tileSizes: [256, 192, 128, 96, 64, 48, 32],
    minOverlap: 12,
  },
};

export const BACKEND_PRIORITY: UpscaleBackend[] = ['webgpu', 'webgl', 'cpu'];

export function getBackendPriority(): UpscaleBackend[] {
  return BACKEND_PRIORITY;
}

export function createDefaultUpscaleSettings(mode: AppMode): UpscaleSettings {
  const preset = PRESET_BY_MODE[mode];
  return {
    factor: preset.factor,
    denoise: preset.denoise ?? 'conservative',
    preferredBackend: 'auto',
  };
}

export function serializeUpscaleSettings(settings: UpscaleSettings): string {
  return `x${settings.factor}-${settings.denoise}-${settings.preferredBackend}`;
}

export function getRealesrganPreset(mode: AppMode, settings?: Partial<UpscaleSettings>): RealesrganModelPreset {
  const basePreset = PRESET_BY_MODE[mode];
  const factor = settings?.factor ?? basePreset.factor;
  const denoise = settings?.denoise ?? basePreset.denoise;

  return {
    ...basePreset,
    factor,
    denoise,
    label: `${basePreset.type === 'realcugan' ? 'Real-CUGAN' : 'Real-ESRGAN'} ${factor}x`,
  };
}

export function getRealesrganModelUrl(preset: RealesrganModelPreset, tileSize: number): string {
  if (preset.type === 'realesrgan') {
    return `${BASE_MODEL_URL}/realesrgan/${preset.model}-${tileSize}/model.json`;
  }

  return `${BASE_MODEL_URL}/realcugan/${preset.factor}x-${preset.denoise}-${tileSize}/model.json`;
}

export function getRealesrganStorageKey(preset: RealesrganModelPreset, tileSize: number): string {
  if (preset.type === 'realesrgan') {
    return `realesrgan-${preset.model}-${tileSize}`;
  }

  return `realcugan-${preset.factor}x-${preset.denoise}-${tileSize}`;
}
