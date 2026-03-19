import type { GraphModel } from '@tensorflow/tfjs-converter';
import type { Tensor, Tensor3D } from '@tensorflow/tfjs-core';
import {
  browser,
  cast,
  clipByValue,
  dispose,
  div,
  expandDims,
  greater,
  mul,
  reshape,
  scalar,
  tidy,
} from './tfjsCompat';
import { RealesrganImage } from './realesrganImage';

function imgToTensor(image: RealesrganImage): Tensor {
  const imageData = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const pixels = browser.fromPixels(imageData) as Tensor3D;
  const normalized = div(pixels, scalar(255));
  const floatTensor = cast(normalized, 'float32');
  return expandDims(floatTensor, 0);
}

async function tensorToImage(tensor: Tensor): Promise<RealesrganImage> {
  const [, height, width] = tensor.shape;
  const clipped = tidy(() => {
    const reshaped = reshape(tensor, [height!, width!, 3]);
    const scaled = mul(reshaped, scalar(255));
    const intTensor = cast(scaled, 'int32');
    return clipByValue(intTensor, 0, 255) as Tensor3D;
  }) as Tensor3D;

  tensor.dispose();
  const pixels = await browser.toPixels(clipped);
  clipped.dispose();
  return new RealesrganImage(width!, height!, new Uint8Array(pixels));
}

export async function upscaleWithGraphModel(
  image: RealesrganImage,
  model: GraphModel,
  alpha = false
): Promise<RealesrganImage> {
  const result = tidy(() => {
    const tensor = imgToTensor(image);
    let predicted = model.predict(tensor) as Tensor;
    if (alpha) {
      predicted = greater(predicted, scalar(0.5));
    }
    tensor.dispose();
    return predicted;
  }) as Tensor;

  const output = await tensorToImage(result);
  dispose(result);
  return output;
}
