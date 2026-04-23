import { useCallback, useEffect, useReducer, useRef } from 'react';
import { captureImage, fetchBinary } from '@app/services/runtimeClient';
import type { ImageResolveMode } from '@shared/types';
import { isSafeRenderableImageSrc } from '@shared/utils/resourcePolicy';
import { isKnownImageProxyUrl } from '@shared/utils/url';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  referrer?: string;
  captureTabId?: number;
  captureCandidateId?: string;
  /** 'auto' = try native src first, then fetch on error
   *  'network-first' = try native img first, background fetch on error
   *  'capture-first' = live-DOM canvas capture first */
  resolveMode?: ImageResolveMode;
}

type Phase =
  | 'native'        // Showing native <img src=...>
  | 'fetching'      // Background-fetch in progress
  | 'resolved'      // Object-URL from fetch
  | 'failed';       // All strategies exhausted

interface SafeImageState {
  phase: Phase;
  displaySrc: string;
  attempt: number;
}

type SafeImageAction =
  | { type: 'reset'; displaySrc: string; phase: Phase; attempt: number }
  | { type: 'fetching'; attempt: number }
  | { type: 'resolved'; attempt: number; objectUrl: string }
  | { type: 'failed'; attempt: number };

// ── Global object-URL cache (LRU, keyed by fetched URL) ──────────────────────
const CACHE_LIMIT = 250;
const objectUrlCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const val = objectUrlCache.get(key);
  if (!val) return undefined;
  objectUrlCache.delete(key);
  objectUrlCache.set(key, val);
  return val;
}

function cacheSet(key: string, url: string): void {
  objectUrlCache.delete(key);
  objectUrlCache.set(key, url);
  if (objectUrlCache.size > CACHE_LIMIT) {
    const oldest = objectUrlCache.keys().next().value as string | undefined;
    if (oldest) {
      const evicted = objectUrlCache.get(oldest);
      objectUrlCache.delete(oldest);
      if (evicted?.startsWith('blob:')) URL.revokeObjectURL(evicted);
    }
  }
}

// ── Fetch concurrency semaphore ───────────────────────────────────────────────
const MAX_CONCURRENT = 8;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT) {
    activeFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => fetchQueue.push(resolve));
}

function releaseSlot(): void {
  activeFetches = Math.max(0, activeFetches - 1);
  const next = fetchQueue.shift();
  if (next) {
    activeFetches++;
    next();
  }
}

// ── Fetch with timeout helper ─────────────────────────────────────────────────
async function fetchWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// ── Per-image network fetch with retry cascade ─────────────────────────────────
const FETCH_TIMEOUT_MS = 20_000;

