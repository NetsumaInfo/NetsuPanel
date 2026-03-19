import * as tfCore from '@tensorflow/tfjs-core';
import * as tfLayers from '@tensorflow/tfjs-layers';

export * from '@tensorflow/tfjs-core';
export * from '@tensorflow/tfjs-layers';

// `waifu2x-tfjs` expects the monolithic `@tensorflow/tfjs` namespace.
// We provide the subset it uses without pulling the full package, which
// drags CSP-hostile modules such as seedrandom into the worker chunk.
export const browser = tfCore.browser;
export const image = {
  resizeNearestNeighbor: tfCore.image.resizeNearestNeighbor,
};
export const layers = {
  ...tfLayers.layers,
  input: tfLayers.input,
};
export const model = tfLayers.model;
export const sequential = tfLayers.sequential;
