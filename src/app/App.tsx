import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImageCandidate } from '@shared/types';
import { AppHeader } from '@app/components/AppHeader';
import { AppSidebar } from '@app/components/AppSidebar';
import { ChapterAccordion } from '@app/components/ChapterAccordion';
import { GeneralGrid } from '@app/components/GeneralGrid';
import { ImageViewerModal } from '@app/components/ImageViewerModal';
import { useNetsuController } from '@app/hooks/useNetsuController';
import { useWindowWidth } from '@app/hooks/useWindowWidth';
import {
  applyGeneralImageView,
  buildGeneralImageSections,
  getGeneralDisplayOptions,
  buildGeneralTypeOptions,
  getGeneralSortOptions,
  type GeneralImageDisplayMode,
  type GeneralImageSortMode,
  type GeneralImageTypeFilter,
} from '@app/services/generalImageView';

interface AutoUiSettings {
  thumbnailSize: number;
  compactMode: boolean;
}

interface ViewerState {
  title: string;
  items: ImageCandidate[];
  index: number;
  referrer?: string;
  sourceTabId?: number;
}

const EMPTY_IMAGES: ImageCandidate[] = [];

function resolveAutoUiSettings(windowWidth: number): AutoUiSettings {
  if (windowWidth < 920) {
    return { thumbnailSize: 126, compactMode: true };
  }
  if (windowWidth < 1320) {
    return { thumbnailSize: 138, compactMode: true };
  }
  if (windowWidth < 1760) {
    return { thumbnailSize: 150, compactMode: false };
  }
  return { thumbnailSize: 164, compactMode: false };
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-mist p-6">
      <div className="surface flex min-h-[320px] w-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="h-8 w-8 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm font-semibold text-ink">Chargement de l’espace de travail</p>
        <p className="text-xs text-muted">{message}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-mist p-6">
      <div className="surface flex min-h-[320px] w-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-semibold text-ink">Impossible d'initialiser NetsuPanel</p>
        <p className="max-w-xs rounded-2xl bg-danger/5 px-4 py-3 text-xs text-danger">{error}</p>
      </div>
    </div>
  );
}

function EmptyChapterState() {
  return (
    <div className="rounded-[18px] border border-dashed border-border bg-white px-4 py-8 text-center text-xs text-muted">
      Aucun chapitre détecté. Ce site nécessite peut-être un adaptateur spécifique.
    </div>
  );
}