async function fetchBinaryWithRetry(
  src: string,
  referrer: string | undefined,
  tabId: number | undefined
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  let lastError: unknown;

  // Build a cascade of fetch strategies — each with different
  // referrer/tab combinations to find one that passes protection.
  const strategies: Array<() => Promise<{ bytes: ArrayBuffer; mime: string }>> = [];

  // Strategy 1: source-tab-aware fetch with referrer.
  // This gives the background access to page-world/content-script fallbacks
  // when the image is same-origin with the reader tab.
  if (tabId) {
    strategies.push(() => fetchBinary(src, { referrer, tabId }));
  }

  // Strategy 2: background-only fetch with referrer and DNR-injected Referer.
  if (referrer) {
    strategies.push(() => fetchBinary(src, { referrer }));
  }

  // Strategy 3/4: relax the referrer to strict-origin style.
  if (referrer) {
    try {
      const originRef = new URL(referrer).origin + '/';
      if (originRef !== referrer) {
        if (tabId) {
          strategies.push(() => fetchBinary(src, { referrer: originRef, tabId }));
        }
        strategies.push(() => fetchBinary(src, { referrer: originRef }));
      }
    } catch { /* ignore */ }
  }

  // Strategy 5/6: last resort without referrer.
  if (tabId) {
    strategies.push(() => fetchBinary(src, { tabId }));
  }
  strategies.push(() => fetchBinary(src, {}));

  for (let i = 0; i < strategies.length; i++) {
    try {
      return await fetchWithTimeout(strategies[i](), FETCH_TIMEOUT_MS);
    } catch (err) {
      lastError = err;
      // Small delay between attempts so we don't hammer the server
      if (i < strategies.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  throw lastError;
}

// ── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state: SafeImageState, action: SafeImageAction): SafeImageState {
  switch (action.type) {
    case 'reset':
      return { phase: action.phase, displaySrc: action.displaySrc, attempt: action.attempt };
    case 'fetching':
      if (action.attempt !== state.attempt) return state;
      return { ...state, phase: 'fetching' };
    case 'resolved':
      if (action.attempt !== state.attempt) return state;
      return { ...state, phase: 'resolved', displaySrc: action.objectUrl };
    case 'failed':
      if (action.attempt !== state.attempt) return state;
      return { ...state, phase: 'failed' };
    default:
      return state;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SafeImage({
  src,
  alt,
  className,
  referrer,
  captureTabId,
  captureCandidateId,
  resolveMode = 'auto',
}: SafeImageProps) {
  const attemptRef = useRef(0);
  const [state, dispatch] = useReducer(reducer, {
    phase: 'native',
    displaySrc: '',
    attempt: 0,
  });

  const isSafe = isSafeRenderableImageSrc(src);
  const isNetworkUrl = /^https?:\/\//i.test(src);
  const shouldAutoPreferCapture = (
    /^content:\/\//i.test(src) ||
    /^blob:/i.test(src) ||
    !isSafe ||
    isKnownImageProxyUrl(src)
  );
  // capture-first: explicit mode, or live-dom images with a candidate ID
  const forceCaptureFirst = resolveMode === 'capture-first' || (
    resolveMode === 'auto' &&
    Boolean(captureTabId) &&
    Boolean(captureCandidateId) &&
    shouldAutoPreferCapture
  );
  // network-first: explicitly requested OR the image URL indicates a proxy
  // In this mode we skip the native <img> and go straight to background fetch.
  // This is essential for hotlink-protected images (the extension page has
  // no origin that would pass the Referer check).
  const forceNetworkFetch = resolveMode === 'network-first' ||
    (resolveMode === 'auto' && isNetworkUrl && !!referrer && isKnownImageProxyUrl(src));

  // ── Effect: reset when src changes ─────────────────────────────────────────
  useEffect(() => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const cacheKey = `${src}::${referrer ?? ''}`;

    // 1. Already cached?
    const cached = cacheGet(cacheKey);
    if (cached) {
      dispatch({ type: 'reset', attempt, displaySrc: cached, phase: 'resolved' });
      return;
    }

    // 2. capture-first → go straight to source-tab capture / fetch resolution.
    if (forceCaptureFirst) {
      dispatch({ type: 'reset', attempt, displaySrc: '', phase: 'fetching' });
      void resolveViaFetch(attempt, cacheKey);
      return;
    }

    // 3. network-first or unsafe src → resolve through the background bridge.
    if (forceNetworkFetch || !isSafe) {
      if (isNetworkUrl) {
        dispatch({ type: 'reset', attempt, displaySrc: '', phase: 'fetching' });
        void resolveViaFetch(attempt, cacheKey);
      } else {
        dispatch({ type: 'reset', attempt, displaySrc: '', phase: 'failed' });
      }
      return;
    }

    // 4. 'auto' mode with a safe URL → try native img tag first (fastest path).
    //    onError will trigger background fetch if it fails.
    dispatch({ type: 'reset', attempt, displaySrc: src, phase: 'native' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, referrer, captureTabId, captureCandidateId, resolveMode]);

  // ── Fetch resolution ────────────────────────────────────────────────────────
  const resolveViaFetch = useCallback(
    async (attempt: number, cacheKey: string) => {
      if (attempt !== attemptRef.current) return;
      dispatch({ type: 'fetching', attempt });

      await acquireSlot();
      try {
        if (attempt !== attemptRef.current) return;

        // Try canvas capture first if we have a candidate ID
        // (works for live-dom images where the tab is still open)
        if (captureTabId && captureCandidateId) {
          try {
            const res = await fetchWithTimeout(
              captureImage(captureTabId, captureCandidateId),
              8_000
            );
            const url = URL.createObjectURL(new Blob([res.bytes], { type: res.mime || 'image/png' }));
            cacheSet(cacheKey, url);
            if (attempt === attemptRef.current) {
              dispatch({ type: 'resolved', attempt, objectUrl: url });
            }
            return;
          } catch {
            // Tab may be closed — fall through to network fetch
          }
        }

        if (!isNetworkUrl) {
          dispatch({ type: 'failed', attempt });
          return;
        }

        const res = await fetchBinaryWithRetry(src, referrer, captureTabId);
        const url = URL.createObjectURL(new Blob([res.bytes], { type: res.mime || 'image/jpeg' }));
        cacheSet(cacheKey, url);
        if (attempt === attemptRef.current) {
          dispatch({ type: 'resolved', attempt, objectUrl: url });
        }
      } catch {
        if (attempt === attemptRef.current) {
          dispatch({ type: 'failed', attempt });
        }
      } finally {
        releaseSlot();
      }
    },
    [src, referrer, captureTabId, captureCandidateId, forceCaptureFirst, isNetworkUrl]
  );

  // ── Error handler (native img failed to load) ───────────────────────────────
  const handleNativeError = useCallback(() => {
    if (state.phase !== 'native') return;
    if (!isNetworkUrl) {
      dispatch({ type: 'failed', attempt: attemptRef.current });
      return;
    }
    // The native <img> tag failed (protection, CORS, hotlink, bad network, etc.)
    // → fall back to background fetch which uses DNR referrer injection
    const cacheKey = `${src}::${referrer ?? ''}`;
    void resolveViaFetch(attemptRef.current, cacheKey);
  }, [state.phase, isNetworkUrl, src, referrer, resolveViaFetch]);

  // ── Retry handler (click to retry on "failed" state) ────────────────────────
  const handleRetry = useCallback(() => {
    if (!isNetworkUrl) return;
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    const cacheKey = `${src}::${referrer ?? ''}`;
    // Instead of trying native again (it already failed), go straight to fetch
    dispatch({ type: 'reset', attempt, displaySrc: '', phase: 'fetching' });
    void resolveViaFetch(attempt, cacheKey);
  }, [isNetworkUrl, src, referrer, resolveViaFetch]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const { phase, displaySrc } = state;

  if (phase === 'failed') {
    return (
      <div
        className={`safe-image-failed flex cursor-pointer items-center justify-center select-none ${className ?? ''}`}
        title={`${src}\n\nCliquer pour réessayer`}
        onClick={handleRetry}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleRetry(); }}
      >
        <div className="flex flex-col items-center gap-1 text-muted/50">
          <svg className="h-4 w-4 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span className="text-[9px]">Réessayer</span>
        </div>
      </div>
    );
  }

  if (phase === 'fetching' || !displaySrc) {
    return (
      <div
        className={`safe-image-skeleton ${className ?? ''}`}
        title={src}
      />
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={handleNativeError}
      title={src}
    />
  );
}
