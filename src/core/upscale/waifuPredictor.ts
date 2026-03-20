import '@tensorflow/tfjs-backend-webgl';
import type { Tensor3D, Tensor4D } from '@tensorflow/tfjs-core';
import {
  clipByValue,
  clone,
  concat,
  expandDims,
  getBackend,
  image,
  layers,
  mirrorPad,
  model,
  slice,
  squeeze,
  tensor,
  tidy,
  transpose,
} from './tfjsCompat';
import { WaifuImage } from './waifuImage';

interface ParamsObject {
  nInputPlane: number;
  nOutputPlane: number;
  kH: number;
  kW: number;
  weight: number[];
  bias: number[];
}

if (self.OffscreenCanvas !== undefined) {
  const canvas = new OffscreenCanvas(320, 200);
  canvas.getContext('webgl2') || canvas.getContext('webgl');
}

function predictionBatchSize(channelCount: number): number {
  const backend = getBackend();
  if (backend === 'webgl') {
    return channelCount === 1 ? 12 : 8;
  }
  return channelCount === 1 ? 6 : 4;
}

export class WaifuPredictor {
  private initialized = false;

  private modelFetchProgress = 0;

  private modelFetchCallback = (_ratio: number) => {};

  private modelPredictProgress = 0;

  private modelPredictCallback = (_ratio: number) => {};

  private params: ParamsObject[] = [];

  private modelInstance: ReturnType<typeof model> | null = null;

  private blockSize = 0;

  private blockSizeEx = 0;

  private readonly modelFetchPromise: Promise<void>;

