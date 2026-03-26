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
});
