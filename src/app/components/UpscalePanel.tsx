import type { UpscalePreviewState } from '@shared/types';
import { SafeImage } from './SafeImage';
import { LightningIcon } from './icons';

interface UpscalePanelProps {
  enabled: boolean;
  backendLabel: string;
  preview: UpscalePreviewState | null;
  onToggle(enabled: boolean): void;
}

export function UpscalePanel({ enabled, backendLabel, preview, onToggle }: UpscalePanelProps) {
  return (
    <section className="surface space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-border/50 text-ink">
            <LightningIcon size={14} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-ink">Real-CUGAN</h2>
            {(enabled || preview) && (
              <p className="truncate text-2xs text-muted" title={backendLabel}>{backendLabel}</p>
            )}
          </div>
        </div>
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1.5 text-[11px] font-medium"
          title="Activer l'upscale avant téléchargement"
        >
          <input
            type="checkbox"
            id="upscale-toggle"
            className="h-3 w-3 accent-accent"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>

      {preview ? (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="compare-panel">
            <p className="bg-border/20 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              Avant
            </p>
            <SafeImage
              src={preview.originalUrl}
              alt="Original"
              referrer={preview.originalReferrer}
              className="h-24 w-full object-contain bg-border/20"
            />
          </div>
          <div className="compare-panel">
            <p className="bg-border/20 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              Après
            </p>
            {preview.loading ? (
              <div className="flex h-24 items-center justify-center gap-1.5 bg-border/10 text-2xs text-muted">
                <span className="h-3 w-3 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
                Upscaling…
              </div>
            ) : preview.error ? (
              <div className="flex h-24 items-center justify-center bg-danger/5 px-2 text-center text-2xs text-danger">
                {preview.error}
              </div>
            ) : preview.upscaledUrl ? (
              <SafeImage
                src={preview.upscaledUrl}
                alt="Upscaled"
                className="h-24 w-full object-contain bg-border/20"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
