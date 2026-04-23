import { render, screen, waitFor } from '@testing-library/react';
import { SafeImage } from '@app/components/SafeImage';
import { captureImage, fetchBinary } from '@app/services/runtimeClient';

jest.mock('@app/services/runtimeClient', () => ({
  captureImage: jest.fn(),
  fetchBinary: jest.fn(),
}));

describe('SafeImage', () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn(() => 'blob:captured-cover'),
    });
  });

  afterAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('tries native loading first for Next.js image URLs in auto mode', async () => {
    render(
      <SafeImage
        src="https://astral-manga.fr/_next/image?url=https%3A%2F%2Fs3.example.com%2Fcover.jpg&w=3840&q=75"
        alt="Cover"
        captureTabId={12}
        captureCandidateId="image-4"
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText('Cover')).toHaveAttribute(
        'src',
        'https://astral-manga.fr/_next/image?url=https%3A%2F%2Fs3.example.com%2Fcover.jpg&w=3840&q=75'
      );
    });

    expect(captureImage).not.toHaveBeenCalled();
    expect(fetchBinary).not.toHaveBeenCalled();
  });

  test('keeps native loading in auto mode when the direct image URL is already usable', async () => {
    render(
      <SafeImage
        src="https://cdn.example.com/chapter-2/page-003.jpg"
        alt="Page 3"
        captureTabId={12}
        captureCandidateId="image-9"
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText('Page 3')).toHaveAttribute('src', 'https://cdn.example.com/chapter-2/page-003.jpg');
    });

    expect(captureImage).not.toHaveBeenCalled();
    expect(fetchBinary).not.toHaveBeenCalled();
  });

  test('renders inline SVG previews natively', async () => {
    const svgSrc = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22%3E%3Ccircle cx=%225%22 cy=%225%22 r=%224%22/%3E%3C/svg%3E';

    render(
      <SafeImage
        src={svgSrc}
        alt="Logo svg"
      />
    );

    await waitFor(() => {
      expect(screen.getByAltText('Logo svg')).toHaveAttribute('src', svgSrc);
    });

    expect(captureImage).not.toHaveBeenCalled();
    expect(fetchBinary).not.toHaveBeenCalled();
  });

  test('supports network-first mode for protected chapter previews', async () => {
    (fetchBinary as jest.Mock).mockResolvedValue({
      bytes: new Uint8Array([5, 6, 7, 8]).buffer,
      mime: 'image/jpeg',
      finalUrl: 'https://cdn.example.com/chapter-2/page-002.jpg',
    });

    render(
      <SafeImage
        src="https://cdn.example.com/chapter-2/page-002.jpg"
        alt="Page 2"
        referrer="https://reader.example.com/series/chapter-2"
        captureTabId={12}
        resolveMode="network-first"
      />
    );

    await waitFor(() => {
      expect(fetchBinary).toHaveBeenCalledWith('https://cdn.example.com/chapter-2/page-002.jpg', {
        referrer: 'https://reader.example.com/series/chapter-2',
        tabId: 12,
      });
    });

    await waitFor(() => {
      expect(screen.getByAltText('Page 2')).toHaveAttribute('src', 'blob:captured-cover');
    });

    expect(captureImage).not.toHaveBeenCalled();
  });
});
