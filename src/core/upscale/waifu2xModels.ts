import type { AppMode } from '@shared/types';
import { browser } from '@shared/browser';

const MODEL_BY_MODE: Record<AppMode, string> = {
  manga: 'models/manga-scale2x.json',
  general: 'models/general-scale2x.json',
};

export function getWaifuModelUrl(mode: AppMode): string {
  return browser.runtime.getURL(MODEL_BY_MODE[mode]);
}
