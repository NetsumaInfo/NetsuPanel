import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ChapterItem, ImageCandidate, UpscalePreviewState } from '@shared/types';
import { browser } from '@shared/browser';
import { discoverChapters, loadChapterPreview as fetchChapterPreview } from '@core/manga/chapterCrawler';
import { Waifu2xRuntime } from '@core/upscale/waifu2xRuntime';
import { appReducer, initialAppState } from '@app/state/appState';
import { downloadAllChapters, downloadGeneralSelection, downloadSingleChapter } from '@app/services/downloadService';
import { captureImage, fetchBinary, fetchDocument, getSourceContext, scanSourceTab } from '@app/services/runtimeClient';

const LAST_SOURCE_TAB_ID_KEY = 'lastSourceTabId';

function getTabIdFromLocation(): number | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('tabId');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUsableSourceUrl(url?: string): boolean {
  if (!url) return false;
  return !(
    url.startsWith('chrome://') ||
    url.startsWith('about:') ||
    url.startsWith('moz-extension://') ||
    url.startsWith('chrome-extension://')
  );
}

function normalizeChapterIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return url.split('#')[0].replace(/\?.*$/, '').replace(/\/+$/, '');
  }
}

function isSameChapterUrl(left: string, right: string): boolean {
  return normalizeChapterIdentity(left) === normalizeChapterIdentity(right);
}

async function resolveBootstrapTabId(): Promise<number | null> {
  const queryTabId = getTabIdFromLocation();
  if (queryTabId) return queryTabId;

  const storage = await browser.storage.local.get(LAST_SOURCE_TAB_ID_KEY);
  const storedTabId = Number(storage[LAST_SOURCE_TAB_ID_KEY]);
  if (Number.isFinite(storedTabId)) {
    try {
      const storedTab = await browser.tabs.get(storedTabId);
      if (storedTab.id && isUsableSourceUrl(storedTab.url)) {
        return storedTab.id;
      }
    } catch {
      // Ignore and continue with active-tab fallback.
    }
  }

  const tabs = await browser.tabs.query({ lastFocusedWindow: true });
  const activeCandidate = tabs.find(
    (tab: { active?: boolean; id?: number; url?: string }) =>
      tab.active && tab.id && isUsableSourceUrl(tab.url)
  );
  if (activeCandidate?.id) return activeCandidate.id;

  const firstUsableCandidate = tabs.find(
    (tab: { id?: number; url?: string }) => tab.id && isUsableSourceUrl(tab.url)
  );
  return firstUsableCandidate?.id ?? null;
}

