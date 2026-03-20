import type { AppMode, UpscaleBackendPreference, UpscaleDenoiseLevel, UpscaleSettings, UpscalePreviewState } from '@shared/types';
import { getBackendPriority, getRealesrganPreset } from '@core/upscale/realesrganModels';
import { CompactSelect } from './CompactSelect';
import { SafeImage } from './SafeImage';
import { LightningIcon } from './icons';

interface UpscalePanelProps {
  mode: AppMode;
  enabled: boolean;
  settings: UpscaleSettings;
  backendLabel: string;
  preview: UpscalePreviewState | null;
  onToggle(enabled: boolean): void;
  onSettingsChange(settings: Partial<UpscaleSettings>): void;
}

const DENOISE_OPTIONS: Array<{ value: UpscaleDenoiseLevel; label: string }> = [
  { value: 'conservative', label: 'Denoise doux' },
  { value: 'no-denoise', label: 'Sans denoise' },
  { value: 'denoise1x', label: 'Denoise 1x' },
  { value: 'denoise2x', label: 'Denoise 2x' },
  { value: 'denoise3x', label: 'Denoise 3x' },
];

const BACKEND_OPTIONS: Array<{ value: UpscaleBackendPreference; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'webgpu', label: 'WebGPU' },
  { value: 'webgl', label: 'WebGL' },
  { value: 'cpu', label: 'CPU' },
];

const FACTOR_OPTIONS: Array<{ value: '2' | '4'; label: string }> = [
  { value: '2', label: 'Échelle x2' },
  { value: '4', label: 'Échelle x4' },
];

function formatBackendList(): string {
  return getBackendPriority()
    .map((backend) => BACKEND_OPTIONS.find((option) => option.value === backend)?.label ?? backend)
    .join(' / ');
}

export function UpscalePanel({
  mode,
  enabled,
  settings,
  backendLabel,
  preview,
  onToggle,
  onSettingsChange,
}: UpscalePanelProps) {
  const preset = getRealesrganPreset(mode, settings);
  const factorValue = String(settings.factor) as '2' | '4';

  return (
    <section className="surface space-y-2.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-border/45 text-ink">
            <LightningIcon size={14} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink">Upscale</h2>
            <p className="truncate text-2xs text-muted" title={backendLabel}>{backendLabel}</p>
          </div>
        </div>
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink shadow-sm"
          title="Activer l'upscale avant téléchargement"
        >
          <input
            type="checkbox"
            id="upscale-toggle"
            className="h-3.5 w-3.5 accent-accent"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>

      <div className="rounded-[16px] border border-border/75 bg-[#f8f9fb] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Réglages</span>
          <span className="text-[10px] text-muted">{mode === 'manga' ? 'Mode manga' : 'Mode général'}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Échelle</span>
            <CompactSelect
              value={factorValue}
              options={FACTOR_OPTIONS}
              onChange={(value) => onSettingsChange({ factor: Number(value) as 2 | 4 })}
            />
          </div>

          <div className="grid gap-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Denoise</span>
            <CompactSelect
              value={settings.denoise}
              options={DENOISE_OPTIONS}
              onChange={(value) => onSettingsChange({ denoise: value })}
            />
          </div>

          <div className="grid gap-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Backend</span>
            <CompactSelect
              value={settings.preferredBackend}
              options={BACKEND_OPTIONS}
              onChange={(value) => onSettingsChange({ preferredBackend: value })}
            />
          </div>

          <div className="rounded-xl bg-white px-3 py-2 shadow-[0_1px_4px_rgba(15,17,23,0.05)]">
            <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Modèle</span>
            <span className="mt-1 block text-[11px] font-semibold text-ink">{preset.label}</span>
            <span className="mt-1 block text-[10px] text-muted">Tuiles auto: {preset.tileSizes[0]} → {preset.tileSizes[preset.tileSizes.length - 1]}</span>
          </div>
        </div>

        <p className="mt-2 text-[10px] text-muted">
          Fallback auto disponible: {formatBackendList()}
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
