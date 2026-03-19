/**
 * Tests critiques : fileNaming
 * - nommage stable des pages
 * - nommage des archives de chapitre
 * - nommage global
 */
import {
  buildChapterArchiveName,
  buildChapterFolderName,
  buildGlobalArchiveName,
  buildPageEntryName,
} from '@core/download/fileNaming';

describe('buildPageEntryName', () => {
  it('pads page number with leading zeros based on total count', () => {
    expect(buildPageEntryName(0, 100, 'jpg')).toMatch(/^00[01]\.jpg$/);
    expect(buildPageEntryName(9, 100, 'jpg')).toMatch(/^010\.jpg$/);
  });

  it('handles single-digit total pages', () => {
    expect(buildPageEntryName(0, 5, 'png')).toBe('1.png');
  });

  it('handles 2-digit total pages', () => {
    expect(buildPageEntryName(0, 20, 'jpg')).toBe('01.jpg');
    expect(buildPageEntryName(19, 20, 'jpg')).toBe('20.jpg');
  });
});

describe('buildChapterArchiveName', () => {
  it('produces a slug with series and chapter label', () => {
    const name = buildChapterArchiveName('My Super Manga', 'Chapter 12', 'cbz');
    expect(name).toContain('cbz');
    expect(name.toLowerCase()).toContain('manga');
    expect(name.toLowerCase()).toMatch(/ch(apter)?[-_]?12|12/);
  });

  it('sanitizes special characters from the title', () => {
    const name = buildChapterArchiveName('Manga: Very Long / Title?', 'Ch. 3', 'zip');
    expect(name).not.toMatch(/[/\\:?*"<>|]/);
  });
});

describe('buildGlobalArchiveName', () => {
  it('includes the series title and format extension', () => {
    const name = buildGlobalArchiveName('One Piece', 'zip');
    expect(name.toLowerCase()).toContain('piece');
    expect(name).toMatch(/\.zip$/i);
  });

  it('sanitizes title with special chars', () => {
    const name = buildGlobalArchiveName('Re:Zero — Starting Life in Another World', 'zip');
    expect(name).not.toMatch(/[/\\:?*"<>|]/);
  });
});

describe('buildChapterFolderName', () => {
  it('returns a filesystem-safe folder name', () => {
    const folder = buildChapterFolderName('Chapter 5 — Part 2');
    expect(folder).not.toMatch(/[/\\:?*"<>|]/);
    expect(folder.length).toBeGreaterThan(0);
  });
});
