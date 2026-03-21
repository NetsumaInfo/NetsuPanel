import type { DetectionOrigin, RawImageCandidate } from '@shared/types';

export function createOrderedNetworkCandidates(
  urls: string[],
  options: {
    prefix: string;
    sourceKind: string;
    origin: DetectionOrigin;
    containerSignature: string;
    referrer?: string;
    transform?: RawImageCandidate['transform'];
    headers?: Record<string, string>;
  }
): RawImageCandidate[] {
  return urls.map((url, index) => ({
    id: `${options.prefix}-${index}`,
    url,
    previewUrl: url,
    referrer: options.referrer,
    headers: options.headers,
    transform: options.transform,
    captureStrategy: 'network',
    sourceKind: options.sourceKind,
    origin: options.origin,
    width: 0,
    height: 0,
    domIndex: index,
    top: index * 100,
    left: 0,
    altText: '',
    titleText: '',
    containerSignature: options.containerSignature,
    visible: true,
    diagnostics: [],
  }));
}

export function prependCandidates(
  primary: RawImageCandidate[],
  fallback: RawImageCandidate[]
): RawImageCandidate[] {
  return primary.length > 0 ? [...primary, ...fallback] : fallback;
}