export function useNetsuController() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const waifuRuntimeRef = useRef<Waifu2xRuntime>(new Waifu2xRuntime());

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const tabId = await resolveBootstrapTabId();
        if (!tabId) {
          throw new Error('Impossible de déterminer l’onglet source. Ouvre une page web normale puis relance l’extension.');
        }

        dispatch({ type: 'bootstrap-start', tabId });
        dispatch({ type: 'set-loading-message', message: 'Reading source tab context...' });
        const source = await getSourceContext(tabId);
        dispatch({ type: 'set-loading-message', message: 'Scanning live page...' });
        const scan = await scanSourceTab(tabId);
        dispatch({ type: 'set-loading-message', message: 'Discovering chapter graph...' });
        const chapters = await discoverChapters(scan, { fetchDocument });
        if (!cancelled) {
          dispatch({ type: 'bootstrap-success', source, scan, chapters });
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: 'bootstrap-error',
            error: error instanceof Error ? error.message : 'Bootstrap failed',
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
        throw new Error('Scan state unavailable');
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
          error: error instanceof Error ? error.message : 'Preview load failed',
        });
        throw error;
      }
    },
    [state.scan, state.source]
  );

  const previewUpscale = useCallback(
    async (candidate: ImageCandidate, referrer?: string) => {
      if (!state.source) return;
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
          cacheKey: `preview-${candidate.id}-${state.mode}`,
          bytes: resource.bytes,
          mime: resource.mime,
          mode: state.mode,
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
            error: error instanceof Error ? error.message : 'Upscale preview failed',
          },
        });
      }
    },
    [state.mode, state.source]
  );

  const handleDownloadGeneral = useCallback(async () => {
    if (!state.scan || !state.source || selectedGeneralImages.length === 0) return;

    try {
      updateActivity('Building archive...', 0);
      await downloadGeneralSelection(state.source.title, selectedGeneralImages, {
        tabId: state.source.id,
        waifuRuntime: waifuRuntimeRef.current,
        onProgress: (message, progress) => updateActivity(message, progress),
        upscaleEnabled: state.upscaleEnabled,
        mode: 'general',
        sourceReferrer: state.source.url,
      });
      updateActivity('Archive ready.', 1);
      dispatch({
        type: 'set-activity',
        activity: {
          active: false,
          cancelled: false,
          progress: 1,
          message: 'Archive ready.',
        },
      });
    } catch (error) {
      updateActivity('Download failed', 0, error instanceof Error ? error.message : 'General download failed');
    }
  }, [selectedGeneralImages, state.scan, state.source, state.upscaleEnabled, updateActivity]);

  const handleDownloadChapter = useCallback(
    async (chapter: ChapterItem) => {
      if (!state.source) return;

      try {
        const preview = await ensureChapterPreview(chapter);
        updateActivity(`Packing ${chapter.label}`, 0);
        await downloadSingleChapter(state.source.title, chapter, preview.items, state.archiveFormat, {
          tabId: state.source.id,
          waifuRuntime: waifuRuntimeRef.current,
          onProgress: (message, progress) => updateActivity(message, progress),
          upscaleEnabled: state.upscaleEnabled,
          mode: 'manga',
        });
        dispatch({
          type: 'set-activity',
          activity: {
            active: false,
            cancelled: false,
            progress: 1,
            message: `${chapter.label} archived.`,
          },
        });
      } catch (error) {
        updateActivity('Chapter download failed', 0, error instanceof Error ? error.message : 'Chapter download failed');
      }
    },
    [ensureChapterPreview, state.archiveFormat, state.source, state.upscaleEnabled, updateActivity]
  );

  const handleDownloadAll = useCallback(async () => {
    if (!state.source || state.chapters.length === 0) return;

    try {
      const prepared: Array<{ chapter: ChapterItem; images: ImageCandidate[] }> = [];
      for (const chapter of state.chapters) {
        const preview = await ensureChapterPreview(chapter);
        prepared.push({ chapter, images: preview.items });
      }

      updateActivity('Building global archive...', 0);
      await downloadAllChapters(state.source.title, prepared, {
        tabId: state.source.id,
        waifuRuntime: waifuRuntimeRef.current,
        onProgress: (message, progress) => updateActivity(message, progress),
        upscaleEnabled: state.upscaleEnabled,
        mode: 'manga',
      });
      dispatch({
        type: 'set-activity',
        activity: {
          active: false,
          cancelled: false,
          progress: 1,
          message: 'Global archive ready.',
        },
      });
    } catch (error) {
      updateActivity('Global download failed', 0, error instanceof Error ? error.message : 'Global archive failed');
    }
  }, [ensureChapterPreview, state.chapters, state.source, state.upscaleEnabled, updateActivity]);

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
    setArchiveFormat: (format: 'cbz' | 'zip') => dispatch({ type: 'set-archive-format', format }),
    toggleGeneralItem: (imageId: string) => dispatch({ type: 'toggle-general-item', imageId }),
    selectAllGeneral,
    setUpscaleEnabled: (enabled: boolean) => dispatch({ type: 'set-upscale-enabled', enabled }),
    ensureChapterPreview,
    previewUpscale,
    downloadGeneral: handleDownloadGeneral,
    downloadChapter: handleDownloadChapter,
    downloadAllChapters: handleDownloadAll,
  };
}
