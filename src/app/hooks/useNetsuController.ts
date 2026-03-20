import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ArchiveFormat, ChapterItem, ImageCandidate, UpscalePreviewState, UpscaleSettings } from '@shared/types';
import { discoverChapters, loadChapterPreview as fetchChapterPreview } from '@core/manga/chapterCrawler';
import { serializeUpscaleSettings } from '@core/upscale/realesrganModels';
import { Waifu2xRuntime } from '@core/upscale/waifu2xRuntime';
import { appReducer, initialAppState } from '@app/state/appState';
import { useDownloadActions } from '@app/hooks/useDownloadActions';
import { captureImage, fetchBinary, fetchDocument, getSourceContext, scanSourceTab } from '@app/services/runtimeClient';
import { isSameChapterUrl, resolveBootstrapTabId } from '@app/services/sourceBootstrap';

export function useNetsuController() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const waifuRuntimeRef = useRef<Waifu2xRuntime>(new Waifu2xRuntime());
  const previewObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const tabId = await resolveBootstrapTabId();
        if (!tabId) {
          throw new Error('Impossible de déterminer l’onglet source. Ouvre une page web normale puis relance l’extension.');
        }

        dispatch({ type: 'bootstrap-start', tabId });
        dispatch({ type: 'set-loading-message', message: 'Lecture du contexte de la page…' });
        const source = await getSourceContext(tabId);
        dispatch({ type: 'set-loading-message', message: 'Analyse de la page en cours…' });
        const scan = await scanSourceTab(tabId);
        dispatch({ type: 'set-loading-message', message: 'Découverte des chapitres…' });
        const chapters = await discoverChapters(scan, { fetchDocument });
        if (!cancelled) {
          dispatch({ type: 'bootstrap-success', source, scan, chapters });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: 'bootstrap-error',
            error: error instanceof Error ? error.message : 'Initialisation impossible',
          });
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      waifuRuntimeRef.current.reset();
    };
  }, []);

  const selectedGeneralImages = useMemo(
    () => state.scan?.general.items.filter((item) => state.generalSelection[item.id]) || [],
    [state.generalSelection, state.scan]
  );

  useEffect(() => {
    const nextUrl = state.upscalePreview?.upscaledUrl;
    if (previewObjectUrlRef.current && previewObjectUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
    }
    previewObjectUrlRef.current = nextUrl ?? null;
  }, [state.upscalePreview?.upscaledUrl]);

  useEffect(
    () => () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    },
    []
  );

  const updateActivity = useCallback((message: string, progress: number, error?: string) => {
    dispatch({
      type: 'set-activity',
      activity: {
        active: !error,
        cancelled: false,
        progress,
        message,
        error,
      },
    });
  }, []);

  const ensureChapterPreview = useCallback(
    async (chapter: ChapterItem) => {
      if (!state.scan || !state.source) {
        throw new Error('Analyse source indisponible');
      }

      if (chapter.previewStatus === 'ready' && chapter.preview) {
        return chapter.preview;
      }

      dispatch({
        type: 'set-chapter-preview-status',
        chapterUrl: chapter.canonicalUrl,
        status: 'loading',
      });

      try {
        const preview =
          isSameChapterUrl(chapter.canonicalUrl, state.source.url)
            ? state.scan.manga.currentPages
            : await fetchChapterPreview(chapter.url, { fetchDocument });
        dispatch({
          type: 'set-chapter-preview',
          chapterUrl: chapter.canonicalUrl,
          preview,
        });
        return preview;
      } catch (error) {
        dispatch({
          type: 'set-chapter-preview',
          chapterUrl: chapter.canonicalUrl,
          preview: undefined,
          error: error instanceof Error ? error.message : 'Chargement de l’aperçu impossible',
        });
        throw error;
      }
    },
    [state.scan, state.source]
  );

  const previewUpscale = useCallback(
    async (candidate: ImageCandidate, referrer?: string) => {
      if (!state.source) return;
      const currentSettings = state.upscaleSettings[state.mode];
      const previewState: UpscalePreviewState = {
        sourceImageId: candidate.id,
        originalUrl: candidate.previewUrl || candidate.url,
        originalReferrer: referrer,
        loading: true,
      };
      dispatch({ type: 'set-upscale-preview', preview: previewState });

      try {
        let resource;
        if (candidate.origin === 'live-dom') {
          try {
            resource = await captureImage(state.source.id, candidate.id);
          } catch {
            resource = await fetchBinary(candidate.url, { referrer, tabId: state.source.id });
          }
        } else {
          resource = await fetchBinary(candidate.url, { referrer, tabId: state.source.id });
        }
        const blob = await waifuRuntimeRef.current.upscale({
          cacheKey: `preview-${candidate.id}-${state.mode}-${serializeUpscaleSettings(currentSettings)}`,
          bytes: resource.bytes,
          mime: resource.mime,
          mode: state.mode,
          settings: currentSettings,
          onProgress: (message) => {
            dispatch({ type: 'set-waifu-backend', label: message });
          },
        });
        dispatch({
          type: 'set-upscale-preview',
          preview: {
            ...previewState,
            loading: false,
            upscaledUrl: URL.createObjectURL(blob),
          },
        });
      } catch (error) {
        dispatch({
          type: 'set-upscale-preview',
          preview: {
            ...previewState,
            loading: false,
            error: error instanceof Error ? error.message : 'Aperçu upscale impossible',
          },
        });
      }
    },
    [state.mode, state.source, state.upscaleSettings]
  );

  const downloads = useDownloadActions({
    state,
    dispatch,
    selectedGeneralImages,
    ensureChapterPreview,
    waifuRuntimeRef,
    updateActivity,
  });

  const selectAllGeneral = useCallback(
    (checked: boolean) => {
      if (!state.scan) return;
      dispatch({
        type: 'set-general-selection',
        selection: Object.fromEntries(state.scan.general.items.map((item) => [item.id, checked])),
      });
    },
    [state.scan]
  );

  return {
    state,
    selectedGeneralImages,
    setMode: (mode: 'manga' | 'general') => dispatch({ type: 'set-mode', mode }),
    setArchiveFormat: (format: ArchiveFormat) => dispatch({ type: 'set-archive-format', format }),
    toggleGeneralItem: (imageId: string) => dispatch({ type: 'toggle-general-item', imageId }),
    selectAllGeneral,
    setUpscaleEnabled: (enabled: boolean) => dispatch({ type: 'set-upscale-enabled', enabled }),
    setUpscaleSettings: (mode: 'manga' | 'general', settings: Partial<UpscaleSettings>) =>
      dispatch({ type: 'set-upscale-settings', mode, settings }),
    ensureChapterPreview,
    previewUpscale,
    downloadGeneral: downloads.downloadGeneral,
    downloadChapter: downloads.downloadChapter,
    downloadAllChapters: downloads.downloadAllChapters,
    downloadImage: downloads.downloadImage,
  };
}
