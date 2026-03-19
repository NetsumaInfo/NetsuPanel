import type { AppMode } from '@shared/types';
import { BookIcon, GridIcon } from './icons';

interface ModeSwitchProps {
  value: AppMode;
  onChange(mode: AppMode): void;
}

export function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-[14px] border border-border bg-white p-1"
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
        <BookIcon size={14} />
        <span className="block text-left text-[11px] font-semibold">Manga</span>
      </button>
      <button
        type="button"
        id="mode-general"
        aria-label="Mode Général"
        className={`mode-btn ${value === 'general' ? 'mode-btn-active' : 'mode-btn-inactive'}`}
        onClick={() => onChange('general')}
        aria-pressed={value === 'general'}
      >
        <GridIcon size={14} />
        <span className="block text-left text-[11px] font-semibold">Général</span>
      </button>
    </div>
  );
}
