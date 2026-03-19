import { useEffect, useMemo, useState } from 'react';
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
  const currentIndex = clampIndex(index, items.length);
  const currentItem = items[currentIndex];
  const previewMatches = preview?.sourceImageId === currentItem?.id;

  useEffect(() => {
    setZoom(1);
    setCompareMode(false);
  }, [currentIndex, title]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onNavigate(clampIndex(currentIndex - 1, items.length));
      if (event.key === 'ArrowRight') onNavigate(clampIndex(currentIndex + 1, items.length));
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))));
      if (event.key === '-') setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentIndex, items.length, onClose, onNavigate]);

  const content = useMemo(() => {
    if (!currentItem) return null;

    const baseImage = (
      <SafeImage
        src={currentItem.previewUrl || currentItem.url}
        alt={currentItem.filenameHint}
        referrer={referrer}
        captureTabId={currentItem.origin === 'live-dom' ? sourceTabId : undefined}
        captureCandidateId={currentItem.origin === 'live-dom' ? currentItem.id : undefined}
        className="max-h-[78vh] w-auto max-w-full object-contain"
      />
    );

    if (!compareMode || !previewMatches) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center overflow-auto rounded-[20px] bg-black/70 p-4">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
            {baseImage}
          </div>
        </div>
      );
    }

    return (
      <div className="grid min-h-[60vh] gap-3 rounded-[20px] bg-black/70 p-4 lg:grid-cols-2">
        <div className="overflow-auto rounded-[16px] bg-black/40 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Original</p>
          <div className="flex items-center justify-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
            {baseImage}
          </div>
        </div>
        <div className="overflow-auto rounded-[16px] bg-black/40 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Upscale</p>
          {preview?.loading ? (
            <div className="flex min-h-[50vh] items-center justify-center text-sm text-white/70">Upscaling…</div>
          ) : preview?.error ? (
            <div className="flex min-h-[50vh] items-center justify-center text-center text-sm text-danger">
              {preview.error}
            </div>
          ) : preview?.upscaledUrl ? (
            <div className="flex items-center justify-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
              <SafeImage
                src={preview.upscaledUrl}
                alt={`${currentItem.filenameHint} upscaled`}
                className="max-h-[78vh] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [compareMode, currentItem, preview, previewMatches, referrer, sourceTabId, zoom]);

  if (!currentItem) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]">
      <div className="flex h-full max-h-[92vh] w-full max-w-[1400px] flex-col gap-3 rounded-[24px] border border-white/10 bg-[#111318] p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-[11px] text-white/60">
              {currentIndex + 1}/{items.length}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))}>-</button>
            <span className="text-[11px] text-white/60">{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn" onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))}>+</button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setCompareMode(true);
                onRequestCompare(currentItem);
              }}
            >
              <LightningIcon size={14} />
              Comparer
            </button>
            {previewMatches && (
              <button type="button" className="btn" onClick={() => setCompareMode((value) => !value)}>
                {compareMode ? 'Simple' : 'Split'}
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>Fermer</button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn"
            onClick={() => onNavigate(clampIndex(currentIndex - 1, items.length))}
            disabled={currentIndex === 0}
          >
            <ChevronDownIcon size={14} className="rotate-90" />
            Préc.
          </button>
          <a className="btn" href={currentItem.url} target="_blank" rel="noreferrer">
            <DownloadIcon size={14} />
            Ouvrir source
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => onNavigate(clampIndex(currentIndex + 1, items.length))}
            disabled={currentIndex === items.length - 1}
          >
            Suiv.
            <ChevronDownIcon size={14} className="-rotate-90" />
          </button>
        </div>

        {content}
      </div>
    </div>
  );
}
