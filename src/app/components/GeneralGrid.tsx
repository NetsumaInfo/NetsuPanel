import type { ImageCandidate } from '@shared/types';
import { SafeImage } from './SafeImage';

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
      {/* ─── Toolbar ─── */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Tout sélectionner
          </label>
          <span className="text-2xs text-muted">
            {selectedCount}/{items.length}
          </span>
        </div>
        <button
          type="button"
          id="general-download-btn"
          className="btn btn-primary btn-sm"
          disabled={selectedCount === 0}
          onClick={onDownload}
        >
          ↓ Télécharger ({selectedCount})
        </button>
      </div>

      {/* ─── Grid ─── */}
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-10 text-xs text-muted">
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
                <div className={`absolute left-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                  isSelected ? 'border-accent bg-accent' : 'border-border bg-white/80'
                }`}>
                  {isSelected && <span className="text-2xs text-white leading-none">✓</span>}
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
                <div className="px-1.5 py-1 border-t border-border/50 bg-white">
                  <p className="truncate text-2xs text-muted" title={item.filenameHint}>
                    {item.width > 0 ? `${item.width}×${item.height}` : item.filenameHint}
                  </p>
                </div>

                {/* Upscale compare button */}
                <button
                  type="button"
                  className="absolute right-1 top-1 z-10 rounded bg-black/50 px-1 py-0.5 text-2xs text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
                  title="Aperçu upscale"
                  onClick={(e) => { e.stopPropagation(); onCompare(item); }}
                >
                  ⚡
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
