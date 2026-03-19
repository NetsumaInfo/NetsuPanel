import {
  concat,
  dispose,
  image as imageOps,
  mirrorPad,
  ready,
  setBackend,
  tensor,
  tensor3d,
  tidy,
} from '@tensorflow/tfjs-core';
import { input, layers as tfLayers, model, sequential } from '@tensorflow/tfjs-layers';

// Worker-safe TensorFlow surface for the local waifu runtime.
export { concat, dispose, mirrorPad, ready, setBackend, tensor, tensor3d, tidy, model, sequential };

export const image = {
  resizeNearestNeighbor: imageOps.resizeNearestNeighbor,
};

export const layers = {
  ...tfLayers,
  input,
};
