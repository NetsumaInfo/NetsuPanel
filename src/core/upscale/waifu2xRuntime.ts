import type { AppMode, UpscaleSettings } from '@shared/types';
import { getUpscaleModelDefinition } from './realesrganModels';
import { preferredBlockSizes } from './waifu2xFallback';
import { getWaifuModelUrl } from './waifu2xModels';

type ProgressCallback = (message: string, progress: number) => void;

interface UpscaleOptions {
  cacheKey: string;
  bytes: ArrayBuffer;
  mime: string;
  mode: AppMode;
  settings?: UpscaleSettings;
  useCache?: boolean;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

interface PendingJob {
  resolve: (value: Blob) => void;
  reject: (reason?: unknown) => void;
  onProgress?: ProgressCallback;
  lastProgressAt: number;
  lastProgressRatio: number;
}

const CACHE_LIMIT = 16;
const PROGRESS_THROTTLE_MS = 90;
const PROGRESS_MIN_DELTA = 0.02;

export class Waifu2xRuntime {
  private worker: Worker | null = null;

  private workerKind: 'realesrgan' | 'waifu2x' | null = null;

  private pending = new Map<string, PendingJob>();

  private queue = Promise.resolve();

  private cache = new Map<string, Blob>();

  private disabledReason: string | null = null;

  private rememberCache(cacheKey: string, blob: Blob): void {
    if (this.cache.has(cacheKey)) {
      this.cache.delete(cacheKey);
    }
    this.cache.set(cacheKey, blob);
    while (this.cache.size > CACHE_LIMIT) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private ensureWorker(settings?: UpscaleSettings): Worker {
    if (this.disabledReason) {
      throw new Error(this.disabledReason);
    }

    const modelFamily = settings ? getUpscaleModelDefinition(settings.modelId).type : 'realcugan';
    const nextWorkerKind = modelFamily === 'waifu2x' ? 'waifu2x' : 'realesrgan';
    if (this.worker && this.workerKind === nextWorkerKind) return this.worker;
    if (this.worker && this.workerKind !== nextWorkerKind) {
      this.worker.terminate();
      this.worker = null;
      this.pending.clear();
    }

    this.worker = nextWorkerKind === 'waifu2x'
      ? new Worker(new URL('./waifu2x.worker.ts', import.meta.url), {
          type: 'module',
        })
      : new Worker(new URL('./realesrgan.worker.ts', import.meta.url), {
          type: 'module',
        });
    this.workerKind = nextWorkerKind;
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.disabledReason = 'AI upscale unavailable in this browser context (CSP or worker error).';
      const error = new Error(this.disabledReason);
      this.pending.forEach((job) => job.reject(error));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker.onmessageerror = () => {
      this.disabledReason = 'AI upscale worker message transport failed.';
      const error = new Error(this.disabledReason);
      this.pending.forEach((job) => job.reject(error));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown>;
      const jobId = String(data.jobId || '');
      const pending = this.pending.get(jobId);
      if (!pending) return;

      if (data.type === 'progress' && pending.onProgress) {
        const ratio = Number(data.ratio || 0);
        const info = String(data.info || '');
        const now = Date.now();
        const ratioDelta = Math.abs(ratio - pending.lastProgressRatio);
        if (
          ratio < 0.99
          && now - pending.lastProgressAt < PROGRESS_THROTTLE_MS
          && ratioDelta < PROGRESS_MIN_DELTA
        ) {
          return;
        }
        pending.lastProgressAt = now;
        pending.lastProgressRatio = ratio;
        pending.onProgress(info || 'Upscaling image...', ratio);
        return;
      }

      if (data.type === 'backend' && pending.onProgress) {
        pending.onProgress(`AI backend: ${String(data.backend)}`, 0.05);
        return;
      }

      if (data.type === 'model-download' && pending.onProgress) {
        pending.onProgress('Downloading AI model...', 0.01);
        return;
      }

      if (data.type === 'model-cache' && pending.onProgress) {
        pending.onProgress('Loaded AI model from cache.', 0.01);
        return;
      }

      if (data.type === 'attempt-error' && pending.onProgress) {
        const backend = String(data.backend || 'unknown');
        const blockSize = Number(data.blockSize || 0);
        pending.onProgress(`Retrying AI tile ${blockSize} on ${backend}...`, 0.1);
        return;
      }

      if (data.type === 'success') {
        this.pending.delete(jobId);
        pending.resolve(new Blob([data.bytes as ArrayBuffer], { type: String(data.mime || 'image/png') }));
        return;
      }

      if (data.type === 'error') {
        this.pending.delete(jobId);
        pending.reject(new Error(String(data.error || 'Upscale failed')));
      }
    };
    return this.worker;
  }

  upscale(options: UpscaleOptions): Promise<Blob> {
    const useCache = options.useCache ?? true;
    if (useCache) {
      const cached = this.cache.get(options.cacheKey);
      if (cached) {
        return Promise.resolve(cached);
      }
    }

    return new Promise((resolve, reject) => {
      const run = async () => {
        if (options.signal?.aborted) {
          reject(new Error('Upscale cancelled'));
          return;
        }

        const worker = this.ensureWorker(options.settings);
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const requestBytes = options.bytes.slice(0);
        this.pending.set(jobId, {
          resolve: (blob) => {
            if (useCache) {
              this.rememberCache(options.cacheKey, blob);
            }
            resolve(blob);
          },
          reject,
          onProgress: options.onProgress,
          lastProgressAt: 0,
          lastProgressRatio: 0,
        });

        if (this.workerKind === 'waifu2x') {
          worker.postMessage(
            {
              type: 'process',
              jobId,
              bytes: requestBytes,
              mime: options.mime,
              modelUrl: getWaifuModelUrl(options.mode, options.settings!),
              blockSizes: options.settings?.tileSize ? [options.settings.tileSize] : preferredBlockSizes(options.bytes.byteLength),
              taskMode: options.settings?.waifuMode,
              noiseLevel: Number(options.settings?.waifuNoiseLevel ?? 0),
              preferredBackend:
                options.settings?.preferredBackend && options.settings.preferredBackend !== 'auto'
                  ? options.settings.preferredBackend
                  : undefined,
            },
            [requestBytes]
          );
        } else {
          worker.postMessage(
            {
              type: 'process',
              jobId,
              bytes: requestBytes,
              mime: options.mime,
              mode: options.mode,
              settings: options.settings,
            },
            [requestBytes]
          );
        }
      };

      this.queue = this.queue.then(run, run);
    });
  }

  reset(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'reset' });
      this.worker.terminate();
      this.worker = null;
    }
    this.workerKind = null;
    this.pending.clear();
    this.cache.clear();
  }
}
