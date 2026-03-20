import type {
  AppMode,
  ArchiveFormat,
  ChapterItem,
  DownloadJobState,
  UpscaleSettings,
  UpscalePreviewState,
} from '@shared/types';
import {
  ARCHIVE_CONTAINER_OPTIONS,
  ARCHIVE_IMAGE_FORMAT_OPTIONS,
  resolveArchiveFormat,
  splitArchiveFormat,
} from '@core/download/archiveFormats';
import { CompactSelect } from './CompactSelect';
import { StatusStrip } from './StatusStrip';
import { UpscalePanel } from './UpscalePanel';
import { ArchiveIcon, DownloadIcon, ImageIcon } from './icons';

interface AppSidebarProps {
  archiveFormat: ArchiveFormat;
  currentChapter?: ChapterItem;
  chapterCount: number;
  selectedGeneralCount: number;
  activity: DownloadJobState;
  mode: AppMode;
  upscaleEnabled: boolean;
  settings: UpscaleSettings;
  backendLabel: string;
  preview: UpscalePreviewState | null;
  onArchiveFormatChange(format: ArchiveFormat): void;
  onUpscaleToggle(enabled: boolean): void;
  onUpscaleSettingsChange(mode: AppMode, settings: Partial<UpscaleSettings>): void;
  onDownloadCurrent(): void;
  onDownloadAll(): void;
  onDownloadGeneral(): void;
}

export function AppSidebar({
  archiveFormat,
  currentChapter,
  chapterCount,
  selectedGeneralCount,
  activity,
  mode,
  upscaleEnabled,
  settings,
  backendLabel,
  preview,
  onArchiveFormatChange,
  onUpscaleToggle,
  onUpscaleSettingsChange,
  onDownloadCurrent,
  onDownloadAll,
  onDownloadGeneral,
}: AppSidebarProps) {
  const showStatus = Boolean(activity.error) || activity.active;
  const { container, imageFormat } = splitArchiveFormat(archiveFormat);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="rounded-[18px] border border-border bg-white p-3 shadow-sm">
        <div className="grid gap-2">
          <div className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Export</span>
            <CompactSelect
              value={imageFormat}
              options={ARCHIVE_IMAGE_FORMAT_OPTIONS}
              onChange={(nextImageFormat) => onArchiveFormatChange(resolveArchiveFormat(container, nextImageFormat))}
            />
          </div>

          <div className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Archive</span>
            <CompactSelect
              value={container}
              options={ARCHIVE_CONTAINER_OPTIONS}
              onChange={(nextContainer) => onArchiveFormatChange(resolveArchiveFormat(nextContainer, imageFormat))}
            />
          </div>

          <div className="mt-1 grid gap-1.5">
            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              disabled={!currentChapter}
              onClick={onDownloadCurrent}
            >
              <DownloadIcon size={16} />
              Chapitre
            </button>
            <button
              type="button"
              className="btn w-full justify-center"
              disabled={chapterCount === 0}
              onClick={onDownloadAll}
            >
              <ArchiveIcon size={16} />
              Série
            </button>
            <button
              type="button"
              className="btn w-full justify-center"
              disabled={selectedGeneralCount === 0}
              onClick={onDownloadGeneral}
            >
              <ImageIcon size={16} />
              Général
            </button>
          </div>
        </div>
      </div>

      {showStatus && <StatusStrip message={activity.message} progress={activity.progress} error={activity.error} />}

      <UpscalePanel
        mode={mode}
        enabled={upscaleEnabled}
        settings={settings}
        backendLabel={backendLabel}
        preview={preview}
        onToggle={onUpscaleToggle}
        onSettingsChange={(nextSettings) => onUpscaleSettingsChange(mode, nextSettings)}
      />
    </div>
  );
}
