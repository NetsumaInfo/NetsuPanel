import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ArchiveFormat } from '@shared/types';
import { ARCHIVE_FORMAT_PRESETS, getArchiveFormatPreset } from '@core/download/archiveFormats';
import { CheckIcon, ChevronDownIcon } from './icons';

interface ArchiveFormatSelectProps {
  value: ArchiveFormat;
  onChange(format: ArchiveFormat): void;
}

export function ArchiveFormatSelect({ value, onChange }: ArchiveFormatSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const selectedPreset = useMemo(() => getArchiveFormatPreset(value), [value]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink transition-colors hover:border-ink/20"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedPreset.shortLabel}</span>
        <ChevronDownIcon
          size={14}
          className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Format d'archive"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-border bg-white p-1 shadow-[0_14px_40px_rgba(15,17,23,0.12)]"
        >
          {ARCHIVE_FORMAT_PRESETS.map((preset) => {
            const isSelected = preset.value === value;
            return (
              <button
                key={preset.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${
                  isSelected ? 'bg-ink text-white' : 'text-ink hover:bg-border/40'
                }`}
                onClick={() => {
                  onChange(preset.value);
                  setOpen(false);
                }}
              >
                <span>{preset.shortLabel}</span>
                {isSelected && <CheckIcon size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
