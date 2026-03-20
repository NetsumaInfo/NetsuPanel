import { useCallback } from 'react';
import type { Dispatch, MutableRefObject } from 'react';
import type { AppMode, ChapterItem, ImageCandidate, ImageCollectionResult } from '@shared/types';
import {
  downloadAllChapters,
  downloadGeneralSelection,
  downloadSingleChapter,
  downloadSingleImage,
} from '@app/services/downloadService';
import type { AppAction, NetsuAppState } from '@app/state/appState';
import { Waifu2xRuntime } from '@core/upscale/waifu2xRuntime';

interface UseDownloadActionsOptions {
  state: NetsuAppState;
  dispatch: Dispatch<AppAction>;
  selectedGeneralImages: ImageCandidate[];
  ensureChapterPreview(chapter: ChapterItem): Promise<ImageCollectionResult>;
  waifuRuntimeRef: MutableRefObject<Waifu2xRuntime>;
  updateActivity(message: string, progress: number, error?: string): void;
}

export function useDownloadActions({
  state,
  dispatch,
  selectedGeneralImages,
  ensureChapterPreview,
  waifuRuntimeRef,
  updateActivity,
}: UseDownloadActionsOptions) {
  const resolveSettingsForMode = useCallback(
    (mode: AppMode) => state.upscaleSettings[mode],
    [state.upscaleSettings]
  );

  const handleDownloadGeneral = useCallback(async () => {
    if (!state.scan || !state.source || selectedGeneralImages.length === 0) return;

    try {
      updateActivity('Préparation de l’archive…', 0);
      await downloadGeneralSelection(state.source.title, selectedGeneralImages, state.archiveFormat, {
        tabId: state.source.id,
        waifuRuntime: waifuRuntimeRef.current,
        onProgress: (message, progress) => updateActivity(message, progress),
        upscaleEnabled: state.upscaleEnabled,
        mode: 'general',
        settings: resolveSettingsForMode('general'),
        sourceReferrer: state.source.url,
      });
      dispatch({
        type: 'set-activity',
        activity: {
          active: false,
          cancelled: false,
          progress: 1,
          message: 'Archive prête.',
        },
      });
    } catch (error) {
      updateActivity('Export impossible', 0, error instanceof Error ? error.message : 'Export général impossible');
    }
  }, [
    dispatch,
    selectedGeneralImages,
    state.archiveFormat,
    state.scan,
    state.source,
    state.upscaleEnabled,
    updateActivity,
    waifuRuntimeRef,
    resolveSettingsForMode,
  ]);

  const handleDownloadChapter = useCallback(
    async (chapter: ChapterItem) => {
      if (!state.source) return;

      try {
        const preview = await ensureChapterPreview(chapter);
        updateActivity(`Préparation de ${chapter.label}`, 0);
        await downloadSingleChapter(state.source.title, chapter, preview.items, state.archiveFormat, {
          tabId: state.source.id,
          waifuRuntime: waifuRuntimeRef.current,
          onProgress: (message, progress) => updateActivity(message, progress),
          upscaleEnabled: state.upscaleEnabled,
          mode: 'manga',
          settings: resolveSettingsForMode('manga'),
        });
        dispatch({
          type: 'set-activity',
          activity: {
            active: false,
            cancelled: false,
            progress: 1,
            message: `${chapter.label} exporté.`,
          },
        });
      } catch (error) {
        updateActivity('Export du chapitre impossible', 0, error instanceof Error ? error.message : 'Chapitre impossible à exporter');
      }
    },
    [
      dispatch,
      ensureChapterPreview,
      state.archiveFormat,
      state.source,
      state.upscaleEnabled,
      updateActivity,
      waifuRuntimeRef,
      resolveSettingsForMode,
    ]
  );

  const handleDownloadAll = useCallback(async () => {
    if (!state.source || state.chapters.length === 0) return;

    try {
      const prepared: Array<{ chapter: ChapterItem; images: ImageCandidate[] }> = [];
      for (const chapter of state.chapters) {
        const preview = await ensureChapterPreview(chapter);
        prepared.push({ chapter, images: preview.items });
      }

      updateActivity('Préparation de l’archive globale…', 0);
      await downloadAllChapters(state.source.title, prepared, state.archiveFormat, {
        tabId: state.source.id,
        waifuRuntime: waifuRuntimeRef.current,
        onProgress: (message, progress) => updateActivity(message, progress),
        upscaleEnabled: state.upscaleEnabled,
        mode: 'manga',
        settings: resolveSettingsForMode('manga'),
      });
      dispatch({
        type: 'set-activity',
        activity: {
          active: false,
          cancelled: false,
          progress: 1,
          message: 'Archive globale prête.',
        },
      });
    } catch (error) {
      updateActivity('Archive globale impossible', 0, error instanceof Error ? error.message : 'Archive globale impossible');
    }
  }, [
    dispatch,
    ensureChapterPreview,
    state.archiveFormat,
    state.chapters,
    state.source,
    state.upscaleEnabled,
    updateActivity,
    waifuRuntimeRef,
    resolveSettingsForMode,
  ]);

  const handleDownloadImage = useCallback(
    async (image: ImageCandidate, options?: { referrer?: string; fileName?: string }) => {
      if (!state.source) return;

      try {
        const label = options?.fileName || image.filenameHint;
        updateActivity(`Préparation de ${label}`, 0);
        await downloadSingleImage(
          image,
          state.archiveFormat,
          {
            tabId: state.source.id,
            waifuRuntime: waifuRuntimeRef.current,
            onProgress: (message, progress) => updateActivity(message, progress),
            upscaleEnabled: state.upscaleEnabled,
            mode: state.mode,
            settings: resolveSettingsForMode(state.mode),
            sourceReferrer: options?.referrer,
          },
          {
            referrer: options?.referrer,
            fileName: options?.fileName,
          }
        );
        dispatch({
          type: 'set-activity',
          activity: {
            active: false,
            cancelled: false,
            progress: 1,
            message: `${label} téléchargée.`,
          },
        });
      } catch (error) {
        updateActivity('Téléchargement impossible', 0, error instanceof Error ? error.message : 'Téléchargement impossible');
      }
    },
    [
      dispatch,
      state.archiveFormat,
      state.mode,
      state.source,
      state.upscaleEnabled,
      updateActivity,
      waifuRuntimeRef,
      resolveSettingsForMode,
    ]
  );

  return {
    downloadGeneral: handleDownloadGeneral,
    downloadChapter: handleDownloadChapter,
    downloadAllChapters: handleDownloadAll,
    downloadImage: handleDownloadImage,
  };
}
