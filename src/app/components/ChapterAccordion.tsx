import { useState } from 'react';
import type { ChapterItem, ImageCandidate, ImageCollectionResult } from '@shared/types';
import { SafeImage } from './SafeImage';
import { ChevronDownIcon, DownloadIcon } from './icons';

interface ChapterAccordionProps {
  chapter: ChapterItem;
  sourceTabId?: number;
  thumbnailSize: number;
  compact: boolean;
  onEnsurePreview(chapter: ChapterItem): Promise<ImageCollectionResult>;
  onDownload(chapter: ChapterItem): void;
  onDownloadImage(image: ImageCandidate, chapter: ChapterItem): void;
  onOpenImage(chapter: ChapterItem, items: ImageCandidate[], index: number): void;
}

function PreviewStatusBadge({ status, count }: { status: ChapterItem['previewStatus']; count?: number }) {
  if (status === 'loading') return <span className="badge-loading">Analyse…</span>;
  if (status === 'error')   return <span className="badge-error">Erreur</span>;
  if (status === 'ready' && count !== undefined)
    return <span className="badge-ready">{count} pages</span>;
  return <span className="badge-idle">Non chargé</span>;
}

export function ChapterAccordion({
  chapter,
  sourceTabId,
  thumbnailSize,
  compact,
  onEnsurePreview,
  onDownload,
  onDownloadImage,
  onOpenImage,
}: ChapterAccordionProps) {
  const [open, setOpen] = useState(chapter.relation === 'current');
  const isCurrentChapter = chapter.relation === 'current';

  const handleToggle = async () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && chapter.previewStatus === 'idle') {
      try {
        await onEnsurePreview(chapter);
      } catch {
        // Handled in state — badge error visible
      }
    }
  };

  const pageCount = chapter.preview?.items.length;
  const previewItems = chapter.preview?.items || [];
  return (
    <article className={`surface overflow-hidden transition-shadow ${isCurrentChapter ? 'ring-1 ring-accent/25 shadow-panel' : ''}`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          onClick={() => void handleToggle()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void handleToggle()}
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isCurrentChapter ? 'bg-accent text-white' : 'bg-border/50 text-ink'
          }`}>
            <span className="text-xs font-semibold">
              {chapter.chapterNumber ?? '•'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="truncate text-[13px] font-semibold text-ink" title={chapter.label}>
                {chapter.label}
              </h3>
              <PreviewStatusBadge status={chapter.previewStatus} count={pageCount} />
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            id={`dl-chapter-${chapter.canonicalUrl}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-ink transition-colors hover:border-accent/40 hover:text-accent"
            title="Télécharger ce chapitre"
            onClick={(e) => { e.stopPropagation(); onDownload(chapter); }}
          >
            <DownloadIcon size={14} />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-muted transition-colors hover:border-accent/40 hover:text-accent"
            aria-label={open ? 'Réduire le chapitre' : 'Ouvrir le chapitre'}
            onClick={() => void handleToggle()}
          >
            <ChevronDownIcon size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className={`animate-slide-down border-t border-border/50 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
          {chapter.previewStatus === 'loading' && (
            <div className="flex items-center gap-2 py-3 text-[11px] text-muted">
              <span className="inline-block h-3 w-3 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
              Chargement…
            </div>
          )}

          {chapter.previewStatus === 'error' && (
            <div className="rounded-lg bg-danger/5 px-2.5 py-2 text-[11px] text-danger">
              {chapter.previewError ?? 'Échec de la détection des pages.'}
            </div>
          )}

          {chapter.previewStatus === 'ready' && chapter.preview && (
            <>
              {chapter.preview.items.length > 0 ? (
                <div
                  className={`grid ${compact ? 'gap-1' : 'gap-1.5'}`}
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}
                >
                  {previewItems.map((item, i) => (
                    <article
                      key={item.id}
                      title={item.filenameHint}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-border/20 transition-colors hover:border-border/80"
                      onClick={() => onOpenImage(chapter, previewItems, i)}
                      onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          event.preventDefault();
                          onOpenImage(chapter, previewItems, i);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-white/60 bg-white/82 text-ink shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-white"
                        title="Télécharger l'image"
                        aria-label="Télécharger l'image"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDownloadImage(item, chapter);
                        }}
                      >
                        <DownloadIcon size={12} />
                      </button>
                      <SafeImage
                        src={item.previewUrl || item.url}
                        alt={`Page ${i + 1}`}
                        referrer={chapter.url}
                        captureTabId={item.origin === 'live-dom' ? sourceTabId : undefined}
                        captureCandidateId={item.origin === 'live-dom' ? item.id : undefined}
                        className="page-thumb transition-transform duration-200 ease-out group-hover:scale-[1.025] group-focus-within:scale-[1.025]"
                      />
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-0.5 text-2xs text-white">
                        {i + 1}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted">Aucune page détectée.</p>
              )}
            </>
          )}

          {chapter.previewStatus === 'idle' && (
            <p className="py-1.5 text-[11px] text-muted">Ouvrir pour charger.</p>
          )}
        </div>
      )}
    </article>
  );
}
