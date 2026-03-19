import type { ImageCandidate } from '@shared/types';
import { SafeImage } from './SafeImage';
import { CheckIcon, DownloadIcon, ImageIcon, LightningIcon } from './icons';

interface GeneralGridProps {
  items: ImageCandidate[];
  selected: Record<string, boolean>;
  thumbnailSize: number;
  compact: boolean;
  referrer?: string;
  sourceTabId?: number;
  onToggle(imageId: string): void;
  onSelectAll(checked: boolean): void;
  onDownload(): void;
  onCompare(candidate: ImageCandidate): void;
}

export function GeneralGrid({
  items,
  selected,
  thumbnailSize,
  compact,
  referrer,
  sourceTabId,
  onToggle,
  onSelectAll,
  onDownload,
  onCompare,
}: GeneralGridProps) {
  const selectedCount = items.filter((item) => selected[item.id]).length;
  const allSelected = selectedCount === items.length && items.length > 0;

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
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-8 text-xs text-muted">
          Aucune image détectée sur cette page.
        </div>
      ) : (
        <div
          className={`grid ${compact ? 'gap-1.5' : 'gap-2'}`}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))` }}
        >
          {items.map((item) => {
            const isSelected = Boolean(selected[item.id]);
            return (
              <article
                key={item.id}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all ${
                  isSelected
                    ? 'border-accent ring-1 ring-accent/40'
                    : 'border-border hover:border-border/80'
                }`}
                onClick={() => onToggle(item.id)}
                role="checkbox"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    onToggle(item.id);
                  }
                }}
              >
                {/* Checkbox overlay */}
                <div className={`absolute left-1.5 top-1.5 z-10 flex h-4.5 w-4.5 items-center justify-center rounded-md border transition-colors ${
                  isSelected ? 'border-accent bg-accent text-white' : 'border-border bg-white/85'
                }`}>
                  {isSelected && <CheckIcon size={12} />}
                </div>

                {/* Image */}
                <SafeImage
                  src={item.previewUrl || item.url}
                  alt={item.filenameHint}
                  referrer={referrer}
                  captureTabId={item.origin === 'live-dom' ? sourceTabId : undefined}
                  captureCandidateId={item.origin === 'live-dom' ? item.id : undefined}
                  className={`${compact ? 'aspect-[3/4]' : 'aspect-[4/5]'} w-full object-contain bg-border/20`}
                />

                {/* Footer */}
                <div className="border-t border-border/50 bg-white px-2 py-1.5">
                  <p className="truncate text-2xs text-muted" title={item.filenameHint}>
                    {item.width > 0 ? `${item.width}×${item.height}` : item.filenameHint}
                  </p>
                </div>

                {/* Upscale compare button */}
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/75"
                  title="Aperçu upscale"
                  onClick={(e) => { e.stopPropagation(); onCompare(item); }}
                >
                  <LightningIcon size={12} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
