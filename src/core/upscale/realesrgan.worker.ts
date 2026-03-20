/// <reference lib="webworker" />

import type { GraphModel } from '@tensorflow/tfjs-converter';
import type { AppMode, UpscaleSettings } from '@shared/types';
import { env, loadGraphModel, ready, setBackend } from './tfjsCompat';
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
  settings?: UpscaleSettings;
}

interface ResetRequest {
  type: 'reset';
}

type WorkerRequest = ProcessRequest | ResetRequest;

const models = new Map<string, GraphModel>();
const backendRegistry = new Set<UpscaleBackend>();
const BACKEND_LOADERS: Partial<Record<UpscaleBackend, () => Promise<unknown>>> = {
  webgpu: () => import('@tensorflow/tfjs-backend-webgpu'),
  webgl: () => import('@tensorflow/tfjs-backend-webgl'),
  cpu: () => import('@tensorflow/tfjs-backend-cpu'),
};
const YIELD_EVERY_TILES = 6;
const YIELD_EVERY_TILES_INTEGRATED = 2;
let activeWebglRenderer: string | null = null;
let activeWebglIntegrated = false;
let webglContextPatched = false;
let webGpuRequestAdapterPatched = false;
let activeWebgpuAdapterInfo: string | null = null;
let preferredWebglVersion: 1 | 2 = 2;

interface AxisLayout {
  locations: number[];
  padStart: number[];
  padEnd: number[];
}

function isLikelyIntegratedRenderer(renderer: string): boolean {
  const lower = renderer.toLowerCase();
  if (/nvidia|geforce|quadro|rtx|gtx|tesla/.test(lower)) {
    return false;
  }
  if (/radeon\(tm\) graphics|vega|amd graphics/.test(lower)) {
    return true;
  }
  if (/radeon rx|rx [0-9]{3,4}|rx[0-9]{3,4}/.test(lower)) {
    return false;
  }
  if (/intel|uhd|iris|hd graphics|xe graphics/.test(lower)) {
    return true;
  }
  return true;
}

function patchWebGpuRequestAdapter(): void {
  const nav = globalThis.navigator as any;
  const gpu = nav?.gpu;
  if (webGpuRequestAdapterPatched || !gpu?.requestAdapter) {
    return;
  }

  const originalRequestAdapter = gpu.requestAdapter.bind(gpu) as (options?: unknown) => Promise<any>;
  gpu.requestAdapter = async (options?: Record<string, unknown>) => {
    const nextOptions = {
      ...(typeof options === 'object' && options ? options : {}),
      powerPreference: 'high-performance',
    };
    try {
      return await originalRequestAdapter(nextOptions);
    } catch {
      return originalRequestAdapter(options);
    }
  };
  webGpuRequestAdapterPatched = true;
}

function patchWebGlContextPreference(): void {
  if (webglContextPatched || typeof OffscreenCanvas === 'undefined') {
    return;
  }

  const offscreenProto = OffscreenCanvas.prototype as any;
  const originalGetContext = offscreenProto.getContext as (
    this: OffscreenCanvas,
    contextId: string,
    options?: any
  ) => OffscreenRenderingContext | null;

  offscreenProto.getContext = function patchedGetContext(this: OffscreenCanvas, contextId: string, options?: any) {
    if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
      const nextOptions = {
        ...(typeof options === 'object' && options ? options : {}),
        alpha: false,
        antialias: false,
        depth: false,
        desynchronized: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        stencil: false,
      } as WebGLContextAttributes;
      return originalGetContext.call(this, contextId, nextOptions);
    }
    return originalGetContext.call(this, contextId, options);
  };

  webglContextPatched = true;
}

function configureWebGlFlags(isIntegratedGpu: boolean): void {
  try {
    env().set('WEBGL_VERSION', preferredWebglVersion);
  } catch {
    // no-op
  }
  try {
    env().set('WEBGL_CPU_FORWARD', false);
  } catch {
    // no-op
  }
  try {
    env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
  } catch {
    // no-op
  }
  try {
    env().set('WEBGL_FLUSH_THRESHOLD', 1);
  } catch {
    // no-op
  }
  try {
    env().set('WEBGL_FORCE_F16_TEXTURES', isIntegratedGpu);
  } catch {
    // no-op
  }
}

