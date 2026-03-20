/// <reference lib="webworker" />

import '@tensorflow/tfjs-backend-cpu';
import { ready, setBackend } from './tfjsCompat';
import {
  buildUpscaleFailureMessage,
  isRetryableUpscaleError,
  type UpscaleBackend,
} from './waifu2xFallback';
import { WaifuPredictor } from './waifuPredictor';

interface ProcessRequest {
  type: 'process';
  jobId: string;
  bytes: ArrayBuffer;
  mime: string;
  modelUrl: string;
  blockSizes: number[];
  preferredBackend?: UpscaleBackend;
}

interface ResetRequest {
  type: 'reset';
}

type WorkerRequest = ProcessRequest | ResetRequest;

const predictors = new Map<string, WaifuPredictor>();

function predictorKey(modelUrl: string, blockSize: number, backend: UpscaleBackend): string {
  return `${backend}::${modelUrl}::${blockSize}`;
}

function disposePredictor(modelUrl: string, blockSize: number, backend: UpscaleBackend): void {
  const key = predictorKey(modelUrl, blockSize, backend);
  const predictor = predictors.get(key);
  if (!predictor) return;
  predictor.destroy();
  predictors.delete(key);
}

function resetPredictors(): void {
  predictors.forEach((predictor) => predictor.destroy());
  predictors.clear();
}

async function activateBackend(backend: UpscaleBackend): Promise<UpscaleBackend> {
  await setBackend(backend);
  await ready();
  return backend;
}

async function getInitialBackend(preferred?: UpscaleBackend): Promise<UpscaleBackend> {
  if (preferred) {
    return activateBackend(preferred);
  }
  try {
    return await activateBackend('webgl');
  } catch {
    return activateBackend('cpu');
  }
}

function getPredictor(modelUrl: string, blockSize: number, jobId: string, backend: UpscaleBackend): WaifuPredictor {
  const key = predictorKey(modelUrl, blockSize, backend);
  const existing = predictors.get(key);
  if (existing) return existing;

  const predictor = new WaifuPredictor(modelUrl, blockSize);
  predictor.listenToModelDownloadProgress((ratio) => {
    self.postMessage({
      type: 'progress',
      jobId,
      stage: 'model',
      ratio,
    });
  });
  predictor.listenToModelPredictProgress((ratio) => {
    self.postMessage({
      type: 'progress',
      jobId,
      stage: 'predict',
      ratio,
    });
  });
  predictors.set(key, predictor);
  return predictor;
}

async function imageBitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('OffscreenCanvas 2D context unavailable');
  }

  try {
    context.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  } finally {
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

async function runAttempt(
  data: ProcessRequest,
  sourceBitmap: ImageBitmap,
  backend: UpscaleBackend
): Promise<{ success: true } | { success: false; lastError?: string; shouldFallbackToCpu: boolean }> {
  let lastError: string | undefined;

  for (const blockSize of data.blockSizes) {
    try {
      const predictor = getPredictor(data.modelUrl, blockSize, data.jobId, backend);
      const output = await predictor.predict(sourceBitmap, false);
      const blob = await imageBitmapToBlob(output);
      const bytes = await blob.arrayBuffer();
      self.postMessage(
        {
          type: 'success',
          jobId: data.jobId,
          bytes,
          mime: blob.type || 'image/png',
          backend,
        }
      );
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown waifu2x error';
      lastError = `${backend}/${blockSize}: ${message}`;
      const retryable = isRetryableUpscaleError(message);

      self.postMessage({
        type: 'attempt-error',
        jobId: data.jobId,
        backend,
        blockSize,
        error: message,
        retryable,
      });

      disposePredictor(data.modelUrl, blockSize, backend);

      if (!retryable) {
        return {
          success: false,
          lastError,
          shouldFallbackToCpu: backend === 'webgl',
        };
      }
    }
  }

  return {
    success: false,
    lastError,
    shouldFallbackToCpu: backend === 'webgl',
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;

  if (data.type === 'reset') {
    resetPredictors();
    return;
  }

  let sourceBitmap: ImageBitmap | null = null;
  let lastError: string | undefined;

  try {
    let backend = await getInitialBackend(data.preferredBackend);
    self.postMessage({
      type: 'backend',
      jobId: data.jobId,
      backend,
    });

    const sourceBlob = new Blob([data.bytes], { type: data.mime });
    sourceBitmap = await createImageBitmap(sourceBlob);

    const firstPass = await runAttempt(data, sourceBitmap, backend);
    if (firstPass.success) {
      return;
    }

    lastError = firstPass.lastError;
    if (firstPass.shouldFallbackToCpu && backend !== 'cpu') {
      resetPredictors();
      backend = await activateBackend('cpu');
      self.postMessage({
        type: 'backend',
        jobId: data.jobId,
        backend,
      });

      const cpuPass = await runAttempt(data, sourceBitmap, backend);
      if (cpuPass.success) {
        return;
      }

      lastError = cpuPass.lastError ?? lastError;
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Unknown waifu2x error';
  } finally {
    if (sourceBitmap && typeof sourceBitmap.close === 'function') {
      sourceBitmap.close();
    }
  }

  self.postMessage({
    type: 'error',
    jobId: data.jobId,
    error: buildUpscaleFailureMessage(lastError),
  });
};
