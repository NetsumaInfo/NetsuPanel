import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImageCandidate, UpscalePreviewState } from '@shared/types';
import { ImageViewerModal } from '@app/components/ImageViewerModal';

jest.mock('@app/components/SafeImage', () => ({
  SafeImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const baseItem: ImageCandidate = {
  id: 'img-1',
  url: 'https://example.com/original.jpg',
  previewUrl: 'https://example.com/original-preview.jpg',
  canonicalUrl: 'https://example.com/original.jpg',
  querylessUrl: 'https://example.com/original.jpg',
  captureStrategy: 'network',
  sourceKind: 'img',
  origin: 'static-html',
  width: 1200,
  height: 1800,
  area: 2160000,
  domIndex: 0,
  top: 0,
  left: 0,
  altText: '',
  titleText: '',
  containerSignature: 'sig',
  familyKey: 'family',
  visible: true,
  filenameHint: 'page-001.jpg',
  extensionHint: 'jpg',
  pageNumber: 1,
  score: 1,
  diagnostics: [],
};

const preview: UpscalePreviewState = {
  sourceImageId: baseItem.id,
  originalUrl: baseItem.previewUrl,
  loading: false,
  upscaledUrl: 'https://example.com/upscaled.png',
};

describe('ImageViewerModal', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          width: 400,
          height: 600,
          top: 0,
          right: 400,
          bottom: 600,
          left: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: originalRect,
    });
  });

  it('keeps labels on the image and does not move the split handle on hover alone', async () => {
    const user = userEvent.setup();

    render(
      <ImageViewerModal
        title="Chapitre 1"
        items={[baseItem]}
        index={0}
        preview={preview}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
        onRequestCompare={jest.fn()}
        onDownloadImage={jest.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Activer la comparaison' }));

    expect(screen.getByText('Avant')).toBeInTheDocument();
    expect(screen.getByText('Après')).toBeInTheDocument();

    const handle = screen.getByRole('button', { name: 'Déplacer le comparateur' });
    expect(handle).toHaveStyle({ left: '50%' });

    fireEvent.pointerMove(window, { clientX: 320 });
    expect(handle).toHaveStyle({ left: '50%' });
  });
});
