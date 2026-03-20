import type { AppMode } from '@shared/types';

export type UpscaleBackend = 'webgpu' | 'webgl' | 'cpu';
export type RealesrganModelType = 'realcugan' | 'realesrgan';

export interface RealesrganModelPreset {
  type: RealesrganModelType;
  label: string;
  factor: 2 | 4;
  tileSizes: number[];
  minOverlap: number;
  denoise?: 'conservative' | 'no-denoise' | 'denoise1x' | 'denoise2x' | 'denoise3x';
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
  const platform = navigator.platform || navigator.userAgent || '';
  if (/win/i.test(platform)) {
    return ['webgl', 'cpu', 'webgpu'];
  }
  return BACKEND_PRIORITY;
}

export function getRealesrganPreset(mode: AppMode): RealesrganModelPreset {
  return PRESET_BY_MODE[mode];
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
