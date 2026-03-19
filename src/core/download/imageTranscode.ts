import type { ArchiveImageMime } from './archiveFormats';

async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Impossible de décoder l’image pour conversion.'));
      element.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderImageBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  mime: ArchiveImageMime,
  quality?: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Impossible d’initialiser le canvas de conversion.');
    }

    context.drawImage(source, 0, 0, width, height);
    return canvas.convertToBlob({ type: mime, quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Impossible d’initialiser le canvas de conversion.');
  }

  context.drawImage(source, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('La conversion image a échoué.'));
          return;
        }
        resolve(blob);
      },
      mime,
      quality
    );
  });
}

export async function transcodeImageBytes(
  bytes: ArrayBuffer,
  sourceMime: string,
  targetMime: ArchiveImageMime,
  quality?: number
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  if (sourceMime === targetMime) {
    return { bytes, mime: sourceMime };
  }

  const sourceBlob = new Blob([bytes], { type: sourceMime || 'application/octet-stream' });
  const image = await loadImageElement(sourceBlob);
  const transcodedBlob = await renderImageBlob(image, image.naturalWidth, image.naturalHeight, targetMime, quality);

  return {
    bytes: await transcodedBlob.arrayBuffer(),
    mime: transcodedBlob.type || targetMime,
  };
}
