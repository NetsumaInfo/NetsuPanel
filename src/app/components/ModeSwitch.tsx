import type { AppMode } from '@shared/types';

interface ModeSwitchProps {
  value: AppMode;
  onChange(mode: AppMode): void;
}

export function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-border/30 p-0.5"
      role="group"
      aria-label="Mode de téléchargement"
    >
      <button
        type="button"
        id="mode-manga"
        aria-label="Mode Manga"
        className={`mode-btn ${value === 'manga' ? 'mode-btn-active' : 'mode-btn-inactive'}`}
        onClick={() => onChange('manga')}
        aria-pressed={value === 'manga'}
      >
        📖 Manga
      </button>
      <button
        type="button"
        id="mode-general"
        aria-label="Mode Général"
        className={`mode-btn ${value === 'general' ? 'mode-btn-active' : 'mode-btn-inactive'}`}
        onClick={() => onChange('general')}
        aria-pressed={value === 'general'}
      >
        🖼 Général
      </button>
    </div>
  );
}
