import { useCallback, useEffect, useReducer, useRef } from 'react';
import { captureImage, fetchBinary } from '@app/services/runtimeClient';
import { isSafeRenderableImageSrc } from '@shared/utils/resourcePolicy';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  referrer?: string;
  captureTabId?: number;
  captureCandidateId?: string;
}

interface SafeImageState {
  sourceKey: string;
  resolvedSrc: string;
  failed: boolean;
  loadingFallback: boolean;
}

type SafeImageAction =
  | { type: 'sync-source'; sourceKey: string; resolvedSrc: string }
  | { type: 'loading-start'; sourceKey: string }
  | { type: 'loading-stop'; sourceKey: string }
  | { type: 'resolved'; sourceKey: string; resolvedSrc: string }
  | { type: 'failed'; sourceKey: string };

const FALLBACK_CACHE_LIMIT = 180;
const objectUrlCache = new Map<string, string>();
const NETWORK_FALLBACK_CONCURRENCY = 6;
let activeNetworkFallbackCount = 0;
const networkFallbackWaiters: Array<() => void> = [];
const initialSafeImageState: SafeImageState = {
  sourceKey: '',
  resolvedSrc: '',
  failed: false,
  loadingFallback: false,
};

function safeImageReducer(state: SafeImageState, action: SafeImageAction): SafeImageState {
  switch (action.type) {
    case 'sync-source':
      return {
        sourceKey: action.sourceKey,
        resolvedSrc: action.resolvedSrc,
        failed: false,
        loadingFallback: false,
      };

    case 'loading-start':
      if (state.sourceKey !== action.sourceKey) return state;
      return {
        ...state,
        loadingFallback: true,
      };

    case 'loading-stop':
      if (state.sourceKey !== action.sourceKey) return state;
      return {
        ...state,
        loadingFallback: false,
      };

    case 'resolved':
      if (state.sourceKey !== action.sourceKey) return state;
      return {
        ...state,
        resolvedSrc: action.resolvedSrc,
        failed: false,
        loadingFallback: false,
      };

    case 'failed':
      if (state.sourceKey !== action.sourceKey) return state;
      return {
        ...state,
        failed: true,
        loadingFallback: false,
      };

    default:
      return state;
  }
}

function buildCacheKey(src: string, referrer?: string): string {
  return `${src}::${referrer ?? ''}`;
}

function buildCaptureKey(tabId?: number, candidateId?: string): string {
  return `capture:${tabId ?? 'none'}:${candidateId ?? 'none'}`;
}

function buildSourceKey(
  src: string,
  referrer?: string,
  captureTabId?: number,
  captureCandidateId?: string
): string {
  return `${buildCacheKey(src, referrer)}::${buildCaptureKey(captureTabId, captureCandidateId)}`;
}

function isNetworkUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function isGifLikeSource(src: string): boolean {
  if (!src) return false;
  if (/^data:image\/gif/i.test(src)) return true;
  return /\.gif(?:$|[?#])/i.test(src);
}

function getCachedObjectUrl(key: string): string | undefined {
  const value = objectUrlCache.get(key);
  if (!value) return undefined;
  objectUrlCache.delete(key);
  objectUrlCache.set(key, value);
  return value;
}

function setCachedObjectUrl(key: string, objectUrl: string): void {
  objectUrlCache.delete(key);
  objectUrlCache.set(key, objectUrl);

  if (objectUrlCache.size > FALLBACK_CACHE_LIMIT) {
    const oldestKey = objectUrlCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    objectUrlCache.delete(oldestKey);
  }
}

async function withNetworkFallbackSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeNetworkFallbackCount >= NETWORK_FALLBACK_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      networkFallbackWaiters.push(resolve);
    });
  }

  activeNetworkFallbackCount += 1;
  try {
    return await task();
  } finally {
    activeNetworkFallbackCount = Math.max(0, activeNetworkFallbackCount - 1);
    const waiter = networkFallbackWaiters.shift();
    if (waiter) {
      waiter();
    }
  }
}

