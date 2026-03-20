/// <reference lib="webworker" />

import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-webgpu';
import type { GraphModel } from '@tensorflow/tfjs-converter';
import type { AppMode } from '@shared/types';
import { loadGraphModel, ready, setBackend } from './tfjsCompat';
import { RealesrganImage } from './realesrganImage';
import {
  getBackendPriority,
  getRealesrganModelUrl,
  getRealesrganPreset,
  getRealesrganStorageKey,
  type RealesrganModelPreset,
  type UpscaleBackend,
} from './realesrganModels';
import { upscaleWithGraphModel } from './realesrganProcess';

interface ProcessRequest {
  type: 'process';
  jobId: string;
  bytes: ArrayBuffer;
  mime: string;
  mode: AppMode;
}

interface ResetRequest {
  type: 'reset';
}

type WorkerRequest = ProcessRequest | ResetRequest;

const models = new Map<string, GraphModel>();

function sendProgress(jobId: string, backend: UpscaleBackend, progress: number, info: string) {
  self.postMessage({
    type: 'progress',
    jobId,
    stage: 'predict',
    ratio: progress,
    info,
    backend,
  });
}

function buildAttemptError(backend: UpscaleBackend, tileSize: number, message: string) {
  return `${backend}/${tileSize}: ${message}`;
}

async function activateBackend(preferred?: UpscaleBackend): Promise<UpscaleBackend> {
  const backends = preferred
    ? [preferred, ...getBackendPriority().filter((item) => item !== preferred)]
    : getBackendPriority();

  for (const backend of backends) {
    try {
      const ok = await setBackend(backend);
      if (!ok) continue;
      await ready();
      return backend;
    } catch {
      // Try next backend.
    }
  }

  throw new Error('No supported TensorFlow backend found.');
}

async function loadModel(preset: RealesrganModelPreset, tileSize: number, jobId: string): Promise<GraphModel> {
  const storageKey = getRealesrganStorageKey(preset, tileSize);
  const cached = models.get(storageKey);
  if (cached) {
    return cached;
  }

  try {
    const model = await loadGraphModel(`indexeddb://${storageKey}`);
    models.set(storageKey, model);
    self.postMessage({ type: 'model-cache', jobId, storageKey });
    return model;
  } catch {
    const modelUrl = getRealesrganModelUrl(preset, tileSize);
    self.postMessage({ type: 'model-download', jobId, storageKey });
    const model = await loadGraphModel(modelUrl);
    try {
      await model.save(`indexeddb://${storageKey}`);
    } catch {
      // Non-blocking: the model can still be used without persisted cache.
    }
    models.set(storageKey, model);
    return model;
  }
}

async function decodeSource(bytes: ArrayBuffer, mime: string): Promise<RealesrganImage> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('OffscreenCanvas 2D context unavailable');
  }

  try {
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return new RealesrganImage(bitmap.width, bitmap.height, new Uint8Array(imageData.data));
  } finally {
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

async function encodeOutput(image: RealesrganImage): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('OffscreenCanvas 2D context unavailable');
  }

  const rgba = new Uint8ClampedArray(image.data);
  context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return {
    bytes: await blob.arrayBuffer(),
    mime: blob.type || 'image/png',
  };
}

