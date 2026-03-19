import { useCallback, useEffect, useRef, useState } from 'react';
import { captureImage, fetchBinary } from '@app/services/runtimeClient';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  referrer?: string;
  captureTabId?: number;
  captureCandidateId?: string;
}

const FALLBACK_CACHE_LIMIT = 180;
const objectUrlCache = new Map<string, string>();

function buildCacheKey(src: string, referrer?: string): string {
  return `${src}::${referrer ?? ''}`;
}

function buildCaptureKey(tabId?: number, candidateId?: string): string {
  return `capture:${tabId ?? 'none'}:${candidateId ?? 'none'}`;
}

function isNetworkUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

function getCachedObjectUrl(key: string): string | undefined {
  const value = objectUrlCache.get(key);
  if (!value) return undefined;
  objectUrlCache.delete(key);
  objectUrlCache.set(key, value);
  return value;
}

function setCachedObjectUrl(key: string, objectUrl: string): void {
  const previous = objectUrlCache.get(key);
  if (previous && previous !== objectUrl) {
    URL.revokeObjectURL(previous);
  }

  objectUrlCache.delete(key);
  objectUrlCache.set(key, objectUrl);

  if (objectUrlCache.size > FALLBACK_CACHE_LIMIT) {
    const oldestKey = objectUrlCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    const oldestUrl = objectUrlCache.get(oldestKey);
    if (oldestUrl) {
      URL.revokeObjectURL(oldestUrl);
    }
    objectUrlCache.delete(oldestKey);
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
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const requestTokenRef = useRef(0);
  const captureAttemptedRef = useRef(false);
  const networkAttemptedRef = useRef(false);

  const fetchFromCapture = useCallback(async (): Promise<boolean> => {
    if (!captureTabId || !captureCandidateId) return false;

    const cacheKey = buildCaptureKey(captureTabId, captureCandidateId);
    const cached = getCachedObjectUrl(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      return true;
    }

    const token = requestTokenRef.current;
    setLoadingFallback(true);
    captureAttemptedRef.current = true;

    try {
      const resource = await captureImage(captureTabId, captureCandidateId);
      const objectUrl = URL.createObjectURL(new Blob([resource.bytes], { type: resource.mime || 'image/png' }));
      setCachedObjectUrl(cacheKey, objectUrl);

      if (requestTokenRef.current !== token) return false;
      setResolvedSrc(objectUrl);
      setFailed(false);
      return true;
    } catch {
      return false;
    } finally {
      if (requestTokenRef.current === token) {
        setLoadingFallback(false);
      }
    }
  }, [captureCandidateId, captureTabId]);

  const fetchFromNetwork = useCallback(async (): Promise<boolean> => {
    if (!isNetworkUrl(src)) {
      return false;
    }

    const cacheKey = buildCacheKey(src, referrer);
    const cached = getCachedObjectUrl(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      return true;
    }

    const token = requestTokenRef.current;
    setLoadingFallback(true);
    networkAttemptedRef.current = true;

    try {
      const resource = await fetchBinary(src, { referrer, tabId: captureTabId });
      const objectUrl = URL.createObjectURL(new Blob([resource.bytes], { type: resource.mime || 'image/jpeg' }));
      setCachedObjectUrl(cacheKey, objectUrl);

      if (requestTokenRef.current !== token) return false;
      setResolvedSrc(objectUrl);
      setFailed(false);
      return true;
    } catch {
      return false;
    } finally {
      if (requestTokenRef.current === token) {
        setLoadingFallback(false);
      }
    }
  }, [referrer, src]);

  useEffect(() => {
    requestTokenRef.current += 1;
    setLoadingFallback(false);
    setFailed(false);
    captureAttemptedRef.current = false;
    networkAttemptedRef.current = false;

    const captureKey = buildCaptureKey(captureTabId, captureCandidateId);
    const cachedCapture = getCachedObjectUrl(captureKey);
    if (cachedCapture) {
      setResolvedSrc(cachedCapture);
      return;
    }

    const networkKey = buildCacheKey(src, referrer);
    setResolvedSrc(getCachedObjectUrl(networkKey) || src);
  }, [captureCandidateId, captureTabId, referrer, src]);

  const handleError = useCallback(() => {
    if (loadingFallback) return;

    const tryFallbacks = async () => {
      if (captureTabId && captureCandidateId && !captureAttemptedRef.current) {
        const loaded = await fetchFromCapture();
        if (loaded) return;
      }

      if (!networkAttemptedRef.current) {
        const loaded = await fetchFromNetwork();
        if (loaded) return;
      }

      setFailed(true);
    };

    void tryFallbacks();
  }, [captureCandidateId, captureTabId, fetchFromCapture, fetchFromNetwork, loadingFallback]);

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

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      className={className}
      onError={handleError}
      title={title}
    />
  );
}
