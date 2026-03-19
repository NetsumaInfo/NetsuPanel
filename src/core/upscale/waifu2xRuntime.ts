import type { AppMode } from '@shared/types';
import { getWaifuModelUrl } from './waifu2xModels';

type ProgressCallback = (message: string, progress: number) => void;

interface UpscaleOptions {
  cacheKey: string;
  bytes: ArrayBuffer;
  mime: string;
  mode: AppMode;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

interface PendingJob {
  resolve: (value: Blob) => void;
  reject: (reason?: unknown) => void;
  onProgress?: ProgressCallback;
}

function preferredBlockSizes(byteLength: number): number[] {
  if (byteLength < 1_000_000) return [64, 48, 32];
  if (byteLength < 4_000_000) return [48, 32, 24];
  return [32, 24, 16];
}

export class Waifu2xRuntime {
  private worker: Worker | null = null;

  private pending = new Map<string, PendingJob>();

  private queue = Promise.resolve();

  private cache = new Map<string, Blob>();

  private disabledReason: string | null = null;

  private ensureWorker(): Worker {
    if (this.disabledReason) {
      throw new Error(this.disabledReason);
    }

    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./waifu2x.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.disabledReason = 'waifu2x unavailable in this browser context (CSP or worker error).';
      const error = new Error(this.disabledReason);
      this.pending.forEach((job) => job.reject(error));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker.onmessageerror = () => {
      this.disabledReason = 'waifu2x worker message transport failed.';
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
        const stage = String(data.stage || 'predict');
        pending.onProgress(stage === 'model' ? 'Loading waifu2x model...' : 'Upscaling image...', ratio);
        return;
      }

      if (data.type === 'backend' && pending.onProgress) {
        pending.onProgress(`waifu2x backend: ${String(data.backend)}`, 0.05);
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
    const cached = this.cache.get(options.cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
      const run = async () => {
        if (options.signal?.aborted) {
          reject(new Error('Upscale cancelled'));
          return;
        }

        const worker = this.ensureWorker();
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const requestBytes = options.bytes.slice(0);
        this.pending.set(jobId, {
          resolve: (blob) => {
            this.cache.set(options.cacheKey, blob);
            resolve(blob);
          },
          reject,
          onProgress: options.onProgress,
        });

        worker.postMessage(
          {
            type: 'process',
            jobId,
            bytes: requestBytes,
            mime: options.mime,
            modelUrl: getWaifuModelUrl(options.mode),
            blockSizes: preferredBlockSizes(options.bytes.byteLength),
          },
          [requestBytes]
        );
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
    this.pending.clear();
  }
}
