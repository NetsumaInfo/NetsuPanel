import { useEffect, useState } from 'react';
import type { ChapterItem, DetectionDiagnostic, ImageCandidate } from '@shared/types';
import { ChapterAccordion } from '@app/components/ChapterAccordion';
import { GeneralGrid } from '@app/components/GeneralGrid';
import { ModeSwitch } from '@app/components/ModeSwitch';
import { StatusStrip } from '@app/components/StatusStrip';
import { UpscalePanel } from '@app/components/UpscalePanel';
import { useNetsuController } from '@app/hooks/useNetsuController';
import { resolveSiteSupport } from '@core/detection/adapters/siteSupport';

interface AutoUiSettings {
  thumbnailSize: number;
  chapterPreviewLimit: number;
  compactMode: boolean;
}

function pickPreviewCandidate(chapter: ChapterItem): ImageCandidate | undefined {
  return chapter.preview?.items[0];
}

function resolveAutoUiSettings(windowWidth: number): AutoUiSettings {
  if (windowWidth < 920) {
    return { thumbnailSize: 146, chapterPreviewLimit: 8, compactMode: true };
  }
  if (windowWidth < 1320) {
    return { thumbnailSize: 162, chapterPreviewLimit: 10, compactMode: true };
  }
  if (windowWidth < 1760) {
    return { thumbnailSize: 174, chapterPreviewLimit: 12, compactMode: false };
  }
  return { thumbnailSize: 190, chapterPreviewLimit: 16, compactMode: false };
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="h-6 w-6 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-sm font-medium text-ink">NetsuPanel</p>
      <p className="text-xs text-muted">{message}</p>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-semibold text-ink">Impossible d'initialiser</p>
      <p className="max-w-xs rounded-xl bg-danger/5 px-4 py-3 text-xs text-danger">{error}</p>
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: DetectionDiagnostic[] }) {
  if (diagnostics.length === 0) return null;

  return (
    <details className="group surface p-3">
      <summary className="cursor-pointer text-2xs text-muted hover:text-ink py-1">
        {diagnostics.length} diagnostic{diagnostics.length > 1 ? 's' : ''}
      </summary>
      <ul className="mt-1 space-y-1 text-2xs text-muted">
        {diagnostics.map((item) => (
          <li key={`${item.code}-${item.message}`} className="rounded bg-border/30 px-2 py-1">
            [{item.level}] {item.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function App() {
  const controller = useNetsuController();
  const { state } = controller;
  const [windowWidth, setWindowWidth] = useState(() => (typeof window === 'undefined' ? 1366 : window.innerWidth));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setWindowWidth(window.innerWidth);
      });
    };

    window.addEventListener('resize', onResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // ── Loading ──
  if (state.loading) {
    return <LoadingScreen message={state.loadingMessage || 'Initialisation…'} />;
  }

  // ── Error ──
  if (state.error || !state.source || !state.scan) {
    return <ErrorScreen error={state.error ?? 'Erreur inconnue'} />;
  }

  const currentChapter = state.chapters.find((c) => c.relation === 'current') || state.chapters[0];
  const sourceUrl = state.source.url;
  const sourceTabId = state.source.id;
  const siteSupport = resolveSiteSupport(sourceUrl);
  const isManga = state.mode === 'manga';
  const mangaPageCount = state.scan.manga.currentPages.items.length;
  const generalCount   = state.scan.general.items.length;
  const chapterCount   = state.chapters.length;
  const diagnostics = state.scan.manga.diagnostics;
  const autoUi = resolveAutoUiSettings(windowWidth);
  const chapterThumbnailSize = Math.max(96, autoUi.thumbnailSize - 24);
  const contentSpacingClass = autoUi.compactMode ? 'px-2 py-2 space-y-1.5' : 'px-3 py-3 space-y-2';

  const renderSecondaryPanels = () => (
    <>
      <StatusStrip
        message={state.activity.message || 'Prêt.'}
        progress={state.activity.progress}
        error={state.activity.error}
      />

      <UpscalePanel
        enabled={state.upscaleEnabled}
        backendLabel={state.waifuBackendLabel}
        preview={state.upscalePreview}
        onToggle={controller.setUpscaleEnabled}
      />

      <DiagnosticsPanel diagnostics={diagnostics} />
    </>
  );

  return (
    <div className="flex h-full min-h-[560px] flex-col bg-mist font-sans text-ink">

      {/* ════════════ HEADER ════════════ */}
      <header className="border-b border-border bg-white px-4 py-3">
        {/* Title row */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-widest text-muted">NetsuPanel</p>
            <h1 className="mt-0.5 truncate text-base font-semibold text-ink" title={state.source.title}>
              {state.source.title || state.source.url}
            </h1>
          </div>
          <ModeSwitch value={state.mode} onChange={controller.setMode} />
        </div>

        {/* Stats chips */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="badge-idle">{generalCount} images</span>
          {isManga && <span className="badge-idle">{chapterCount} chapitres</span>}
          {isManga && <span className="badge-idle">{mangaPageCount} pages (courant)</span>}
          <span
            className={
              siteSupport.status === 'supported'
                ? 'badge-ready'
                : siteSupport.status === 'unsupported'
                  ? 'badge-error'
                  : 'badge-idle'
            }
            title={siteSupport.note}
          >
            {siteSupport.status === 'supported'
              ? `Supporte: ${siteSupport.family}`
              : siteSupport.status === 'unsupported'
                ? `Non supporte: ${siteSupport.family}`
                : `Experimental: ${siteSupport.family}`}
          </span>
        </div>
      </header>

      {/* ════════════ MANGA TOOLBAR ════════════ */}
      {isManga && (
        <div className="flex flex-col gap-2 border-b border-border bg-white px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-2xs text-muted">Format</label>
            <select
              id="archive-format"
              value={state.archiveFormat}
              onChange={(e) => controller.setArchiveFormat(e.target.value as 'cbz' | 'zip')}
              className="rounded-lg border border-border px-2 py-1 text-2xs text-ink"
            >
              <option value="cbz">CBZ</option>
              <option value="zip">ZIP</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="dl-current-chapter"
              className="btn btn-sm"
              disabled={!currentChapter}
              onClick={() => currentChapter && void controller.downloadChapter(currentChapter)}
              title="Télécharger le chapitre courant"
            >
              ↓ Chapitre courant
            </button>
            <button
              type="button"
              id="dl-all-chapters"
              className="btn btn-primary btn-sm"
              disabled={chapterCount === 0}
              onClick={() => void controller.downloadAllChapters()}
              title="Télécharger tous les chapitres"
            >
              ↓ Tous ({chapterCount})
            </button>
          </div>
        </div>
      )}

      {/* ════════════ MAIN CONTENT ════════════ */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left settings sidebar (desktop) */}
        <aside className="hidden shrink-0 border-r border-border bg-white/85 lg:block lg:w-[320px]">
          <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
            {renderSecondaryPanels()}
          </div>
        </aside>

        {/* Main area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={`flex-1 overflow-y-auto ${contentSpacingClass}`}>
            {isManga ? (
              <>
                {state.chapters.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted">
                    Aucun chapitre détecté. Ce site nécessite peut-être un adaptateur spécifique.
                  </div>
                ) : (
                  state.chapters.map((chapter) => (
                    <ChapterAccordion
                      key={chapter.canonicalUrl}
                      chapter={chapter}
                      sourceTabId={sourceTabId}
                      compact={autoUi.compactMode}
                      thumbnailSize={chapterThumbnailSize}
                      previewLimit={autoUi.chapterPreviewLimit}
                      onEnsurePreview={controller.ensureChapterPreview}
                      onDownload={(item) => void controller.downloadChapter(item)}
                      onCompareFirst={() => {
                        const candidate = pickPreviewCandidate(chapter);
                        if (candidate) void controller.previewUpscale(candidate, chapter.url);
                      }}
                    />
                  ))
                )}
              </>
            ) : (
              <GeneralGrid
                items={state.scan.general.items}
                selected={state.generalSelection}
                thumbnailSize={autoUi.thumbnailSize}
                compact={autoUi.compactMode}
                onToggle={controller.toggleGeneralItem}
                onSelectAll={controller.selectAllGeneral}
                onDownload={() => void controller.downloadGeneral()}
                referrer={sourceUrl}
                sourceTabId={sourceTabId}
                onCompare={(candidate) => void controller.previewUpscale(candidate, sourceUrl)}
              />
            )}
          </div>

          {/* Bottom panels (mobile/tablet) */}
          <div className="shrink-0 border-t border-border bg-white px-3 py-2 space-y-2 lg:hidden">
            {renderSecondaryPanels()}
          </div>
        </div>
      </div>
    </div>
  );
}
