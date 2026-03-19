import { getArchiveFormatPreset } from '@core/download/archiveFormats';

describe('getArchiveFormatPreset', () => {
  it('keeps cbz output for comic presets', () => {
    const preset = getArchiveFormatPreset('cbz-jpg');
    expect(preset.extension).toBe('cbz');
    expect(preset.pageMime).toBe('image/jpeg');
  });

  it('maps zip-webp to a standard zip archive with webp pages', () => {
    const preset = getArchiveFormatPreset('zip-webp');
    expect(preset.extension).toBe('zip');
    expect(preset.archiveMime).toBe('application/zip');
    expect(preset.pageMime).toBe('image/webp');
  });
});
