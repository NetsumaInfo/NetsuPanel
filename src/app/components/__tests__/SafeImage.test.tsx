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

  test('prefers source-tab capture for protected Next.js image URLs', async () => {
    (captureImage as jest.Mock).mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
      mime: 'image/jpeg',
    });

    render(
      <SafeImage
        src="https://astral-manga.fr/_next/image?url=https%3A%2F%2Fs3.example.com%2Fcover.jpg&w=3840&q=75"
        alt="Cover"
        captureTabId={12}
        captureCandidateId="image-4"
      />
    );

    await waitFor(() => {
      expect(captureImage).toHaveBeenCalledWith(12, 'image-4');
    });

    await waitFor(() => {
      expect(screen.getByAltText('Cover')).toHaveAttribute('src', 'blob:captured-cover');
    });

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
