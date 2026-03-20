import {
  add,
  browser,
  cast,
  clipByValue,
  clone,
  concat,
  dispose,
  div,
  env,
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
  slice,
  squeeze,
  sub,
  tensor,
  tensor3d,
  transpose,
  tidy,
} from '@tensorflow/tfjs-core';
import { loadGraphModel } from '@tensorflow/tfjs-converter';
import { input, layers as tfLayers, model, sequential } from '@tensorflow/tfjs-layers';

// Worker-safe TensorFlow surface for the local Real-CUGAN runtime.
export {
  add,
  browser,
  cast,
  clipByValue,
  clone,
  concat,
  dispose,
  div,
  env,
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
  slice,
  squeeze,
  sub,
  tensor,
  tensor3d,
  transpose,
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
