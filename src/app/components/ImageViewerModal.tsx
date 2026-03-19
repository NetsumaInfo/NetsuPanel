import type { ButtonHTMLAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ImageCandidate, UpscalePreviewState } from '@shared/types';
import { SafeImage } from './SafeImage';
import { ChevronDownIcon, DownloadIcon, LightningIcon } from './icons';

interface ImageViewerModalProps {
  title: string;
  items: ImageCandidate[];
  index: number;
  referrer?: string;
  sourceTabId?: number;
  preview: UpscalePreviewState | null;
  onClose(): void;
  onNavigate(index: number): void;
  onRequestCompare(candidate: ImageCandidate): void;
}

function clampIndex(index: number, total: number) {
  if (total === 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

function clampSplit(value: number) {
  return Math.max(10, Math.min(90, value));
}

function ViewerButton({
  children,
  iconOnly = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { iconOnly?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white text-ink shadow-sm transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        iconOnly ? 'h-9 w-9' : 'h-9 px-3'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ImageViewerModal({
  title,
  items,
  index,
  referrer,
  sourceTabId,
  preview,
  onClose,
  onNavigate,
  onRequestCompare,
}: ImageViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [split, setSplit] = useState(50);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const currentIndex = clampIndex(index, items.length);
  const currentItem = items[currentIndex];
  const previewMatches = preview?.sourceImageId === currentItem?.id;

  useEffect(() => {
    if (compareMode && currentItem) {
      onRequestCompare(currentItem);
    }
  }, [compareMode, currentItem, onRequestCompare]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || !compareRef.current) return;
      const rect = compareRef.current.getBoundingClientRect();
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setSplit(clampSplit(next));
    };

    const onPointerUp = () => {
      draggingRef.current = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onNavigate(clampIndex(currentIndex - 1, items.length));
      if (event.key === 'ArrowRight') onNavigate(clampIndex(currentIndex + 1, items.length));
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(8, Number((value + 0.5).toFixed(2))));
      if (event.key === '-') setZoom((value) => Math.max(1, Number((value - 0.5).toFixed(2))));
      if (event.key === '0') setZoom(1);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [currentIndex, items.length, onClose, onNavigate]);

  if (!currentItem) {
    return null;
  }

  const imageProps = {
    referrer,
    captureTabId: currentItem.origin === 'live-dom' ? sourceTabId : undefined,
    captureCandidateId: currentItem.origin === 'live-dom' ? currentItem.id : undefined,
    className: 'max-h-[76vh] w-auto max-w-none object-contain select-none',
  };

  const compareAvailable = compareMode && previewMatches;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(244,245,247,0.82)] p-3 backdrop-blur-md">
      <div className="relative flex h-full max-h-[94vh] w-full max-w-[1520px] flex-col overflow-hidden rounded-[28px] border border-border bg-white shadow-[0_30px_90px_rgba(15,17,23,0.14)]">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
            <p className="text-[11px] text-muted">
              {currentIndex + 1}/{items.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ViewerButton iconOnly onClick={() => setZoom((value) => Math.max(1, Number((value - 0.5).toFixed(2))))}>-</ViewerButton>
            <span className="min-w-[44px] text-center text-[11px] font-medium text-muted">{Math.round(zoom * 100)}%</span>
            <ViewerButton iconOnly onClick={() => setZoom((value) => Math.min(8, Number((value + 0.5).toFixed(2))))}>+</ViewerButton>
            <ViewerButton
              onClick={() => setCompareMode((value) => !value)}
            >
              <LightningIcon size={14} />
              {compareMode ? 'Normal' : 'Comparer'}
            </ViewerButton>
            <a
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-ink shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
              href={currentItem.url}
              download={currentItem.filenameHint || `page-${currentIndex + 1}`}
              aria-label="Télécharger l'image"
              title="Télécharger l'image"
            >
              <DownloadIcon size={15} />
            </a>
            <ViewerButton onClick={onClose}>Fermer</ViewerButton>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f4f5f7]">
          <button
            type="button"
            className="absolute left-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/92 text-ink shadow-lg transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => onNavigate(clampIndex(currentIndex - 1, items.length))}
            disabled={currentIndex === 0}
            aria-label="Image précédente"
          >
            <ChevronDownIcon size={18} className="rotate-90" />
          </button>

          <button
            type="button"
            className="absolute right-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white/92 text-ink shadow-lg transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => onNavigate(clampIndex(currentIndex + 1, items.length))}
            disabled={currentIndex === items.length - 1}
            aria-label="Image suivante"
          >
            <ChevronDownIcon size={18} className="-rotate-90" />
          </button>

          <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
            {compareMode && (
              <div className="rounded-full border border-border bg-white/92 px-3 py-1 text-[11px] font-medium text-muted shadow-sm">
                {compareAvailable ? 'Avant / Après' : preview?.loading ? 'Préparation compare…' : 'Chargement upscale…'}
              </div>
            )}
          </div>

          <div className="flex h-full items-center justify-center p-8">
            {!compareMode || !previewMatches ? (
              <div className="flex h-full w-full items-center justify-center overflow-auto rounded-[24px] border border-border bg-white p-6 shadow-inner">
                <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
                  <SafeImage
                    src={currentItem.previewUrl || currentItem.url}
                    alt={currentItem.filenameHint}
                    {...imageProps}
                  />
                </div>
              </div>
            ) : preview?.error ? (
              <div className="flex h-full w-full items-center justify-center rounded-[24px] border border-danger/20 bg-white p-6 text-center text-sm text-danger">
                {preview.error}
              </div>
            ) : preview?.loading || !preview?.upscaledUrl ? (
              <div className="flex h-full w-full items-center justify-center rounded-[24px] border border-border bg-white p-6 text-sm text-muted">
                Upscaling…
              </div>
            ) : (
              <div
                ref={compareRef}
                className="relative flex h-full w-full items-center justify-center overflow-auto rounded-[24px] border border-border bg-white p-6 shadow-inner"
                onPointerDown={(event) => {
                  draggingRef.current = true;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const next = ((event.clientX - rect.left) / rect.width) * 100;
                  setSplit(clampSplit(next));
                }}
              >
                <div
                  className="grid place-items-center"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                >
                  <div className="col-start-1 row-start-1">
                    <SafeImage
                      src={preview.upscaledUrl}
                      alt={`${currentItem.filenameHint} upscaled`}
                      className="max-h-[76vh] w-auto max-w-none object-contain select-none"
                    />
                  </div>
                  <div
                    className="col-start-1 row-start-1 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                  >
                    <SafeImage
                      src={currentItem.previewUrl || currentItem.url}
                      alt={currentItem.filenameHint}
                      {...imageProps}
                    />
                  </div>
                </div>

                <div
                  className="pointer-events-none absolute inset-y-8 z-10"
                  style={{ left: `${split}%` }}
                >
                  <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,17,23,0.08)]" />
                  <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-white text-ink shadow-lg">
                    <span className="text-[10px] font-semibold">↔</span>
                  </div>
                </div>

                <div className="pointer-events-none absolute left-8 top-8 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-medium text-ink shadow-sm">
                  Avant
                </div>
                <div className="pointer-events-none absolute right-8 top-8 rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-medium text-ink shadow-sm">
                  Après
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
