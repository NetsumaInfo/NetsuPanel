import type { GraphModel } from '@tensorflow/tfjs-converter';
import type { Tensor, Tensor3D } from '@tensorflow/tfjs-core';
import { browser, dispose, tidy } from './tfjsCompat';
import { RealesrganImage } from './realesrganImage';

function imgToTensor(image: RealesrganImage): Tensor {
  const imageData = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  return (browser.fromPixels(imageData) as any).div(255).toFloat().expandDims() as Tensor;
}

async function tensorToImage(tensor: Tensor): Promise<RealesrganImage> {
  const [, height, width] = tensor.shape;
  const clipped = tidy(() =>
    (tensor as any)
      .reshape([height!, width!, 3])
      .mul(255)
      .cast('int32')
      .clipByValue(0, 255)
  ) as Tensor3D;

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
    let predicted = model.predict(tensor) as any;
    if (alpha) {
      predicted = predicted.greater(0.5);
    }
    tensor.dispose();
    return predicted;
  }) as Tensor;

  const output = await tensorToImage(result);
  dispose(result);
  return output;
}
