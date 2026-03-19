/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';
import { Predictor } from 'waifu2x-tfjs';

type BackendPreference = 'webgl' | 'cpu';

interface ProcessRequest {
  type: 'process';
  jobId: string;
  bytes: ArrayBuffer;
  mime: string;
  modelUrl: string;
  blockSizes: number[];
}

interface ResetRequest {
  type: 'reset';
}

type WorkerRequest = ProcessRequest | ResetRequest;

const predictors = new Map<string, Predictor>();

async function ensureBackend(): Promise<BackendPreference> {
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    return 'webgl';
  } catch {
    await tf.setBackend('cpu');
    await tf.ready();
    return 'cpu';
  }
}

function predictorKey(modelUrl: string, blockSize: number): string {
  return `${modelUrl}::${blockSize}`;
}

function getPredictor(modelUrl: string, blockSize: number, jobId: string): Predictor {
  const key = predictorKey(modelUrl, blockSize);
  const existing = predictors.get(key);
  if (existing) return existing;

  const predictor = new Predictor(modelUrl, blockSize);
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
  context.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;

  if (data.type === 'reset') {
    predictors.forEach((predictor) => predictor.destroy());
    predictors.clear();
    return;
  }

  const backend = await ensureBackend();
  self.postMessage({
    type: 'backend',
    jobId: data.jobId,
    backend,
  });

  const sourceBlob = new Blob([data.bytes], { type: data.mime });
  const bitmap = await createImageBitmap(sourceBlob);

  for (const blockSize of data.blockSizes) {
    try {
      const predictor = getPredictor(data.modelUrl, blockSize, data.jobId);
      const output = await predictor.predict(bitmap, false);
      const blob = await imageBitmapToBlob(output);
      const bytes = await blob.arrayBuffer();
      self.postMessage(
        {
          type: 'success',
          jobId: data.jobId,
          bytes,
          mime: blob.type || 'image/png',
          backend,
        },
        [bytes]
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown waifu2x error';
      const retryable = /oom|memory|allocate/i.test(message);
      self.postMessage({
        type: 'attempt-error',
        jobId: data.jobId,
        blockSize,
        error: message,
        retryable,
      });
      if (!retryable) break;
    }
  }

  self.postMessage({
    type: 'error',
    jobId: data.jobId,
    error: 'Upscale failed after exhausting available tile sizes.',
  });
};