  constructor(modelUrl: string, blockSize = 32) {
    this.blockSize = this.blockSizeEx = blockSize;
    this.modelFetchPromise = fetch(modelUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load waifu2x model: ${response.status}`);
        }
        this.modelFetchProgress = 0.2;
        this.modelFetchCallback(this.modelFetchProgress);
        this.params = await response.json();
        this.modelFetchProgress = 1;
        this.modelFetchCallback(this.modelFetchProgress);
      });
  }

  listenToModelDownloadProgress(callback: (ratio: number) => void): void {
    this.modelFetchCallback = callback;
  }

  listenToModelPredictProgress(callback: (ratio: number) => void): void {
    this.modelPredictCallback = callback;
  }

  private loadModel(): void {
    this.blockSizeEx = this.blockSize + (this.params.length + 1) * 2;
    const inputLayer = layers.input({
      shape: [this.blockSizeEx, this.blockSizeEx, this.params[0]!.nInputPlane],
      dtype: 'float32',
    });

    let outputLayer: any = inputLayer;
    for (let index = 0; index < this.params.length; index += 1) {
      const param = this.params[index]!;
      const layer = layers.conv2d({
        filters: param.nOutputPlane,
        kernelSize: [param.kH, param.kW],
        kernelInitializer: 'zeros',
        padding: 'same',
        weights: [
          transpose(tensor(param.weight), [2, 3, 1, 0]),
          tensor(param.bias),
        ],
        useBias: true,
      });
      layer.trainable = false;
      outputLayer = layer.apply(outputLayer);
      if (index + 1 !== this.params.length) {
        outputLayer = layers.leakyReLU({ alpha: 0.1 }).apply(outputLayer);
      }
    }

    this.modelInstance = model({ inputs: inputLayer, outputs: outputLayer });
    this.initialized = true;
  }

  async predict(source: ImageBitmap, isNoise: boolean): Promise<ImageBitmap> {
    if (this.modelFetchProgress < 0.999999) {
      await this.modelFetchPromise;
    }

    this.modelPredictProgress = 0;
    this.modelPredictCallback(this.modelPredictProgress);

    if (!this.initialized) {
      this.loadModel();
    }
    if (!this.modelInstance) {
      throw new Error('Waifu2x model instance unavailable.');
    }

    const imageWrapper = new WaifuImage(source);
    const inputChannel = this.params[0]!.nInputPlane;
    let workTensor: Tensor4D;

    if (inputChannel === 1) {
      imageWrapper.mode = 'YCbCr';
      const nextTensor = imageWrapper.tensor;
      const luminanceTensor = slice(nextTensor,
        [0, 0, 0],
        [nextTensor.shape[0]!, nextTensor.shape[1]!, 1]
      ) as Tensor3D;
      workTensor = expandDims(luminanceTensor, 0) as Tensor4D;
      luminanceTensor.dispose();
      nextTensor.dispose();
    } else {
      const nextTensor = imageWrapper.tensor;
      workTensor = expandDims(nextTensor, 0) as Tensor4D;
      nextTensor.dispose();
    }

    if (!isNoise) {
      workTensor = image.resizeNearestNeighbor(
        workTensor,
        [workTensor.shape[1]!, workTensor.shape[2]!].map((value) => value * 2) as [number, number]
      ) as Tensor4D;
    }

    const exValue = this.params.length + 1;
    const height = workTensor.shape[1]!;
    const width = workTensor.shape[2]!;
    const hNBlock = Math.ceil(height / this.blockSize);
    const wNBlock = Math.ceil(width / this.blockSize);
    const stepProgress = 1 / (hNBlock * wNBlock);
    const padH = this.blockSize -
      (height % this.blockSize === 0 ? this.blockSize : height % this.blockSize) +
      exValue;
    const padW = this.blockSize -
      (width % this.blockSize === 0 ? this.blockSize : width % this.blockSize) +
      exValue;

    const tensorBeforePad = workTensor;
    workTensor = mirrorPad(
      workTensor,
      [
        [0, 0],
        [exValue, padH],
        [exValue, padW],
        [0, 0],
      ],
      'reflect'
    ) as Tensor4D;
    tensorBeforePad.dispose();

    const batchedTiles = predictionBatchSize(inputChannel);
    const rowTileGroups = Array.from({ length: hNBlock }, () => [] as Tensor4D[]);
    const tileQueue: Array<{ rowIndex: number; tensor: Tensor4D }> = [];

    for (let rowIndex = 0; rowIndex < hNBlock; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < wNBlock; columnIndex += 1) {
        tileQueue.push({
          rowIndex,
          tensor: slice(
            workTensor,
            [0, rowIndex * this.blockSize, columnIndex * this.blockSize, 0],
            [1, this.blockSizeEx, this.blockSizeEx, workTensor.shape[3]!]
          ) as Tensor4D,
        });
      }
    }

    workTensor.dispose();

    for (let offset = 0; offset < tileQueue.length; offset += batchedTiles) {
      const batchItems = tileQueue.slice(offset, offset + batchedTiles);
      const batchTensor = concat(batchItems.map((item) => item.tensor), 0) as Tensor4D;
      batchItems.forEach((item) => item.tensor.dispose());

      const batchPrediction = this.modelInstance.predict(batchTensor) as Tensor4D;
      batchTensor.dispose();

      batchItems.forEach((item, localIndex) => {
        rowTileGroups[item.rowIndex]!.push(
          slice(
            batchPrediction,
            [localIndex, exValue, exValue, 0],
            [1, this.blockSize, this.blockSize, batchPrediction.shape[3]!]
          ) as Tensor4D
        );
        this.modelPredictProgress += stepProgress;
        this.modelPredictCallback(this.modelPredictProgress);
      });

      batchPrediction.dispose();
    }

    const rowTensors: Tensor4D[] = rowTileGroups.map((tiles) => {
      const rowTensor = concat(tiles, 2) as Tensor4D;
      tiles.forEach((item) => item.dispose());
      return rowTensor;
    });

    const mergedTensor = concat(rowTensors, 1) as Tensor4D;
    rowTensors.forEach((item) => item.dispose());

    const resultTensor = slice(mergedTensor, [0, 0, 0, 0], [1, height, width, mergedTensor.shape[3]!]) as Tensor4D;
    mergedTensor.dispose();

    imageWrapper.tensor = tidy(() => {
      let nextTensor: Tensor3D = imageWrapper.tensor;
      const yTensor = squeeze(clipByValue(resultTensor, 0, 1), [0]) as Tensor3D;

      if (imageWrapper.mode === 'YCbCr') {
        if (!isNoise) {
          nextTensor = image.resizeNearestNeighbor(
            nextTensor,
            [nextTensor.shape[0]!, nextTensor.shape[1]!].map((value) => value * 2) as [number, number]
          ) as Tensor3D;
        }
        const cb = slice(nextTensor, [0, 0, 1], [nextTensor.shape[0]!, nextTensor.shape[1]!, 1]);
        const cr = slice(nextTensor, [0, 0, 2], [nextTensor.shape[0]!, nextTensor.shape[1]!, 1]);
        nextTensor = concat([yTensor, cb, cr], -1) as Tensor3D;
      } else {
        nextTensor = yTensor;
      }

      return clone(nextTensor) as Tensor3D;
    }) as Tensor3D;

    resultTensor.dispose();
    const resultBitmap = await imageWrapper.image;
    imageWrapper.destroy();
    this.modelPredictProgress = 1;
    this.modelPredictCallback(this.modelPredictProgress);
    return resultBitmap;
  }

  destroy(): void {
    this.initialized = false;
    this.modelFetchProgress = 0;
    this.modelPredictProgress = 0;
    this.modelInstance?.dispose();
    this.modelInstance = null;
  }
}
