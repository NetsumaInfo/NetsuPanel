import type { AppMode, UpscalePreviewState } from '@shared/types';
import { getBackendPriority, getRealesrganPreset } from '@core/upscale/realesrganModels';
import { SafeImage } from './SafeImage';
import { LightningIcon } from './icons';

interface UpscalePanelProps {
  mode: AppMode;
  enabled: boolean;
  backendLabel: string;
  preview: UpscalePreviewState | null;
  onToggle(enabled: boolean): void;
}

function formatDenoiseLabel(value?: string): string {
  switch (value) {
    case 'conservative':
      return 'Denoise doux';
    case 'no-denoise':
      return 'Sans denoise';
    case 'denoise1x':
      return 'Denoise 1x';
    case 'denoise2x':
      return 'Denoise 2x';
    case 'denoise3x':
      return 'Denoise 3x';
    default:
      return 'Auto';
  }
}

function formatBackendLabel(value: string): string {
  switch (value) {
    case 'webgpu':
      return 'WebGPU';
    case 'webgl':
      return 'WebGL';
    case 'cpu':
      return 'CPU';
    default:
      return value;
  }
}

export function UpscalePanel({ mode, enabled, backendLabel, preview, onToggle }: UpscalePanelProps) {
  const preset = getRealesrganPreset(mode);
  const supportedBackends = getBackendPriority().map(formatBackendLabel).join(' / ');
  const parameterPills = [
    preset.label,
    `Échelle x${preset.factor}`,
    formatDenoiseLabel(preset.denoise),
    `Tuiles ${preset.tileSizes[0]} → ${preset.tileSizes[preset.tileSizes.length - 1]}`,
  ];

  return (
    <section className="surface space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-border/50 text-ink">
            <LightningIcon size={14} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-ink">Upscale</h2>
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

      <div className="rounded-[14px] border border-border/70 bg-[#f8f9fb] px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Paramètres</span>
          <span className="text-[10px] text-muted">{mode === 'manga' ? 'Mode manga' : 'Mode général'}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {parameterPills.map((item) => (
            <span
              key={item}
              className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-ink shadow-[0_1px_3px_rgba(15,17,23,0.05)]"
            >
              {item}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted">
          Backends auto: {supportedBackends}
        </p>
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
