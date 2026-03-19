import {
  browser,
  concat,
  dispose,
  getBackend,
  image as imageOps,
  mirrorPad,
  ready,
  setBackend,
  tensor,
  tensor3d,
  tidy,
} from '@tensorflow/tfjs-core';
import { loadGraphModel } from '@tensorflow/tfjs-converter';
import { input, layers as tfLayers, model, sequential } from '@tensorflow/tfjs-layers';

// Worker-safe TensorFlow surface for the local Real-CUGAN runtime.
export {
  browser,
  concat,
  dispose,
  getBackend,
  loadGraphModel,
  mirrorPad,
  ready,
  setBackend,
  tensor,
  tensor3d,
  tidy,
  model,
  sequential,
};

export const image = {
  resizeNearestNeighbor: imageOps.resizeNearestNeighbor,
};

export const layers = {
  ...tfLayers,
  input,
};
