export class RealesrganImage {
  width: number;

  height: number;

  data: Uint8Array;

  constructor(width: number, height: number, data?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.data = data ? data.slice() : new Uint8Array(width * height * 4);
  }

  hasAlpha(): boolean {
    for (let index = 3; index < this.data.length; index += 4) {
      if (this.data[index] !== 255) {
        return true;
      }
    }
    return false;
  }

  extractAlphaAsRgb(): RealesrganImage {
    const next = new RealesrganImage(this.width, this.height);
    for (let index = 0; index < this.width * this.height; index += 1) {
      const offset = index * 4;
      const alpha = this.data[offset + 3] ?? 255;
      next.data[offset] = alpha;
      next.data[offset + 1] = alpha;
      next.data[offset + 2] = alpha;
      next.data[offset + 3] = 255;
    }
    return next;
  }

  applyAlpha(alphaImage: RealesrganImage): void {
    const width = Math.min(this.width, alphaImage.width);
    const height = Math.min(this.height, alphaImage.height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * this.width + x) * 4;
        const alphaOffset = (y * alphaImage.width + x) * 4;
        this.data[offset + 3] = alphaImage.data[alphaOffset] ?? 255;
      }
    }
  }

  getImageCrop(
    destX: number,
    destY: number,
    source: RealesrganImage,
    srcX1: number,
    srcY1: number,
    srcX2: number,
    srcY2: number
  ): void {
    const startX = Math.max(0, Math.floor(srcX1));
    const startY = Math.max(0, Math.floor(srcY1));
    const endX = Math.min(source.width, Math.floor(srcX2));
    const endY = Math.min(source.height, Math.floor(srcY2));

    for (let y = startY; y < endY; y += 1) {
      const targetY = destY + (y - startY);
      if (targetY < 0 || targetY >= this.height) {
        continue;
      }

      for (let x = startX; x < endX; x += 1) {
        const targetX = destX + (x - startX);
        if (targetX < 0 || targetX >= this.width) {
          continue;
        }

        const sourceOffset = (y * source.width + x) * 4;
        const targetOffset = (targetY * this.width + targetX) * 4;
        this.data[targetOffset] = source.data[sourceOffset] ?? 0;
        this.data[targetOffset + 1] = source.data[sourceOffset + 1] ?? 0;
        this.data[targetOffset + 2] = source.data[sourceOffset + 2] ?? 0;
        this.data[targetOffset + 3] = source.data[sourceOffset + 3] ?? 0;
      }
    }
  }
}
