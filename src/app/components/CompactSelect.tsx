import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from './icons';

interface CompactSelectOption<T extends string> {
  value: T;
  label: string;
}

interface CompactSelectProps<T extends string> {
  value: T;
  options: CompactSelectOption<T>[];
  onChange(value: T): void;
}

export function CompactSelect<T extends string>({ value, options, onChange }: CompactSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const currentLabel = options.find((option) => option.value === value)?.label ?? value;

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
        <span>{currentLabel}</span>
        <ChevronDownIcon
          size={14}
          className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-border bg-white p-1 shadow-[0_14px_40px_rgba(15,17,23,0.12)]"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${
                  isSelected ? 'bg-ink text-white' : 'text-ink hover:bg-border/40'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isSelected && <CheckIcon size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