export function SafeImage({
  src,
  alt,
  className,
  referrer,
  captureTabId,
  captureCandidateId,
}: SafeImageProps) {
  const [state, dispatchState] = useReducer(safeImageReducer, initialSafeImageState);
  const requestTokenRef = useRef(0);
  const captureAttemptedRef = useRef(false);
  const networkAttemptedRef = useRef(false);
  const sourceKey = buildSourceKey(src, referrer, captureTabId, captureCandidateId);
  const preferNetworkFallback = isGifLikeSource(src);

  useEffect(() => {
    requestTokenRef.current += 1;
    captureAttemptedRef.current = false;
    networkAttemptedRef.current = false;

    const captureKey = buildCaptureKey(captureTabId, captureCandidateId);
    const cachedCapture = preferNetworkFallback ? undefined : getCachedObjectUrl(captureKey);
    if (cachedCapture) {
      dispatchState({ type: 'sync-source', sourceKey, resolvedSrc: cachedCapture });
      return;
    }

    const networkKey = buildCacheKey(src, referrer);
    dispatchState({
      type: 'sync-source',
      sourceKey,
      resolvedSrc: getCachedObjectUrl(networkKey) || (isSafeRenderableImageSrc(src) ? src : ''),
    });
  }, [captureCandidateId, captureTabId, preferNetworkFallback, referrer, sourceKey, src]);

  const fetchFromCapture = useCallback(async (): Promise<boolean> => {
    if (!captureTabId || !captureCandidateId) return false;

    const cacheKey = buildCaptureKey(captureTabId, captureCandidateId);
    const cached = getCachedObjectUrl(cacheKey);
    if (cached) {
      dispatchState({ type: 'resolved', sourceKey, resolvedSrc: cached });
      return true;
    }

    const token = requestTokenRef.current;
    dispatchState({ type: 'loading-start', sourceKey });
    captureAttemptedRef.current = true;

    try {
      const resource = await captureImage(captureTabId, captureCandidateId);
      const objectUrl = URL.createObjectURL(new Blob([resource.bytes], { type: resource.mime || 'image/png' }));
      setCachedObjectUrl(cacheKey, objectUrl);

      if (requestTokenRef.current !== token) return false;
      dispatchState({ type: 'resolved', sourceKey, resolvedSrc: objectUrl });
      return true;
    } catch {
      return false;
    } finally {
      if (requestTokenRef.current === token) {
        dispatchState({ type: 'loading-stop', sourceKey });
      }
    }
  }, [captureCandidateId, captureTabId, sourceKey]);

  const fetchFromNetwork = useCallback(async (): Promise<boolean> => {
    if (!isNetworkUrl(src)) {
      return false;
    }

    const cacheKey = buildCacheKey(src, referrer);
    const cached = getCachedObjectUrl(cacheKey);
    if (cached) {
      dispatchState({ type: 'resolved', sourceKey, resolvedSrc: cached });
      return true;
    }

    const token = requestTokenRef.current;
    dispatchState({ type: 'loading-start', sourceKey });
    networkAttemptedRef.current = true;

    try {
      let resource;
      try {
        resource = await withNetworkFallbackSlot(() =>
          fetchBinary(src, { referrer, tabId: captureTabId })
        );
      } catch {
        resource = await withNetworkFallbackSlot(() =>
          fetchBinary(src, { tabId: captureTabId })
        );
      }
      const objectUrl = URL.createObjectURL(new Blob([resource.bytes], { type: resource.mime || 'image/jpeg' }));
      setCachedObjectUrl(cacheKey, objectUrl);

      if (requestTokenRef.current !== token) return false;
      dispatchState({ type: 'resolved', sourceKey, resolvedSrc: objectUrl });
      return true;
    } catch {
      return false;
    } finally {
      if (requestTokenRef.current === token) {
        dispatchState({ type: 'loading-stop', sourceKey });
      }
    }
  }, [captureTabId, referrer, sourceKey, src]);

  const loadingFallback = state.sourceKey === sourceKey ? state.loadingFallback : false;
  const failed = state.sourceKey === sourceKey ? state.failed : false;
  const resolvedSrc = state.sourceKey === sourceKey && state.resolvedSrc
    ? state.resolvedSrc
    : (isSafeRenderableImageSrc(src) ? src : '');

  const handleError = useCallback(() => {
    if (loadingFallback) return;

    const tryFallbacks = async () => {
      if (preferNetworkFallback && !networkAttemptedRef.current) {
        const loaded = await fetchFromNetwork();
        if (loaded) return;
      }

      if (captureTabId && captureCandidateId && !captureAttemptedRef.current) {
        const loaded = await fetchFromCapture();
        if (loaded) return;
      }

      if (!networkAttemptedRef.current) {
        const loaded = await fetchFromNetwork();
        if (loaded) return;
      }

      dispatchState({ type: 'failed', sourceKey });
    };

    void tryFallbacks();
  }, [
    captureCandidateId,
    captureTabId,
    fetchFromCapture,
    fetchFromNetwork,
    loadingFallback,
    preferNetworkFallback,
    sourceKey,
  ]);

  const title = captureCandidateId ? `${src}\n[candidate=${captureCandidateId}]` : src;

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-border/40 text-2xs text-muted ${className ?? ''}`}
        title={title}
      >
        ✗
      </div>
    );
  }

  if (!resolvedSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-border/40 text-2xs text-muted ${className ?? ''}`}
        title={`${title}\n[blocked unsafe image source]`}
      >
        ✗
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={handleError}
      title={title}
    />
  );
}
