import type {
  AppMode,
  ArchiveFormat,
  ChapterItem,
  DownloadJobState,
  UpscalePreviewState,
} from '@shared/types';
import { ArchiveFormatSelect } from './ArchiveFormatSelect';
import { BrandLogo } from './BrandLogo';
import { ModeSwitch } from './ModeSwitch';
import { StatusStrip } from './StatusStrip';
import { UpscalePanel } from './UpscalePanel';
import { ArchiveIcon, DownloadIcon } from './icons';

interface AppSidebarProps {
  mode: AppMode;
  archiveFormat: ArchiveFormat;
  currentChapter?: ChapterItem;
  chapterCount: number;
  selectedGeneralCount: number;
  activity: DownloadJobState;
  upscaleEnabled: boolean;
  backendLabel: string;
  preview: UpscalePreviewState | null;
  onModeChange(mode: AppMode): void;
  onArchiveFormatChange(format: ArchiveFormat): void;
  onUpscaleToggle(enabled: boolean): void;
  onDownloadCurrent(): void;
  onDownloadAll(): void;
  onDownloadGeneral(): void;
}

export function AppSidebar({
  mode,
  archiveFormat,
  currentChapter,
  chapterCount,
  selectedGeneralCount,
  activity,
  upscaleEnabled,
  backendLabel,
  preview,
  onModeChange,
  onArchiveFormatChange,
  onUpscaleToggle,
  onDownloadCurrent,
  onDownloadAll,
  onDownloadGeneral,
}: AppSidebarProps) {
  const showStatus = Boolean(activity.error) || activity.active;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-[18px] border border-border bg-white p-3 shadow-sm">
        <BrandLogo compact />
        <div className="mt-2">
          <ModeSwitch value={mode} onChange={onModeChange} />
        </div>
      </div>

      <div className="rounded-[18px] border border-border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Format</span>
          <div className="min-w-[104px]">
            <ArchiveFormatSelect value={archiveFormat} onChange={onArchiveFormatChange} />
          </div>
        </div>

        {mode === 'manga' ? (
          <div className="mt-2 grid gap-1.5">
            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              disabled={!currentChapter}
              onClick={onDownloadCurrent}
            >
              <DownloadIcon size={16} />
              Ch.
            </button>
            <button
              type="button"
              className="btn w-full justify-center"
              disabled={chapterCount === 0}
              onClick={onDownloadAll}
            >
              <ArchiveIcon size={16} />
              Série {chapterCount}
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              disabled={selectedGeneralCount === 0}
              onClick={onDownloadGeneral}
            >
              <DownloadIcon size={16} />
              Export {selectedGeneralCount}
            </button>
          </div>
        )}
      </div>

      {showStatus && <StatusStrip message={activity.message} progress={activity.progress} error={activity.error} />}

      <UpscalePanel
        enabled={upscaleEnabled}
        backendLabel={backendLabel}
        preview={preview}
        onToggle={onUpscaleToggle}
      />
    </div>
  );
}
