import JSZip from 'jszip';
import { buildZipBlob } from '@core/download/zipBuilder';

describe('buildZipBlob', () => {
  it('creates a valid zip archive with deterministic entries', async () => {
    const blob = await buildZipBlob(
      [
        { path: 'chapter-1/001.txt', bytes: new TextEncoder().encode('page-1').buffer },
        { path: 'chapter-1/002.txt', bytes: new TextEncoder().encode('page-2').buffer },
      ],
      'application/zip'
    );

    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toEqual(['chapter-1/', 'chapter-1/001.txt', 'chapter-1/002.txt']);
    expect(await zip.file('chapter-1/001.txt')?.async('string')).toBe('page-1');
  });
});
