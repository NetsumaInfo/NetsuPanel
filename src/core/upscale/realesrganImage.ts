export class RealesrganImage {
  constructor(
    public width: number,
    public height: number,
    public data = new Uint8Array(width * height * 4)
  ) {}

  getImageCrop(
    x: number,
    y: number,
    image: RealesrganImage,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    const width = x2 - x1;
    for (let row = 0; row < y2 - y1; row += 1) {
      const destIndex = (y + row) * this.width * 4 + x * 4;
      const srcIndex = (y1 + row) * image.width * 4 + x1 * 4;
      this.data.set(image.data.subarray(srcIndex, srcIndex + width * 4), destIndex);
    }
  }

  padToTileSize(tileSize: number): void {
    let nextWidth = this.width;
    let nextHeight = this.height;

    if (this.width < tileSize) nextWidth = tileSize;
    if (this.height < tileSize) nextHeight = tileSize;
    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }

    const nextData = new Uint8Array(nextWidth * nextHeight * 4);
    for (let y = 0; y < this.height; y += 1) {
      const srcStart = y * this.width * 4;
      const destStart = y * nextWidth * 4;
      nextData.set(this.data.subarray(srcStart, srcStart + this.width * 4), destStart);
    }

    if (nextWidth > this.width) {
      const rightColumnIndex = (this.width - 1) * 4;
      for (let y = 0; y < this.height; y += 1) {
        const destRowStart = y * nextWidth * 4;
        const srcPixelIndex = y * this.width * 4 + rightColumnIndex;
        const padPixel = this.data.subarray(srcPixelIndex, srcPixelIndex + 4);
        for (let x = this.width; x < nextWidth; x += 1) {
          nextData.set(padPixel, destRowStart + x * 4);
        }
      }
    }

    if (nextHeight > this.height) {
      const bottomRowStart = (this.height - 1) * nextWidth * 4;
      const bottomRow = nextData.subarray(bottomRowStart, bottomRowStart + nextWidth * 4);
      for (let y = this.height; y < nextHeight; y += 1) {
        nextData.set(bottomRow, y * nextWidth * 4);
      }
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.data = nextData;
  }

  cropToOriginalSize(width: number, height: number): void {
    const nextData = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const srcStart = y * this.width * 4;
      const destStart = y * width * 4;
      nextData.set(this.data.subarray(srcStart, srcStart + width * 4), destStart);
    }
    this.width = width;
    this.height = height;
    this.data = nextData;
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
    const alphaRgb = new Uint8Array(this.width * this.height * 4);
    for (let source = 0; source < this.data.length; source += 4) {
      const alpha = this.data[source + 3]!;
      alphaRgb[source] = alpha;
      alphaRgb[source + 1] = alpha;
      alphaRgb[source + 2] = alpha;
      alphaRgb[source + 3] = 255;
    }
    return new RealesrganImage(this.width, this.height, alphaRgb);
  }

  applyAlpha(alphaImage: RealesrganImage): void {
    for (let index = 0; index < alphaImage.data.length; index += 4) {
      this.data[index + 3] = alphaImage.data[index]!;
    }
  }
}
