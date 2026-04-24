import { render, waitFor } from '@testing-library/react';
import { ChapterAccordion } from '@app/components/ChapterAccordion';
import type { ChapterItem, ImageCollectionResult } from '@shared/types';

jest.mock('@app/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const emptyPreview: ImageCollectionResult = {
  items: [],
  totalCandidates: 0,
  diagnostics: [],
};

function createChapter(overrides: Partial<ChapterItem> = {}): ChapterItem {
  return {
    id: 'chapter-1',
    url: 'https://reader.example.com/chapter/1',
    canonicalUrl: 'https://reader.example.com/chapter/1',
    label: 'Chapitre 1',
    relation: 'current',
    chapterNumber: 1,
    volumeNumber: null,
    score: 100,
    previewStatus: 'idle',
    diagnostics: [],
    ...overrides,
  };
}

describe('ChapterAccordion', () => {
  it('loads the current chapter preview when it is open by default', async () => {
    const onEnsurePreview = jest.fn().mockResolvedValue(emptyPreview);

    render(
      <ChapterAccordion
        chapter={createChapter()}
        thumbnailSize={120}
        compact={false}
        onEnsurePreview={onEnsurePreview}
        onDownload={jest.fn()}
        onDownloadImage={jest.fn()}
        onOpenImage={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(onEnsurePreview).toHaveBeenCalledWith(expect.objectContaining({ canonicalUrl: 'https://reader.example.com/chapter/1' }));
    });
  });
});
