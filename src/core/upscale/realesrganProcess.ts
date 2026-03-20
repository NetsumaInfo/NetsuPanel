import type { GraphModel } from '@tensorflow/tfjs-converter';
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
  const factor = resolveScaleFactor(model);
  const output = new RealesrganImage(input.width * factor, input.height * factor);

  for (let y = 0; y < output.height; y += 1) {
    const sourceY = Math.min(input.height - 1, Math.floor(y / factor));
    for (let x = 0; x < output.width; x += 1) {
      const sourceX = Math.min(input.width - 1, Math.floor(x / factor));
      const sourceOffset = (sourceY * input.width + sourceX) * 4;
      const targetOffset = (y * output.width + x) * 4;
      output.data[targetOffset] = input.data[sourceOffset] ?? 0;
      output.data[targetOffset + 1] = input.data[sourceOffset + 1] ?? 0;
      output.data[targetOffset + 2] = input.data[sourceOffset + 2] ?? 0;
      output.data[targetOffset + 3] = input.data[sourceOffset + 3] ?? 255;
    }
  }

  return output;
}