async function upscaleTiledImage(
  model: GraphModel,
  input: RealesrganImage,
  preset: RealesrganModelPreset,
  tileSize: number,
  backend: UpscaleBackend,
  jobId: string,
  alpha = false
): Promise<RealesrganImage> {
  const factor = preset.factor;
  const output = new RealesrganImage(input.width * factor, input.height * factor);
  const width = input.width;
  const height = input.height;
  const minOverlap = preset.minOverlap;

  let numX = 1;
  while (numX === 1 || (tileSize * numX - width) / (numX - 1) < minOverlap) {
    numX += 1;
    if (tileSize * numX >= width + minOverlap * (numX - 1)) break;
  }

  let numY = 1;
  while (numY === 1 || (tileSize * numY - height) / (numY - 1) < minOverlap) {
    numY += 1;
    if (tileSize * numY >= height + minOverlap * (numY - 1)) break;
  }

  const locX = new Array<number>(numX);
  const locY = new Array<number>(numY);
  const padLeft = new Array<number>(numX);
  const padTop = new Array<number>(numY);
  const padRight = new Array<number>(numX);
  const padBottom = new Array<number>(numY);

  const totalOverlapX = tileSize * numX - width;
  const totalOverlapY = tileSize * numY - height;
  const baseOverlapX = Math.floor(totalOverlapX / (numX - 1));
  const baseOverlapY = Math.floor(totalOverlapY / (numY - 1));
  const extraOverlapX = totalOverlapX - baseOverlapX * (numX - 1);
  const extraOverlapY = totalOverlapY - baseOverlapY * (numY - 1);

  locX[0] = 0;
  for (let index = 1; index < numX; index += 1) {
    locX[index] = locX[index - 1]! + tileSize - baseOverlapX - (index <= extraOverlapX ? 1 : 0);
  }

  locY[0] = 0;
  for (let index = 1; index < numY; index += 1) {
    locY[index] = locY[index - 1]! + tileSize - baseOverlapY - (index <= extraOverlapY ? 1 : 0);
  }

  padLeft[0] = 0;
  padTop[0] = 0;
  padRight[numX - 1] = 0;
  padBottom[numY - 1] = 0;

  for (let index = 1; index < numX; index += 1) {
    padLeft[index] = Math.floor((locX[index - 1]! + tileSize - locX[index]!) / 2);
  }
  for (let index = 1; index < numY; index += 1) {
    padTop[index] = Math.floor((locY[index - 1]! + tileSize - locY[index]!) / 2);
  }
  for (let index = 0; index < numX - 1; index += 1) {
    padRight[index] = locX[index]! + tileSize - locX[index + 1]! - padLeft[index + 1]!;
  }
  for (let index = 0; index < numY - 1; index += 1) {
    padBottom[index] = locY[index]! + tileSize - locY[index + 1]! - padTop[index + 1]!;
  }

  const total = numX * numY;
  let completed = 0;

  for (let xIndex = 0; xIndex < numX; xIndex += 1) {
    for (let yIndex = 0; yIndex < numY; yIndex += 1) {
      const x1 = locX[xIndex]!;
      const y1 = locY[yIndex]!;
      const x2 = x1 + tileSize;
      const y2 = y1 + tileSize;

      const tile = new RealesrganImage(tileSize, tileSize);
      tile.getImageCrop(0, 0, input, x1, y1, x2, y2);
      const scaled = await upscaleWithGraphModel(tile, model, alpha);
      output.getImageCrop(
        (x1 + padLeft[xIndex]!) * factor,
        (y1 + padTop[yIndex]!) * factor,
        scaled,
        padLeft[xIndex]! * factor,
        padTop[yIndex]! * factor,
        scaled.width - padRight[xIndex]! * factor,
        scaled.height - padBottom[yIndex]! * factor
      );

      completed += 1;
      sendProgress(
        jobId,
        backend,
        completed / total,
        alpha ? `Alpha ${completed}/${total}` : `Image ${completed}/${total}`
      );
    }
  }

  return output;
}

async function processWithPreset(
  data: ProcessRequest,
  preset: RealesrganModelPreset,
  backend: UpscaleBackend
): Promise<{ bytes: ArrayBuffer; mime: string; tileSize: number; backend: UpscaleBackend }> {
  const input = await decodeSource(data.bytes, data.mime);
  const hasAlpha = input.hasAlpha();

  let lastError = 'unknown upscale failure';
  for (const tileSize of preset.tileSizes) {
    try {
      const model = await loadModel(preset, tileSize, data.jobId);
      let output = await upscaleTiledImage(model, input, preset, tileSize, backend, data.jobId);

      if (hasAlpha) {
        const alphaInput = input.extractAlphaAsRgb();
        const alphaOutput = await upscaleTiledImage(model, alphaInput, preset, tileSize, backend, data.jobId, true);
        output.applyAlpha(alphaOutput);
      }

      const encoded = await encodeOutput(output);
      return { ...encoded, tileSize, backend };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = buildAttemptError(backend, tileSize, message);
      self.postMessage({
        type: 'attempt-error',
        jobId: data.jobId,
        backend,
        blockSize: tileSize,
        error: message,
        retryable: true,
      });
    }
  }

  throw new Error(lastError);
}

function resetModels(): void {
  models.forEach((model) => model.dispose());
  models.clear();
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;

  if (data.type === 'reset') {
    resetModels();
    return;
  }

  try {
    const preset = getRealesrganPreset(data.mode);
    const backend = await activateBackend();
    self.postMessage({
      type: 'backend',
      jobId: data.jobId,
      backend: `${preset.label} / ${backend}`,
    });

    const result = await processWithPreset(data, preset, backend);
    self.postMessage({
      type: 'success',
      jobId: data.jobId,
      bytes: result.bytes,
      mime: result.mime,
      backend: result.backend,
      tileSize: result.tileSize,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      jobId: data.jobId,
      error: error instanceof Error ? error.message : 'Real-CUGAN upscale failed',
    });
  }
});