function probeWebGl(): { renderer: string | null; integrated: boolean; version: 1 | 2 } {
  try {
    const probe = new OffscreenCanvas(1, 1);
    const gl2 = probe.getContext('webgl2', { powerPreference: 'high-performance' }) as WebGL2RenderingContext | null;
    const gl =
      gl2
      || (probe.getContext('webgl', { powerPreference: 'high-performance' }) as WebGLRenderingContext | null);
    if (!gl) {
      return {
        renderer: null,
        integrated: true,
        version: 1,
      };
    }

    const version = gl2 ? 2 : 1;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as
      | { UNMASKED_RENDERER_WEBGL: number }
      | null;
    if (debugInfo) {
      const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.trim()) {
        const renderer = unmasked.trim();
        return {
          renderer,
          integrated: isLikelyIntegratedRenderer(renderer),
          version,
        };
      }
    }

    const renderer = gl.getParameter(gl.RENDERER);
    if (typeof renderer === 'string' && renderer.trim()) {
      const normalizedRenderer = renderer.trim();
      return {
        renderer: normalizedRenderer,
        integrated: isLikelyIntegratedRenderer(normalizedRenderer),
        version,
      };
    }
  } catch {
    // no-op
  }

  return {
    renderer: null,
    integrated: true,
    version: 1,
  };
}

function buildAxisLayout(length: number, tileSize: number, minOverlap: number): AxisLayout {
  if (length <= tileSize) {
    return {
      locations: [0],
      padStart: [0],
      padEnd: [0],
    };
  }

  const minStep = Math.max(1, tileSize - minOverlap);
  const count = Math.max(2, Math.ceil((length - tileSize) / minStep) + 1);
  const locations = new Array<number>(count);
  const padStart = new Array<number>(count).fill(0);
  const padEnd = new Array<number>(count).fill(0);

  const totalOverlap = tileSize * count - length;
  const baseOverlap = Math.floor(totalOverlap / (count - 1));
  const extraOverlap = totalOverlap - baseOverlap * (count - 1);

  locations[0] = 0;
  for (let index = 1; index < count; index += 1) {
    locations[index] = locations[index - 1]! + tileSize - baseOverlap - (index <= extraOverlap ? 1 : 0);
  }

  for (let index = 1; index < count; index += 1) {
    padStart[index] = Math.floor((locations[index - 1]! + tileSize - locations[index]!) / 2);
  }

  for (let index = 0; index < count - 1; index += 1) {
    padEnd[index] = locations[index]! + tileSize - locations[index + 1]! - padStart[index + 1]!;
  }

  return {
    locations,
    padStart,
    padEnd,
  };
}

async function probeWebGpu(): Promise<{ renderer: string | null; integrated: boolean }> {
  const nav = globalThis.navigator as any;
  if (!nav?.gpu?.requestAdapter) {
    return { renderer: null, integrated: true };
  }

  try {
    const adapter =
      await nav.gpu.requestAdapter({ powerPreference: 'high-performance' })
      || await nav.gpu.requestAdapter();
    if (!adapter) {
      return { renderer: null, integrated: true };
    }

    const adapterInfo =
      'info' in adapter
        ? adapter.info
        : 'requestAdapterInfo' in adapter
          ? await adapter.requestAdapterInfo()
          : undefined;

    const renderer =
      typeof adapterInfo?.description === 'string' && adapterInfo.description.trim()
        ? adapterInfo.description.trim()
        : typeof adapterInfo?.vendor === 'string' && adapterInfo.vendor.trim()
          ? adapterInfo.vendor.trim()
          : null;

    return {
      renderer,
      integrated: renderer ? isLikelyIntegratedRenderer(renderer) : true,
    };
  } catch {
    return { renderer: null, integrated: true };
  }
}

async function ensureBackendRegistered(backend: UpscaleBackend): Promise<void> {
  if (backendRegistry.has(backend)) {
    return;
  }
  const loader = BACKEND_LOADERS[backend];
  if (!loader) {
    throw new Error(`Backend ${backend} unavailable in this build.`);
  }
  await loader();
  backendRegistry.add(backend);
}

function selectTileSizes(
  preset: RealesrganModelPreset,
  backend: UpscaleBackend,
  input: RealesrganImage,
  isIntegratedGpu: boolean,
  forcedTileSize?: number
): number[] {
  if (forcedTileSize && preset.tileSizes.includes(forcedTileSize)) {
    return [forcedTileSize];
  }

  const megapixels = (input.width * input.height) / 1_000_000;
  let candidates = preset.tileSizes;

  if (backend === 'webgpu') {
    return preset.tileSizes;
  }

  if (backend === 'webgl') {
    if (isIntegratedGpu && megapixels >= 8) {
      candidates = preset.tileSizes.filter((size) => size <= 96);
    } else if (isIntegratedGpu && megapixels >= 5) {
      candidates = preset.tileSizes.filter((size) => size <= 128);
    } else if (megapixels >= 10) {
      candidates = preset.tileSizes.filter((size) => size <= 192);
    }
  } else if (backend === 'cpu' && megapixels >= 10) {
    candidates = preset.tileSizes.filter((size) => size <= 128);
  }

  if (candidates.length > 0) {
    return candidates;
  }

  const fallback = preset.tileSizes[preset.tileSizes.length - 1];
  return fallback ? [fallback] : [64];
}

function yieldToWorkerLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

  activeWebglRenderer = null;
  activeWebglIntegrated = false;
  activeWebgpuAdapterInfo = null;

  for (const backend of backends) {
    try {
      if (backend === 'webgpu') {
        patchWebGpuRequestAdapter();
        const probe = await probeWebGpu();
        activeWebgpuAdapterInfo = probe.renderer;
      }
      if (backend === 'webgl') {
        patchWebGlContextPreference();
        const probe = probeWebGl();
        preferredWebglVersion = probe.version;
        activeWebglRenderer = probe.renderer;
        activeWebglIntegrated = probe.integrated;
        configureWebGlFlags(probe.integrated);
      }
      await ensureBackendRegistered(backend);
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
  yieldEveryTiles: number,
  alpha = false
): Promise<RealesrganImage> {
  const factor = preset.factor;
  const output = new RealesrganImage(input.width * factor, input.height * factor);
  const xAxis = buildAxisLayout(input.width, tileSize, preset.minOverlap);
  const yAxis = buildAxisLayout(input.height, tileSize, preset.minOverlap);
  const numX = xAxis.locations.length;
  const numY = yAxis.locations.length;

  const total = numX * numY;
  let completed = 0;

  for (let xIndex = 0; xIndex < numX; xIndex += 1) {
    for (let yIndex = 0; yIndex < numY; yIndex += 1) {
      const x1 = xAxis.locations[xIndex]!;
      const y1 = yAxis.locations[yIndex]!;
      const x2 = x1 + tileSize;
      const y2 = y1 + tileSize;

      const tile = new RealesrganImage(tileSize, tileSize);
      tile.getImageCrop(0, 0, input, x1, y1, x2, y2);
      const scaled = await upscaleWithGraphModel(tile, model, alpha);
      output.getImageCrop(
        (x1 + xAxis.padStart[xIndex]!) * factor,
        (y1 + yAxis.padStart[yIndex]!) * factor,
        scaled,
        xAxis.padStart[xIndex]! * factor,
        yAxis.padStart[yIndex]! * factor,
        scaled.width - xAxis.padEnd[xIndex]! * factor,
        scaled.height - yAxis.padEnd[yIndex]! * factor
      );

      completed += 1;
      sendProgress(
        jobId,
        backend,
        completed / total,
        alpha ? `Alpha ${completed}/${total}` : `Image ${completed}/${total}`
      );
      if (yieldEveryTiles > 0 && completed % yieldEveryTiles === 0) {
        await yieldToWorkerLoop();
      }
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
  const tileSizes = selectTileSizes(preset, backend, input, activeWebglIntegrated, data.settings?.tileSize);
  const yieldEveryTiles =
    backend === 'webgpu'
      ? 0
      : backend === 'webgl' && activeWebglIntegrated
        ? YIELD_EVERY_TILES_INTEGRATED
        : YIELD_EVERY_TILES;

  let lastError = 'unknown upscale failure';
  for (const tileSize of tileSizes) {
    try {
      const model = await loadModel(preset, tileSize, data.jobId);
      let output = await upscaleTiledImage(model, input, preset, tileSize, backend, data.jobId, yieldEveryTiles);

      if (hasAlpha) {
        const alphaInput = input.extractAlphaAsRgb();
        const alphaOutput = await upscaleTiledImage(
          model,
          alphaInput,
          preset,
          tileSize,
          backend,
          data.jobId,
          yieldEveryTiles,
          true
        );
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
    const preset = getRealesrganPreset(data.mode, data.settings);
    const backendPreference = data.settings?.preferredBackend && data.settings.preferredBackend !== 'auto'
      ? data.settings.preferredBackend
      : undefined;
    const backend = await activateBackend(backendPreference);
    const rendererSuffix =
      backend === 'webgpu' && activeWebgpuAdapterInfo
        ? ` / adapter: ${activeWebgpuAdapterInfo}`
        : backend === 'webgl' && activeWebglRenderer
          ? ` / ${activeWebglIntegrated ? 'iGPU' : 'dGPU'}: ${activeWebglRenderer}`
          : '';
    self.postMessage({
      type: 'backend',
      jobId: data.jobId,
      backend: `${preset.label} / ${backend}${rendererSuffix}`,
    });

    const result = await processWithPreset(data, preset, backend);
    self.postMessage({
      type: 'success',
      jobId: data.jobId,
      bytes: result.bytes,
      mime: result.mime,
      backend: result.backend,
      tileSize: result.tileSize,
    }, [result.bytes]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      jobId: data.jobId,
      error: error instanceof Error ? error.message : 'Real-CUGAN upscale failed',
    });
  }
});
