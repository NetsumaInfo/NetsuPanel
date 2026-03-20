import type {
  AppMode,
  UpscaleBackendPreference,
  UpscaleDenoiseLevel,
  UpscaleModelId,
  UpscaleSettings,
  Waifu2xMode,
  Waifu2xNoiseLevel,
} from '@shared/types';

export type UpscaleBackend = Exclude<UpscaleBackendPreference, 'auto'>;
export type RealesrganModelType = 'realcugan' | 'realesrgan' | 'waifu2x';

export interface RealesrganModelPreset {
  id: UpscaleModelId;
  type: RealesrganModelType;
  label: string;
  factor: 2 | 4;
  tileSizes: number[];
  minOverlap: number;
  denoise?: UpscaleDenoiseLevel;
  model?: 'anime_fast' | 'anime_plus' | 'general_fast' | 'general_plus';
}

const BASE_MODEL_URL = 'https://upscale.chino.icu';
const TILE_SIZES = [256, 192, 128, 96, 64, 48, 32];
const DENOISE_2X: UpscaleDenoiseLevel[] = ['conservative', 'no-denoise', 'denoise1x', 'denoise2x', 'denoise3x'];
const DENOISE_4X: UpscaleDenoiseLevel[] = ['conservative', 'no-denoise', 'denoise3x'];

const UPSCALE_MODELS: Record<UpscaleModelId, RealesrganModelPreset> = {
  'realcugan-2x': {
    id: 'realcugan-2x',
    type: 'realcugan',
    label: 'Real-CUGAN x2',
    factor: 2,
    denoise: 'conservative',
    tileSizes: TILE_SIZES,
    minOverlap: 12,
  },
  'realcugan-4x': {
    id: 'realcugan-4x',
    type: 'realcugan',
    label: 'Real-CUGAN x4',
    factor: 4,
    denoise: 'conservative',
    tileSizes: TILE_SIZES,
    minOverlap: 12,
  },
  'realesrgan-anime_fast': {
    id: 'realesrgan-anime_fast',
    type: 'realesrgan',
    label: 'Real-ESRGAN Anime Fast',
    factor: 4,
    model: 'anime_fast',
    tileSizes: TILE_SIZES,
    minOverlap: 12,
  },
  'realesrgan-anime_plus': {
    id: 'realesrgan-anime_plus',
    type: 'realesrgan',
    label: 'Real-ESRGAN Anime Plus',
    factor: 4,
    model: 'anime_plus',
    tileSizes: TILE_SIZES,
    minOverlap: 12,
  },
  'realesrgan-general_fast': {
    id: 'realesrgan-general_fast',
    type: 'realesrgan',
    label: 'Real-ESRGAN General Fast',
    factor: 4,
    model: 'general_fast',
    tileSizes: TILE_SIZES,
    minOverlap: 12,
  },
  'realesrgan-general_plus': {
    id: 'realesrgan-general_plus',
    type: 'realesrgan',
    label: 'Real-ESRGAN General Plus',
    factor: 4,
    model: 'general_plus',
    tileSizes: TILE_SIZES,
    minOverlap: 12,
  },
  'waifu2x-anime': {
    id: 'waifu2x-anime',
    type: 'waifu2x',
    label: 'waifu2x Anime x2',
    factor: 2,
    tileSizes: [64, 48, 32, 24, 16, 12, 8],
    minOverlap: 0,
  },
  'waifu2x-photo': {
    id: 'waifu2x-photo',
    type: 'waifu2x',
    label: 'waifu2x Photo x2',
    factor: 2,
    tileSizes: [64, 48, 32, 24, 16, 12, 8],
    minOverlap: 0,
  },
};

type WaifuVariantMap = Partial<Record<Waifu2xNoiseLevel | 'scale', string>>;
type WaifuModeMap = Partial<Record<Waifu2xMode, WaifuVariantMap>>;

const WAIFU2X_MODELS: Record<'waifu2x-anime' | 'waifu2x-photo', WaifuModeMap> = {
  'waifu2x-anime': {
    scale: {
      scale: 'models/manga-scale2x.json',
    },
  },
  'waifu2x-photo': {
    scale: {
      scale: 'models/general-scale2x.json',
    },
  },
};

export const BACKEND_PRIORITY: UpscaleBackend[] = ['webgpu', 'webgl', 'cpu'];

export function getBackendPriority(): UpscaleBackend[] {
  return BACKEND_PRIORITY;
}

export function createDefaultUpscaleSettings(mode: AppMode): UpscaleSettings {
  const defaultModelId: UpscaleModelId = 'realcugan-2x';
  const defaultTileSize = getUpscaleModelDefinition(defaultModelId).tileSizes[0] ?? 64;
  return {
    modelId: defaultModelId,
    denoise: mode === 'manga' ? 'conservative' : 'no-denoise',
    tileSize: defaultTileSize,
    preferredBackend: 'auto',
    waifuMode: 'scale',
    waifuNoiseLevel: '0',
  };
}

