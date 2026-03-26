import { useEffect, useState } from 'react';
import type { ImageCandidate } from '@shared/types';
import type { GeneralImageSection } from '@app/services/generalImageView';
import { formatMediaMeta, resolveMediaName } from '@app/services/mediaMeta';
import { SafeImage } from './SafeImage';
import { CheckIcon, DownloadIcon, ImageIcon } from './icons';

interface GeneralGridProps {
  items: ImageCandidate[];
  sections: GeneralImageSection[];
  selected: Record<string, boolean>;
  thumbnailSize: number;
  compact: boolean;
  infoMessage?: string;
  referrer?: string;
  sourceTabId?: number;
  onToggle(imageId: string): void;
  onSelectAll(checked: boolean): void;
  onDownload(): void;
  onDownloadImage(candidate: ImageCandidate): void;
  onOpen(candidate: ImageCandidate): void;
}

const INITIAL_RENDER_COUNT = 72;
const RENDER_BATCH_SIZE = 48;

export function GeneralGrid({
  items,
  sections,
  selected,
  thumbnailSize,
  compact,
  infoMessage,
  referrer,
  sourceTabId,
  onToggle,
  onSelectAll,
  onDownload,
  onDownloadImage,
  onOpen,
}: GeneralGridProps) {
  const [renderCount, setRenderCount] = useState(INITIAL_RENDER_COUNT);
  const selectedCount = items.filter((item) => selected[item.id]).length;
  const allSelected = selectedCount === items.length && items.length > 0;

  useEffect(() => {
    setRenderCount(Math.min(items.length, INITIAL_RENDER_COUNT));
  }, [items]);

  useEffect(() => {
    if (renderCount >= items.length) return;

    const timer = window.setTimeout(() => {
      setRenderCount((current) => Math.min(items.length, current + RENDER_BATCH_SIZE));
    }, 28);

    return () => window.clearTimeout(timer);
  }, [items.length, renderCount]);

  let remaining = renderCount;
  const renderedSections = sections
    .map((section) => {
      if (remaining <= 0) {
        return { ...section, items: [] };
      }
      const nextItems = section.items.slice(0, remaining);
      remaining -= nextItems.length;
      return {
        ...section,
        items: nextItems,
      };
    })
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 rounded-[18px] border border-border bg-white px-3 py-2.5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-border/50 text-ink">
              <ImageIcon size={14} />
            </span>
            {selectedCount}/{items.length}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] text-muted">
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${allSelected ? 'border-accent bg-accent text-white' : 'border-border bg-white'}`}>
                {allSelected && <CheckIcon size={12} />}
              </span>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="sr-only"
            />
              Tout
            </label>
            <button
              type="button"
              id="general-download-btn"
              className="btn btn-primary"
              disabled={selectedCount === 0}
              onClick={onDownload}
            >
              <DownloadIcon size={16} />
              Export {selectedCount}
            </button>
          </div>
        </div>

        {infoMessage ? (
          <div className="mt-2 rounded-xl border border-border/70 bg-[#f8f9fb] px-3 py-2 text-[11px] text-muted">
            {infoMessage}
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-8 text-xs text-muted">
          Aucune image détectée sur cette page.
        </div>
      ) : (
        <div className="space-y-3">
          {renderedSections.map((section) => (
            <section key={section.id} className="space-y-2">
              {sections.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-ink">
                    {section.title}
                  </span>
                  <div className="h-px flex-1 bg-border/70" />
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted">
                    {section.items.length}
                  </span>
                </div>
              )}

              <div
                className={`grid ${compact ? 'gap-1.5' : 'gap-2'}`}
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}
              >
                {section.items.map((item) => {
                  const isSelected = Boolean(selected[item.id]);
                  return (
                    <article
                      key={item.id}
                      className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all ${
                        isSelected
                          ? 'border-accent ring-1 ring-accent/40'
                          : 'border-border hover:border-border/80'
                      }`}
                      onClick={() => onOpen(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          onOpen(item);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className={`absolute left-1.5 top-1.5 z-10 flex h-4.5 w-4.5 items-center justify-center rounded-md border transition-colors ${
                          isSelected ? 'border-accent bg-accent text-white' : 'border-border bg-white/85'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggle(item.id);
                        }}
                        aria-label={isSelected ? 'Désélectionner' : 'Sélectionner'}
                      >
                        {isSelected && <CheckIcon size={12} />}
                      </button>

                      <SafeImage
                        src={item.previewUrl || item.url}
                        alt={item.filenameHint}
                        referrer={item.referrer || referrer}
                        captureTabId={sourceTabId}
                        captureCandidateId={item.origin === 'live-dom' ? item.id : undefined}
                        className={`${compact ? 'aspect-[3/4]' : 'aspect-[4/5]'} w-full object-contain bg-border/20 transition-transform duration-200 ease-out group-hover:scale-[1.025] group-focus-within:scale-[1.025]`}
                      />

                      <div className="border-t border-border/50 bg-white px-2 py-1.5">
                        <p className="truncate text-2xs font-medium text-ink" title={resolveMediaName(item)}>
                          {resolveMediaName(item)}
                        </p>
                        <p className="truncate text-2xs text-muted" title={formatMediaMeta(item)}>
                          {formatMediaMeta(item)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-[14px] bg-[rgba(247,249,252,0.78)] text-ink/70 shadow-[0_10px_24px_rgba(15,17,23,0.10)] backdrop-blur-md transition-all duration-200 hover:scale-[1.05] hover:bg-white hover:text-ink"
                        title="Télécharger l'image"
                        aria-label="Télécharger l'image"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadImage(item);
                        }}
                      >
                        <DownloadIcon size={13} />
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {renderCount < items.length && (
        <div className="pt-2 text-center text-[11px] text-muted">
          Chargement des vignettes… {renderCount}/{items.length}
        </div>
      )}
    </div>
  );
}
