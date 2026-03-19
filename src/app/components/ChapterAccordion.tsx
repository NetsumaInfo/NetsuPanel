import { useState } from 'react';
import type { ChapterItem, ImageCollectionResult } from '@shared/types';
import { SafeImage } from './SafeImage';

interface ChapterAccordionProps {
  chapter: ChapterItem;
  sourceTabId?: number;
  thumbnailSize: number;
  previewLimit: number;
  compact: boolean;
  onEnsurePreview(chapter: ChapterItem): Promise<ImageCollectionResult>;
  onDownload(chapter: ChapterItem): void;
  onCompareFirst(chapter: ChapterItem): void;
}

const RELATION_LABEL: Record<string, string> = {
  current:   'Courant',
  previous:  'Précédent',
  next:      'Suivant',
  listing:   'Listing',
  candidate: '',
};

function PreviewStatusBadge({ status, count }: { status: ChapterItem['previewStatus']; count?: number }) {
  if (status === 'loading') return <span className="badge-loading">Détection…</span>;
  if (status === 'error')   return <span className="badge-error">Erreur</span>;
  if (status === 'ready' && count !== undefined)
    return <span className="badge-ready">{count} pages</span>;
  return <span className="badge-idle">Non chargé</span>;
}

export function ChapterAccordion({
  chapter,
  sourceTabId,
  thumbnailSize,
  previewLimit,
  compact,
  onEnsurePreview,
  onDownload,
  onCompareFirst,
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
  const previewItems = chapter.preview?.items.slice(0, previewLimit) || [];
  const remainingCount = Math.max((chapter.preview?.items.length || 0) - previewItems.length, 0);
  const relationText = RELATION_LABEL[chapter.relation] || '';

  return (
    <article className={`surface overflow-hidden transition-shadow ${isCurrentChapter ? 'ring-1 ring-accent/30' : ''}`}>
      {/* ─── Header row ─── */}
      <div className="accordion-row" onClick={() => void handleToggle()} role="button" tabIndex={0}
           onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void handleToggle()}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {relationText && (
              <span className={`text-2xs font-semibold uppercase tracking-wide ${
                isCurrentChapter ? 'text-accent' : 'text-muted'
              }`}>
                {relationText}
              </span>
            )}
            <PreviewStatusBadge status={chapter.previewStatus} count={pageCount} />
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-ink" title={chapter.label}>
            {chapter.label}
          </h3>
          {chapter.chapterNumber !== null && (
            <p className="text-2xs text-muted">Ch. {chapter.chapterNumber}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Download chapter button */}
          <button
            type="button"
            id={`dl-chapter-${chapter.canonicalUrl}`}
            className="btn btn-sm"
            title="Télécharger ce chapitre"
            onClick={(e) => { e.stopPropagation(); onDownload(chapter); }}
          >
            ↓
          </button>
          {/* Toggle chevron */}
          <span className={`text-base text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            ⌃
          </span>
        </div>
      </div>

      {/* ─── Content panel ─── */}
      {open && (
        <div className={`animate-slide-down border-t border-border/50 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
          {chapter.previewStatus === 'loading' && (
            <div className="flex items-center gap-2 py-4 text-xs text-muted">
              <span className="inline-block h-3 w-3 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
              Détection des pages en cours…
            </div>
          )}

          {chapter.previewStatus === 'error' && (
            <div className="rounded-lg bg-danger/5 px-3 py-2.5 text-xs text-danger">
              {chapter.previewError ?? 'Échec de la détection des pages.'}
            </div>
          )}

          {chapter.previewStatus === 'ready' && chapter.preview && (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {chapter.preview.items.length} page{chapter.preview.items.length !== 1 ? 's' : ''} détectée{chapter.preview.items.length !== 1 ? 's' : ''}
                </span>
                {chapter.preview.items[0] && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onCompareFirst(chapter)}
                    title="Comparer avant/après upscale"
                  >
                    ⚡ Upscale aperçu
                  </button>
                )}
              </div>

              {chapter.preview.items.length > 0 ? (
                <div
                  className={`grid ${compact ? 'gap-1' : 'gap-1.5'}`}
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}
                >
                  {previewItems.map((item, i) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      title={item.filenameHint}
                      className="relative overflow-hidden rounded-lg border border-border bg-border/20 transition-opacity hover:opacity-80"
                    >
                      <SafeImage
                        src={item.previewUrl || item.url}
                        alt={`Page ${i + 1}`}
                        referrer={chapter.url}
                        captureTabId={item.origin === 'live-dom' ? sourceTabId : undefined}
                        captureCandidateId={item.origin === 'live-dom' ? item.id : undefined}
                        className="page-thumb"
                      />
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-0.5 text-2xs text-white">
                        {i + 1}
                      </span>
                    </a>
                  ))}
                  {remainingCount > 0 && (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-border text-2xs text-muted">
                      +{remainingCount}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">Aucune page détectée pour ce chapitre.</p>
              )}
            </>
          )}

          {chapter.previewStatus === 'idle' && (
            <p className="py-2 text-xs text-muted">Ouvre l'accordéon pour lancer la détection.</p>
          )}
        </div>
      )}
    </article>
  );
}
