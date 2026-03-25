import type { ButtonHTMLAttributes } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageCandidate, UpscalePreviewState } from '@shared/types';
import { formatMediaMeta, resolveMediaName } from '@app/services/mediaMeta';
import { SafeImage } from './SafeImage';
import { ChevronDownIcon, CompareIcon, DownloadIcon, XIcon } from './icons';

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
  onDownloadImage(candidate: ImageCandidate): void | Promise<void>;
}

interface ViewportBounds {
  width: number;
  height: number;
}

interface HandlePosition {
  x: number;
  y: number;
}

function clampIndex(index: number, total: number) {
  if (total === 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

function clampSplit(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clampHandleY(value: number) {
  return Math.max(8, Math.min(92, value));
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
  onDownloadImage,
}: ImageViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [split, setSplit] = useState(50);
  const [handleY, setHandleY] = useState(50);
  const [downloading, setDownloading] = useState(false);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds>({ width: 0, height: 0 });
  const compareRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const currentIndex = clampIndex(index, items.length);
  const currentItem = items[currentIndex];
  const previewMatches = preview?.sourceImageId === currentItem?.id;
  const headerMediaName = currentItem ? resolveMediaName(currentItem) : title;
  const headerMediaMeta = currentItem ? formatMediaMeta(currentItem) : '';

  const resolveHandlePosition = useCallback((clientX: number, clientY: number): HandlePosition | null => {
    const rect = compareRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clampSplit(((clientX - rect.left) / rect.width) * 100),
      y: clampHandleY(((clientY - rect.top) / rect.height) * 100),
    };
  }, []);

  const updateHandleFromPointer = useCallback((clientX: number, clientY: number) => {
    const next = resolveHandlePosition(clientX, clientY);
    if (!next) return;
    setSplit(next.x);
    setHandleY(next.y);
  }, [resolveHandlePosition]);

  useEffect(() => {
    if (!compareMode || !currentItem) return;
    if (previewMatches || preview?.loading) return;
    onRequestCompare(currentItem);
  }, [compareMode, currentItem, onRequestCompare, preview?.loading, previewMatches]);

  useEffect(() => {
    draggingRef.current = false;
    setHandleY(50);
  }, [currentItem?.id]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      updateHandleFromPointer(event.clientX, event.clientY);
    };

    const stopDragging = () => {
      draggingRef.current = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onNavigate(clampIndex(currentIndex - 1, items.length));
      if (event.key === 'ArrowRight') onNavigate(clampIndex(currentIndex + 1, items.length));
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(16, Number((value + 0.5).toFixed(2))));
      if (event.key === '-') setZoom((value) => Math.max(1, Number((value - 0.5).toFixed(2))));
      if (event.key === '0') setZoom(1);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [currentIndex, items.length, onClose, onNavigate, updateHandleFromPointer]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setViewportBounds((current) => {
        const next = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        if (current.width === next.width && current.height === next.height) {
          return current;
        }
        return next;
      });
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
      };
    }

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [currentItem?.id]);

  if (!currentItem) {
    return null;
  }

  const imageProps = {
    referrer,
    captureTabId: currentItem.origin === 'live-dom' ? sourceTabId : undefined,
    captureCandidateId: currentItem.origin === 'live-dom' ? currentItem.id : undefined,
    className: 'h-full w-full object-contain select-none',
  };

  const compareReady = Boolean(
    compareMode &&
      previewMatches &&
      preview?.upscaledUrl &&
      !preview.loading &&
      !preview.error
  );
  const compareUpscaledSrc = preview?.upscaledUrl ?? '';
  const compareStatus = compareMode
    ? previewMatches && preview?.error
      ? preview.error
      : compareReady
        ? null
        : 'Préparation upscale…'
    : null;
  const viewportWidth =
    viewportBounds.width ||
    (typeof window !== 'undefined' ? Math.max(window.innerWidth - 220, 320) : 900);
  const viewportHeight =
    viewportBounds.height ||
    (typeof window !== 'undefined' ? Math.max(window.innerHeight - 260, 320) : 640);
  const sourceWidth = currentItem.width > 0 ? currentItem.width : viewportWidth;
  const sourceHeight = currentItem.height > 0 ? currentItem.height : viewportHeight;
  const fitScale = Math.min((viewportWidth - 24) / sourceWidth, (viewportHeight - 24) / sourceHeight, 1);
  const frameStyle = {
    width: `${Math.max(1, Math.round(sourceWidth * Math.max(fitScale, 0.01) * zoom))}px`,
    height: `${Math.max(1, Math.round(sourceHeight * Math.max(fitScale, 0.01) * zoom))}px`,
  };
  const navigationButtonClass =
    'flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-ink shadow-lg transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 sm:h-12 sm:w-12';
  const overlayLabelClass =
    'pointer-events-none rounded-full bg-[rgba(247,249,252,0.78)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/78 shadow-[0_8px_18px_rgba(15,17,23,0.08)] backdrop-blur-md';
  const viewerHeightStyle = {
    height: 'min(80vh, calc(100vh - 220px))',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(244,245,247,0.50)] p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClose();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Fermer la visionneuse"
    >
      <div className="relative flex h-auto max-h-[94vh] w-full max-w-[1160px] flex-col overflow-visible rounded-[28px] border border-border bg-white shadow-[0_22px_60px_rgba(15,17,23,0.10)]">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink" title={headerMediaName}>{headerMediaName}</p>
            <p className="truncate text-[11px] text-muted" title={headerMediaMeta}>{headerMediaMeta}</p>
          </div>

          <div className="flex items-center gap-2">
            <ViewerButton iconOnly onClick={() => setZoom((value) => Math.max(1, Number((value - 0.5).toFixed(2))))}>-</ViewerButton>
            <span className="min-w-[44px] text-center text-[11px] font-medium text-muted">{Math.round(zoom * 100)}%</span>
            <ViewerButton iconOnly onClick={() => setZoom((value) => Math.min(16, Number((value + 0.5).toFixed(2))))}>+</ViewerButton>
            <ViewerButton
              iconOnly
              aria-label={compareMode ? 'Désactiver la comparaison' : 'Activer la comparaison'}
              title={compareMode ? 'Normal' : 'Comparer'}
              onClick={() => setCompareMode((value) => !value)}
            >
              <CompareIcon size={15} />
            </ViewerButton>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-white text-ink shadow-sm transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Télécharger l'image"
              title="Télécharger l'image"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  await onDownloadImage(currentItem);
                } finally {
                  setDownloading(false);
                }
              }}
            >
              <DownloadIcon size={15} />
            </button>
            <ViewerButton iconOnly aria-label="Fermer" title="Fermer" onClick={onClose}>
              <XIcon size={15} />
            </ViewerButton>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-[#f4f5f7] px-4 pb-4 pt-3">
          <div className="relative flex h-full items-center justify-center px-11 sm:px-14">
            <button
              type="button"
              className={`${navigationButtonClass} absolute left-0 top-1/2 z-20 -translate-y-1/2`}
              onClick={() => onNavigate(clampIndex(currentIndex - 1, items.length))}
              disabled={currentIndex === 0}
              aria-label="Image précédente"
            >
              <ChevronDownIcon size={18} className="rotate-90" />
            </button>

            <div className="relative w-full overflow-hidden rounded-[24px] border border-border bg-white shadow-inner" style={viewerHeightStyle}>
              {compareMode && (
                <div
                  className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center justify-between px-4"
                  style={{ width: frameStyle.width, maxWidth: 'calc(100% - 32px)' }}
                >
                  <span className={overlayLabelClass}>Avant</span>
                  <span className={overlayLabelClass}>Après</span>
                </div>
              )}

              <div ref={viewportRef} className="flex h-full w-full items-center justify-center overflow-auto p-2 sm:p-4">
                <div
                  ref={compareRef}
                  className="relative shrink-0 overflow-hidden rounded-[20px] bg-white"
                  style={frameStyle}
                  onPointerDown={(event) => {
                    if (!compareReady || event.button !== 0) return;
                    if ((event.target as HTMLElement).closest('button')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    updateHandleFromPointer(event.clientX, event.clientY);
                  }}
                  onContextMenu={(event) => {
                    if (!compareReady) return;
                    return;
                  }}
                >
                  {compareReady ? (
                    <>
                      <SafeImage
                        src={compareUpscaledSrc}
                        alt={`${currentItem.filenameHint} upscaled`}
                        className="absolute inset-0 h-full w-full object-contain select-none"
                      />
                      <div
                        className="pointer-events-none absolute inset-0 overflow-hidden"
                        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                      >
                        <SafeImage
                          src={currentItem.previewUrl || currentItem.url}
                          alt={currentItem.filenameHint}
                          {...imageProps}
                        />
                      </div>
                      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: `${split}%` }}>
                        <div className="absolute inset-y-0 -ml-[1.5px] w-[3px] rounded-full bg-white/96 shadow-[0_0_0_1px_rgba(15,17,23,0.08),0_0_18px_rgba(255,255,255,0.86)]" />
                      </div>
                      <button
                        type="button"
                        className="absolute z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-[rgba(247,249,252,0.82)] text-ink shadow-[0_14px_34px_rgba(15,17,23,0.16)] backdrop-blur-md transition-transform duration-150 hover:scale-[1.04]"
                        style={{ left: `${split}%`, top: `${handleY}%` }}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.stopPropagation();
                          event.preventDefault();
                          draggingRef.current = true;
                          updateHandleFromPointer(event.clientX, event.clientY);
                        }}
                        aria-label="Déplacer le comparateur"
                      >
                        <span className="flex items-center gap-1">
                          <span className="h-4 w-[2px] rounded-full bg-ink/45" />
                          <span className="h-4 w-[2px] rounded-full bg-ink/45" />
                        </span>
                      </button>
                    </>
                  ) : (
                    <SafeImage
                      src={currentItem.previewUrl || currentItem.url}
                      alt={currentItem.filenameHint}
                      {...imageProps}
                    />
                  )}

                  {compareStatus && (
                    <span
                      className={`pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm ${
                        previewMatches && preview?.error
                          ? 'bg-danger/12 text-danger'
                          : 'bg-white/78 text-ink'
                      }`}
                    >
                      {compareStatus}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              className={`${navigationButtonClass} absolute right-0 top-1/2 z-20 -translate-y-1/2`}
              onClick={() => onNavigate(clampIndex(currentIndex + 1, items.length))}
              disabled={currentIndex === items.length - 1}
              aria-label="Image suivante"
            >
              <ChevronDownIcon size={18} className="-rotate-90" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
