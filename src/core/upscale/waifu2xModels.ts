import type { AppMode, UpscaleSettings } from '@shared/types';
import { browser } from '@shared/browser';
import { resolveWaifuModelAsset } from './realesrganModels';

export function getWaifuModelUrl(mode: AppMode, settings: UpscaleSettings): string {
  return browser.runtime.getURL(resolveWaifuModelAsset(mode, settings));
}
