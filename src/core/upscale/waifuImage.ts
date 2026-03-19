import type { Tensor3D } from '@tensorflow/tfjs-core';
import { concat, dispose, tensor3d, tidy } from './tfjsCompat';

type ColorMode = 'RGB' | 'YCbCr';

function imageBitmapToTensor(image: ImageBitmap): Tensor3D {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('OffscreenCanvas 2D context unavailable');
  }

  context.drawImage(image, 0, 0, image.width, image.height);
  const rgba = context.getImageData(0, 0, image.width, image.height).data;
  const rgb = new Float32Array(image.width * image.height * 3);

  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    rgb[target] = rgba[source] / 255;
    rgb[target + 1] = rgba[source + 1] / 255;
    rgb[target + 2] = rgba[source + 2] / 255;
  }

  return tensor3d(rgb, [image.height, image.width, 3], 'float32');
}

async function tensorToImageBitmap(imageTensor: Tensor3D): Promise<ImageBitmap> {
  const clipped = tidy(() => imageTensor.clipByValue(0, 1).mul(255).asType('int32')) as Tensor3D;
  const [height, width] = clipped.shape;
  const rgb = await clipped.data();
  clipped.dispose();

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    rgba[target] = rgb[source];
    rgba[target + 1] = rgb[source + 1];
    rgba[target + 2] = rgb[source + 2];
    rgba[target + 3] = 255;
  }

  return createImageBitmap(new ImageData(rgba, width, height));
}

export class WaifuImage {
  private currentMode: ColorMode = 'RGB';

  private imageTensor: Tensor3D = tensor3d([[[0]]], [1, 1, 1], 'float32');

  public readonly initialized = true;

  constructor(image: ImageBitmap, mode: ColorMode = 'RGB') {
    this.imageTensor.dispose();
    this.imageTensor = imageBitmapToTensor(image);
    this.mode = mode;
  }

  async waitForReader(): Promise<void> {
    return Promise.resolve();
  }

  get mode(): ColorMode {
    return this.currentMode;
  }

  set mode(mode: ColorMode) {
    if (this.currentMode === mode) {
      return;
    }

    const nextTensor =
      this.currentMode === 'RGB' && mode === 'YCbCr'
        ? WaifuImage.rgbToYcbcr(this.imageTensor)
        : this.currentMode === 'YCbCr' && mode === 'RGB'
          ? WaifuImage.ycbcrToRgb(this.imageTensor)
          : null;

    if (!nextTensor) {
      return;
    }

    this.imageTensor.dispose();
    this.imageTensor = nextTensor;
    this.currentMode = mode;
  }

  get tensor() {
    return this.imageTensor.clone() as Tensor3D;
  }

  set tensor(nextTensor: Tensor3D) {
    this.imageTensor.dispose();
    this.imageTensor = nextTensor;
  }

  get image(): Promise<ImageBitmap> {
    const exportTensor = tidy(() => {
      const tensor = this.currentMode === 'YCbCr'
        ? WaifuImage.ycbcrToRgb(this.imageTensor)
        : (this.imageTensor.clone() as Tensor3D);
      return tensor as Tensor3D;
    }) as Tensor3D;

    return tensorToImageBitmap(exportTensor);
  }

  static rgbToYcbcr(imageTensor: Tensor3D): Tensor3D {
    return tidy(() => {
      const r = imageTensor.slice([0, 0, 0], [imageTensor.shape[0], imageTensor.shape[1], 1]);
      const g = imageTensor.slice([0, 0, 1], [imageTensor.shape[0], imageTensor.shape[1], 1]);
      const b = imageTensor.slice([0, 0, 2], [imageTensor.shape[0], imageTensor.shape[1], 1]);
      const delta = 0.5;
      const y = r.mul(0.299).add(g.mul(0.587)).add(b.mul(0.114));
      const cb = b.sub(y).mul(0.564).add(delta);
      const cr = r.sub(y).mul(0.713).add(delta);
      return concat([y, cb, cr], -1) as Tensor3D;
    }) as Tensor3D;
  }

  static ycbcrToRgb(imageTensor: Tensor3D): Tensor3D {
    return tidy(() => {
      const y = imageTensor.slice([0, 0, 0], [imageTensor.shape[0], imageTensor.shape[1], 1]);
      const cb = imageTensor.slice([0, 0, 1], [imageTensor.shape[0], imageTensor.shape[1], 1]);
      const cr = imageTensor.slice([0, 0, 2], [imageTensor.shape[0], imageTensor.shape[1], 1]);
      const delta = 0.5;
      const cbShifted = cb.sub(delta);
      const crShifted = cr.sub(delta);
      const r = y.add(crShifted.mul(1.403));
      const g = y.sub(crShifted.mul(0.714)).sub(cbShifted.mul(0.344));
      const b = y.add(cbShifted.mul(1.773));
      return concat([r, g, b], -1) as Tensor3D;
    }) as Tensor3D;
  }

  destroy(): void {
    dispose(this.imageTensor);
  }
}
