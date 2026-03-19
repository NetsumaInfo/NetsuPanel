import type { UpscalePreviewState } from '@shared/types';
import { SafeImage } from './SafeImage';

interface UpscalePanelProps {
  enabled: boolean;
  backendLabel: string;
  preview: UpscalePreviewState | null;
  onToggle(enabled: boolean): void;
}

export function UpscalePanel({ enabled, backendLabel, preview, onToggle }: UpscalePanelProps) {
  return (
    <section className="surface p-3 space-y-3">
      {/* ─── Header with toggle ─── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Upscale waifu2x</h2>
          <p className="mt-0.5 text-2xs text-muted truncate" title={backendLabel}>{backendLabel}</p>
        </div>
        <label
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs"
          title="Activer l'upscale avant téléchargement"
        >
          <input
            type="checkbox"
            id="upscale-toggle"
            className="h-3.5 w-3.5 accent-accent"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {enabled ? 'Activé' : 'Désactivé'}
        </label>
      </div>

      {enabled && (
        <p className="rounded-lg bg-accentSoft px-2.5 py-1.5 text-2xs text-accent">
          Les images seront upscalées ×2 avant téléchargement. Peut rallonger le temps d'export.
        </p>
      )}

      {/* ─── Before/After comparison ─── */}
      {preview ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="compare-panel">
            <p className="bg-border/20 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              Avant
            </p>
            <SafeImage
              src={preview.originalUrl}
              alt="Original"
              referrer={preview.originalReferrer}
              className="h-32 w-full object-contain bg-border/20"
            />
          </div>
          <div className="compare-panel">
            <p className="bg-border/20 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              Après
            </p>
            {preview.loading ? (
              <div className="flex h-32 items-center justify-center bg-border/10 text-2xs text-muted gap-1.5">
                <span className="h-3 w-3 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
                Upscaling…
              </div>
            ) : preview.error ? (
              <div className="flex h-32 items-center justify-center bg-danger/5 px-2 text-center text-2xs text-danger">
                {preview.error}
              </div>
            ) : preview.upscaledUrl ? (
              <SafeImage
                src={preview.upscaledUrl}
                alt="Upscaled"
                className="h-32 w-full object-contain bg-border/20"
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-4 text-center text-2xs text-muted">
          Clique sur "⚡ Upscale aperçu" depuis un chapitre pour comparer avant/après.
        </div>
      )}
    </section>
  );
}
