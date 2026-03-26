import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ArchiveFormat, ChapterItem, ImageCandidate, UpscalePreviewState, UpscaleSettings } from '@shared/types';
import {
  discoverChapters,
  loadChapterPreview as fetchChapterPreview,
  seedChaptersFromScan,
} from '@core/manga/chapterCrawler';
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
  const chapterPreviewTasksRef = useRef<Map<string, ReturnType<typeof fetchChapterPreview>>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const tabId = await resolveBootstrapTabId();
        if (!tabId) {
          throw new Error("Impossible de determiner l'onglet source. Ouvre une page web normale puis relance l'extension.");
        }

        dispatch({ type: 'bootstrap-start', tabId });
        dispatch({ type: 'set-loading-message', message: 'Analyse en cours…' });

        // Parallelize: fetch source context and scan the page simultaneously
        const [source, scan] = await Promise.all([
          getSourceContext(tabId),
          scanSourceTab(tabId),
        ]);

        const fetchDocumentForSource = (url: string, options: { referrer?: string; tabId?: number } = {}) =>
          fetchDocument(url, {
            referrer: options.referrer || source.url,
            tabId,
          });

        const chapters = seedChaptersFromScan(scan);
        if (!cancelled) {
          dispatch({ type: 'bootstrap-success', source, scan, chapters });
        }

        // Always discover chapters asynchronously (non-blocking)
        void (async () => {
          try {
            const discovered = await discoverChapters(
              scan,
              { fetchDocument: fetchDocumentForSource },
              {
                referrer: source.url,
                tabId,
                maxLinearSteps: 80,
                maxDurationMs: 8_500,
              }
            );
            if (!cancelled && discovered.length > 0) {
              dispatch({ type: 'set-chapters', chapters: discovered });
            }
          } catch {
            // Non bloquant: on conserve les chapitres initiaux déjà détectés.
          }
        })();
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
      const source = state.source;
      const currentScan = state.scan;

      if (chapter.previewStatus === 'ready' && chapter.preview) {
        return chapter.preview;
      }

      const existingTask = chapterPreviewTasksRef.current.get(chapter.canonicalUrl);
      if (existingTask) {
        return existingTask;
      }

      dispatch({
        type: 'set-chapter-preview-status',
        chapterUrl: chapter.canonicalUrl,
        status: 'loading',
      });

      const task = (async () => {
        try {
          const preview =
            isSameChapterUrl(chapter.canonicalUrl, source.url)
              ? currentScan.manga.currentPages
              : await fetchChapterPreview(
                  chapter.url,
                  {
                    fetchDocument: (url, options = {}) =>
                      fetchDocument(url, {
                        referrer: options.referrer || source.url,
                        tabId: source.id,
                      }),
                  },
                  { referrer: source.url, tabId: source.id }
                );
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
        } finally {
          chapterPreviewTasksRef.current.delete(chapter.canonicalUrl);
        }
      })();
      chapterPreviewTasksRef.current.set(chapter.canonicalUrl, task);
      return task;
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
            resource = await fetchBinary(candidate.url, {
              referrer: candidate.referrer || referrer,
              headers: candidate.headers,
              tabId: state.source.id,
            });
          }
        } else {
          resource = await fetchBinary(candidate.url, {
            referrer: candidate.referrer || referrer,
            headers: candidate.headers,
            tabId: state.source.id,
          });
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
    (checked: boolean, imageIds?: string[]) => {
      if (!state.scan) return;
      const targetIds = imageIds && imageIds.length > 0
        ? imageIds
        : state.scan.general.items.map((item) => item.id);
      dispatch({
        type: 'set-general-selection',
        selection: {
          ...state.generalSelection,
          ...Object.fromEntries(targetIds.map((id) => [id, checked])),
        },
      });
    },
    [state.generalSelection, state.scan]
  );

  const loadAllChapterPreviews = useCallback(async () => {
    if (state.chapters.length === 0) return;

    const chapters = [...state.chapters];
    const workerCount = Math.min(3, chapters.length);
    let completed = 0;
    let failed = 0;

    updateActivity('Chargement des apercus de chapitres…', 0);

    const runWorker = async () => {
      while (chapters.length > 0) {
        const chapter = chapters.shift();
        if (!chapter) return;

        try {
          await ensureChapterPreview(chapter);
        } catch {
          failed += 1;
        } finally {
          completed += 1;
          updateActivity(
            `Chargement des apercus de chapitres… ${completed}/${state.chapters.length}`,
            completed / state.chapters.length
          );
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    dispatch({
      type: 'set-activity',
      activity: {
        active: false,
        cancelled: false,
        progress: 1,
        message:
          failed === 0
            ? `${completed} chapitres charges.`
            : `${completed - failed}/${completed} chapitres charges, ${failed} echec(s).`,
      },
    });
  }, [dispatch, ensureChapterPreview, state.chapters, updateActivity]);

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
    loadAllChapterPreviews,
    previewUpscale,
    downloadGeneral: downloads.downloadGeneral,
    downloadChapter: downloads.downloadChapter,
    downloadAllChapters: downloads.downloadAllChapters,
    downloadImage: downloads.downloadImage,
  };
}