export function serializeUpscaleSettings(settings: UpscaleSettings): string {
  return `${settings.modelId}-${settings.denoise}-${settings.tileSize}-${settings.preferredBackend}-${settings.waifuMode}-${settings.waifuNoiseLevel}`;
}

export function getUpscaleModelDefinition(modelId: UpscaleModelId): RealesrganModelPreset {
  return UPSCALE_MODELS[modelId];
}

export function getUpscaleModelOptions(): Array<{ value: UpscaleModelId; label: string }> {
  return [
    { value: 'realcugan-2x', label: 'Real-CUGAN x2' },
    { value: 'realcugan-4x', label: 'Real-CUGAN x4' },
    { value: 'realesrgan-anime_fast', label: 'Real-ESRGAN Anime Fast' },
    { value: 'realesrgan-anime_plus', label: 'Real-ESRGAN Anime Plus' },
    { value: 'realesrgan-general_fast', label: 'Real-ESRGAN General Fast' },
    { value: 'realesrgan-general_plus', label: 'Real-ESRGAN General Plus' },
    { value: 'waifu2x-anime', label: 'waifu2x Anime x2' },
    { value: 'waifu2x-photo', label: 'waifu2x Photo x2' },
  ];
}

export function getSupportedBackendPreferences(modelId: UpscaleModelId): UpscaleBackendPreference[] {
  if (modelId === 'waifu2x-anime' || modelId === 'waifu2x-photo') {
    return ['auto', 'webgl', 'cpu'];
  }
  return ['auto', 'webgpu', 'webgl', 'cpu'];
}

export function getWaifuModeOptions(modelId: UpscaleModelId): Array<{ value: Waifu2xMode; label: string }> {
  if (modelId !== 'waifu2x-anime' && modelId !== 'waifu2x-photo') {
    return [];
  }
  const variants = WAIFU2X_MODELS[modelId];
  return (Object.keys(variants) as Waifu2xMode[]).map((value) => ({
    value,
    label: value === 'noise' ? 'Noise' : value === 'noise_scale' ? 'Noise + Scale' : 'Scale',
  }));
}

export function getWaifuNoiseOptions(
  modelId: UpscaleModelId,
  waifuMode: Waifu2xMode
): Array<{ value: Waifu2xNoiseLevel; label: string }> {
  if (modelId !== 'waifu2x-anime' && modelId !== 'waifu2x-photo') {
    return [];
  }
  const variants = WAIFU2X_MODELS[modelId][waifuMode];
  if (!variants) return [];

  return (Object.keys(variants) as Array<Waifu2xNoiseLevel | 'scale'>)
    .filter((value): value is Waifu2xNoiseLevel => value !== 'scale')
    .map((value) => ({ value, label: value }));
}

export function waifuModeSupportsNoise(modelId: UpscaleModelId, waifuMode: Waifu2xMode): boolean {
  return getWaifuNoiseOptions(modelId, waifuMode).length > 0;
}

export function resolveWaifuModelAsset(_mode: AppMode, settings: UpscaleSettings): string {
  if (settings.modelId !== 'waifu2x-anime' && settings.modelId !== 'waifu2x-photo') {
    return 'models/manga-scale2x.json';
  }
  const variants = WAIFU2X_MODELS[settings.modelId][settings.waifuMode];
  if (variants) {
    if (settings.waifuMode === 'scale' && variants.scale) {
      return variants.scale;
    }

    const noiseVariant = variants[settings.waifuNoiseLevel];
    if (noiseVariant) {
      return noiseVariant;
    }
  }

  return WAIFU2X_MODELS[settings.modelId].scale?.scale || 'models/manga-scale2x.json';
}

export function getSupportedDenoiseOptions(modelId: UpscaleModelId): UpscaleDenoiseLevel[] {
  if (modelId === 'realcugan-4x') {
    return DENOISE_4X;
  }
  if (modelId === 'realcugan-2x') {
    return DENOISE_2X;
  }
  return [];
}

export function modelSupportsDenoise(modelId: UpscaleModelId): boolean {
  return getSupportedDenoiseOptions(modelId).length > 0;
}

export function getRealesrganPreset(_mode: AppMode, settings?: Partial<UpscaleSettings>): RealesrganModelPreset {
  const modelId = settings?.modelId ?? 'realcugan-2x';
  const basePreset = getUpscaleModelDefinition(modelId);
  const denoiseOptions = getSupportedDenoiseOptions(modelId);
  const denoise = denoiseOptions.includes(settings?.denoise ?? basePreset.denoise ?? 'conservative')
    ? (settings?.denoise ?? basePreset.denoise)
    : denoiseOptions[0];

  return {
    ...basePreset,
    denoise,
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