export function App() {
  const controller = useNetsuController();
  const { state } = controller;
  const windowWidth = useWindowWidth();
  const [generalDisplayMode, setGeneralDisplayMode] = useState<GeneralImageDisplayMode>('grid');
  const [generalTypeFilter, setGeneralTypeFilter] = useState<GeneralImageTypeFilter>('all');
  const [generalSortMode, setGeneralSortMode] = useState<GeneralImageSortMode>('page-order');
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const handleViewerCompare = useCallback(
    (candidate: ImageCandidate) => {
      if (!viewer?.referrer) return;
      void controller.previewUpscale(candidate, viewer.referrer);
    },
    [controller.previewUpscale, viewer?.referrer]
  );

  const generalItems = state.scan?.general.items ?? EMPTY_IMAGES;
  const generalDisplayOptions = useMemo(() => getGeneralDisplayOptions(), []);
  const generalTypeOptions = useMemo(() => buildGeneralTypeOptions(generalItems), [generalItems]);
  const generalSortOptions = useMemo(() => getGeneralSortOptions(), []);
  const filteredGeneralItems = useMemo(
    () => applyGeneralImageView(generalItems, generalTypeFilter, generalSortMode),
    [generalItems, generalSortMode, generalTypeFilter]
  );
  const generalSections = useMemo(
    () => buildGeneralImageSections(filteredGeneralItems, generalDisplayMode),
    [filteredGeneralItems, generalDisplayMode]
  );

  useEffect(() => {
    if (generalTypeOptions.some((option) => option.value === generalTypeFilter)) {
      return;
    }
    setGeneralTypeFilter('all');
  }, [generalTypeFilter, generalTypeOptions]);

  if (state.loading) {
    return <LoadingScreen message={state.loadingMessage || 'Initialisation…'} />;
  }

  if (state.error || !state.source || !state.scan) {
    return <ErrorScreen error={state.error ?? 'Erreur inconnue'} />;
  }

  const source = state.source;
  const scan = state.scan;
  const currentChapter = state.chapters.find((chapter) => chapter.relation === 'current') || state.chapters[0];
  const isManga = state.mode === 'manga';
  const generalCount = scan.general.items.length;
  const generalSelectedCount = controller.selectedGeneralImages.length;
  const chapterCount = state.chapters.length;
  const autoUi = resolveAutoUiSettings(windowWidth);
  const showDesktopSidebar = windowWidth >= 1024;
  const chapterThumbnailSize = Math.max(88, autoUi.thumbnailSize - 18);
  const mainSpacingClass = autoUi.compactMode ? 'space-y-2' : 'space-y-2.5';

  const sidebar = (
    <AppSidebar
      archiveFormat={state.archiveFormat}
      currentChapter={currentChapter}
      chapterCount={chapterCount}
      selectedGeneralCount={generalSelectedCount}
      activity={state.activity}
      mode={state.mode}
      generalDisplayMode={generalDisplayMode}
      generalDisplayOptions={generalDisplayOptions}
      generalTypeFilter={generalTypeFilter}
      generalTypeOptions={generalTypeOptions}
      generalSortMode={generalSortMode}
      generalSortOptions={generalSortOptions}
      upscaleEnabled={state.upscaleEnabled}
      settings={state.upscaleSettings[state.mode]}
      backendLabel={state.waifuBackendLabel}
      preview={state.upscalePreview}
      onArchiveFormatChange={controller.setArchiveFormat}
      onGeneralDisplayModeChange={setGeneralDisplayMode}
      onGeneralTypeFilterChange={setGeneralTypeFilter}
      onGeneralSortModeChange={setGeneralSortMode}
      onUpscaleToggle={controller.setUpscaleEnabled}
      onUpscaleSettingsChange={controller.setUpscaleSettings}
      onLoadAllChapters={() => void controller.loadAllChapterPreviews()}
      onDownloadCurrent={() => currentChapter && void controller.downloadChapter(currentChapter)}
      onDownloadAll={() => void controller.downloadAllChapters()}
      onDownloadGeneral={() => void controller.downloadGeneral()}
    />
  );

  return (
    <div className="h-screen overflow-hidden bg-[#f4f5f7] font-sans text-ink">
      <div className="mx-auto flex h-full max-w-[1600px] gap-2 px-2 py-2 lg:px-3 lg:py-3">
        {showDesktopSidebar && (
          <aside className="hidden w-[236px] shrink-0 lg:block">
            <div className="sticky top-0 h-[calc(100vh-24px)] overflow-y-auto pr-1">
              {sidebar}
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1">
          <div className="flex h-full flex-col gap-2.5">
            <AppHeader
              source={state.source}
              mode={state.mode}
              chapterCount={chapterCount}
              generalCount={generalCount}
              mangaPageCount={scan.manga.currentPages.items.length}
              onModeChange={controller.setMode}
            />

            {!showDesktopSidebar && (
              <div className="overflow-y-auto">
                {sidebar}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              <div className={`h-full overflow-y-auto pr-1 ${mainSpacingClass}`}>
                {isManga ? (
                  <>
                    {state.chapters.length === 0 ? (
                      <EmptyChapterState />
                    ) : (
                      state.chapters.map((chapter) => (
                        <ChapterAccordion
                          key={chapter.canonicalUrl}
                          chapter={chapter}
                          sourceTabId={source.id}
                          compact={autoUi.compactMode}
                          thumbnailSize={chapterThumbnailSize}
                          onEnsurePreview={controller.ensureChapterPreview}
                          onDownload={(item) => void controller.downloadChapter(item)}
                          onDownloadImage={(image, chapterItem) => void controller.downloadImage(image, { referrer: chapterItem.url })}
                          onOpenImage={(item, items, index) => {
                            setViewer({
                              title: item.label,
                              items,
                              index,
                              referrer: item.url,
                              sourceTabId: source.id,
                            });
                          }}
                        />
                      ))
                    )}
                  </>
                ) : (
                  <GeneralGrid
                    items={filteredGeneralItems}
                    sections={generalSections}
                    selected={state.generalSelection}
                    thumbnailSize={autoUi.thumbnailSize}
                    compact={autoUi.compactMode}
                    referrer={source.url}
                    sourceTabId={source.id}
                    onToggle={controller.toggleGeneralItem}
                    onSelectAll={(checked) =>
                      controller.selectAllGeneral(
                        checked,
                        filteredGeneralItems.map((item) => item.id)
                      )
                    }
                    onDownload={() => void controller.downloadGeneral()}
                    onDownloadImage={(candidate) => void controller.downloadImage(candidate, { referrer: source.url })}
                    onOpen={(candidate) => {
                      setViewer({
                        title: source.title || 'Images détectées',
                        items: filteredGeneralItems,
                        index: filteredGeneralItems.findIndex((item) => item.id === candidate.id),
                        referrer: source.url,
                        sourceTabId: source.id,
                      });
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {viewer && (
        <ImageViewerModal
          title={viewer.title}
          items={viewer.items}
          index={viewer.index}
          referrer={viewer.referrer}
          sourceTabId={viewer.sourceTabId}
          preview={state.upscalePreview}
          onClose={() => setViewer(null)}
          onNavigate={(nextIndex) => setViewer((current) => (current ? { ...current, index: nextIndex } : current))}
          onRequestCompare={handleViewerCompare}
          onDownloadImage={(image) => controller.downloadImage(image, { referrer: viewer.referrer })}
        />
      )}
    </div>
  );
}
