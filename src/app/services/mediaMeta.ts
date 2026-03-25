import type { ImageCandidate } from '@shared/types';
import { resolveGeneralImageType } from '@app/services/generalImageView';

const TYPE_LABELS: Record<string, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WEBP',
  avif: 'AVIF',
  gif: 'GIF',
  svg: 'SVG',
  canvas: 'CANVAS',
  poster: 'POSTER',
  unknown: 'AUTRE',
};

function fallbackNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const raw = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    return decodeURIComponent(raw) || 'media';
  } catch {
    const raw = url.split('/').filter(Boolean).pop() || 'media';
    return decodeURIComponent(raw) || 'media';
  }
}

export function resolveMediaName(candidate: ImageCandidate): string {
  const name = candidate.filenameHint?.trim();
  if (name) return name;
  return fallbackNameFromUrl(candidate.url);
}

export function formatEstimatedWeight(candidate: ImageCandidate): string {
  if (candidate.width <= 0 || candidate.height <= 0) return 'poids ?';
  const area = candidate.width * candidate.height;
  const type = resolveGeneralImageType(candidate);
  const ratio =
    type === 'jpeg' ? 0.18 :
    type === 'png' ? 0.42 :
    type === 'webp' ? 0.14 :
    type === 'avif' ? 0.1 :
    type === 'gif' ? 0.24 :
    type === 'svg' ? 0.06 :
    0.2;
  const bytes = Math.max(256, Math.round(area * ratio));
  if (bytes >= 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `~${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
}

export function formatMediaMeta(candidate: ImageCandidate): string {
  const type = TYPE_LABELS[resolveGeneralImageType(candidate)] || 'AUTRE';
  const dimensions = candidate.width > 0 && candidate.height > 0
    ? `${candidate.width}×${candidate.height}`
    : 'dimensions ?';
  return `${type} • ${dimensions} • ${formatEstimatedWeight(candidate)}`;
}
