import type { GraphModel } from '@tensorflow/tfjs-converter';
import { browser, cast, clipByValue, div, expandDims, mul, squeeze } from './tfjsCompat';
import { RealesrganImage } from './realesrganImage';

function resolveScaleFactor(model: GraphModel): number {
  const inputShape = model.inputs?.[0]?.shape;
  const outputShape = model.outputs?.[0]?.shape;
  const inputHeight = typeof inputShape?.[1] === 'number' ? inputShape[1] : null;
  const outputHeight = typeof outputShape?.[1] === 'number' ? outputShape[1] : null;

  if (inputHeight && outputHeight && outputHeight > inputHeight) {
    const ratio = Math.round(outputHeight / inputHeight);
    if (ratio === 2 || ratio === 4) {
      return ratio;
    }
  }

  return 2;
}

export async function upscaleWithGraphModel(
  input: RealesrganImage,
  model: GraphModel,
  _alpha = false
): Promise<RealesrganImage> {
  const imageData = new ImageData(new Uint8ClampedArray(input.data), input.width, input.height);
  const pixelTensor = browser.fromPixels(imageData, 3);
  const normalized = div(cast(pixelTensor, 'float32'), 255);
  const batched = expandDims(normalized, 0);
  pixelTensor.dispose();
  normalized.dispose();

  let result;
  try {
    result = model.execute(batched);
  } catch {
    result = typeof model.executeAsync === 'function'
      ? await model.executeAsync(batched)
      : model.execute(batched);
  }
  batched.dispose();

  const outputTensor = Array.isArray(result) ? result[0] : result;
  const squeezed = squeeze(outputTensor, [0]);
  const clipped = clipByValue(squeezed, 0, 1);
  const scaled = cast(mul(clipped, 255), 'int32');

  const rgb = await scaled.data();
  const [height, width] = scaled.shape;
  outputTensor.dispose();
  squeezed.dispose();
  clipped.dispose();
  scaled.dispose();

  const rgba = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    rgba[target] = rgb[source] ?? 0;
    rgba[target + 1] = rgb[source + 1] ?? 0;
    rgba[target + 2] = rgb[source + 2] ?? 0;
    rgba[target + 3] = 255;
  }

  return new RealesrganImage(width, height, rgba);
}
