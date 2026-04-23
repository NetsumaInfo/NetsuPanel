import type { CaptureStrategy, ImageResolveMode } from '@shared/types';
import { isKnownImageProxyUrl, isPlaceholderImageUrl, shouldPreserveImageProxyUrl, unwrapProxiedImageUrl } from '@shared/utils/url';

interface ImagePresentationInput {
  url: string;
  previewUrl?: string;
  captureStrategy?: CaptureStrategy;
}

function isInlinePreviewUrl(url: string): boolean {
  return /^data:/i.test(url) || /^blob:/i.test(url) || /^content:\/\//i.test(url);
}

function normalizeNetworkUrl(url: string | undefined): string {
  if (!url) return '';
  return unwrapProxiedImageUrl(url);
}

export function resolveCandidateImageSrc(candidate: ImagePresentationInput): string {
  const previewRaw = candidate.previewUrl || '';
  const primaryRaw = candidate.url || '';

  if (isInlinePreviewUrl(previewRaw)) {
    return previewRaw;
  }

  if (previewRaw && shouldPreserveImageProxyUrl(previewRaw)) {
    return previewRaw;
  }

  if (primaryRaw && shouldPreserveImageProxyUrl(primaryRaw)) {
    return primaryRaw;
  }

  const preview = normalizeNetworkUrl(previewRaw);
  const primary = normalizeNetworkUrl(primaryRaw);

  if (!preview) {
    return primary;
  }

  if (isPlaceholderImageUrl(previewRaw) || isPlaceholderImageUrl(preview)) {
    return primary || preview;
  }

  if (primary && primary !== preview && (isKnownImageProxyUrl(previewRaw) || isKnownImageProxyUrl(primaryRaw))) {
    return primary;
  }

  return preview || primary;
}

export function resolveCandidateImageMode(candidate: ImagePresentationInput): ImageResolveMode {
  const src = resolveCandidateImageSrc(candidate);

  if (/^content:\/\//i.test(src)) {
    return 'capture-first';
  }

  if (shouldPreserveImageProxyUrl(src)) {
    return 'auto';
  }

  if (isKnownImageProxyUrl(src)) {
    return 'network-first';
  }

  return 'auto';
}
