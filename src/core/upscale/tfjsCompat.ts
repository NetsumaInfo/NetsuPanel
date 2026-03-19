import {
  browser,
  cast,
  clipByValue,
  concat,
  dispose,
  div,
  expandDims,
  getBackend,
  greater,
  image as imageOps,
  mul,
  mirrorPad,
  ready,
  reshape,
  scalar,
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
  cast,
  clipByValue,
  concat,
  dispose,
  div,
  expandDims,
  getBackend,
  greater,
  loadGraphModel,
  mul,
  mirrorPad,
  ready,
  reshape,
  scalar,
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
