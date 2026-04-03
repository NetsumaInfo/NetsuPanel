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
  /** 'auto' = try native src first, then fetch on error
   *  'network-first' = always proxy-fetch (protected images)
   *  'capture-first' = live-DOM canvas capture first */
  resolveMode?: 'auto' | 'network-first' | 'capture-first';
}

type Phase =
  | 'native'        // Showing native <img src=...>
  | 'fetching'      // Background-fetch in progress
  | 'resolved'      // Object-URL from fetch
  | 'failed';       // All strategies exhausted

interface SafeImageState {
  phase: Phase;
  displaySrc: string;
  attempt: number;   // increments on src prop change
}

type SafeImageAction =
  | { type: 'reset'; displaySrc: string; phase: Phase; attempt: number }
  | { type: 'fetching'; attempt: number }
  | { type: 'resolved'; attempt: number; objectUrl: string }
  | { type: 'failed'; attempt: number };

// ── Global object-URL cache (LRU, keyed by "src::referrer") ──────────────────
const CACHE_LIMIT = 200;
const objectUrlCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const val = objectUrlCache.get(key);
  if (!val) return undefined;
  // LRU touch
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
      // Revoke only non-data URLs
      if (evicted?.startsWith('blob:')) URL.revokeObjectURL(evicted);
    }
  }
}

// ── Fetch concurrency semaphore ───────────────────────────────────────────────
const MAX_CONCURRENT = 10;
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

// ── Per-image network fetch (with retries) ─────────────────────────────────────
const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [800, 2000];

async function fetchBinaryWithRetry(
  src: string,
  referrer: string | undefined,
  tabId: number | undefined
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  let lastError: unknown;

  const attempts = [
    // Attempt 1: with referrer
    () => fetchBinary(src, { referrer, tabId }),
    // Attempt 2: without referrer (some CDNs reject mismatched referrer)
    () => fetchBinary(src, { tabId }),
    // Attempt 3: without tabId (use background fetch directly)
    () => fetchBinary(src, { referrer }),
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      const result = await fetchWithTimeout(attempts[i](), FETCH_TIMEOUT_MS);
      return result;
    } catch (err) {
      lastError = err;
      if (i < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
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
  const forceNetworkFirst = resolveMode === 'network-first';
  const forceCaptureFirst = resolveMode === 'capture-first' || (
    resolveMode === 'auto' &&
    Boolean(captureTabId) &&
    Boolean(captureCandidateId) &&
    isNetworkUrl &&
    (() => {
      try {
        const p = new URL(src).pathname;
        return p.startsWith('/_next/image') || p.startsWith('/cdn-cgi/image');
      } catch { return false; }
    })()
  );

  // ── Effect: reset when src changes ─────────────────────────────────────────
  useEffect(() => {
    attemptRef.current += 1;
    const attempt = attemptRef.current;

    const cacheKey = `${src}::${referrer ?? ''}`;

    // 1. Already cached? → show immediately
    const cached = cacheGet(cacheKey);
    if (cached) {
      dispatch({ type: 'reset', attempt, displaySrc: cached, phase: 'resolved' });
      return;
    }

    // 2. force network/capture first → start fetch immediately (no native try)
    if (forceNetworkFirst || forceCaptureFirst) {
      dispatch({ type: 'reset', attempt, displaySrc: '', phase: 'fetching' });
      void resolveViaFetch(attempt, cacheKey);
      return;
    }

    // 3. Default: show native src immediately (fastest path)
    dispatch({ type: 'reset', attempt, displaySrc: isSafe ? src : '', phase: 'native' });

    // If src is not safe to render directly, kick off a fetch right away
    if (!isSafe && isNetworkUrl) {
      void resolveViaFetch(attempt, cacheKey);
    }
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

        // Try canvas capture first if requested
        if (forceCaptureFirst && captureTabId && captureCandidateId) {
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
            // fall through to network fetch
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
    // Native load failed → try background fetch
    const cacheKey = `${src}::${referrer ?? ''}`;
    void resolveViaFetch(attemptRef.current, cacheKey);
  }, [state.phase, isNetworkUrl, src, referrer, resolveViaFetch]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const { phase, displaySrc } = state;

  if (phase === 'failed') {
    return (
      <div
        className={`safe-image-failed flex items-center justify-center bg-border/30 text-2xs text-muted/60 select-none ${className ?? ''}`}
        title={src}
      >
        <svg className="h-4 w-4 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }

  if (phase === 'fetching' || !displaySrc) {
    return (
      <div
        className={`safe-image-skeleton animate-pulse bg-gradient-to-br from-border/40 via-border/20 to-border/40 ${className ?? ''}`}
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
