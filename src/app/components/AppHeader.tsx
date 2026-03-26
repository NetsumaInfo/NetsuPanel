import type { AppMode } from '@shared/types';
import type { SourceTabContext } from '@shared/types';
import { SiteAvatar } from './SiteAvatar';
import { BookIcon, GridIcon } from './icons';

interface AppHeaderProps {
  source: SourceTabContext;
  chapterCount: number;
  generalCount: number;
  mangaPageCount: number;
  mode: AppMode;
  onModeChange(mode: AppMode): void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function AppHeader({
  source,
  chapterCount,
  generalCount,
  mangaPageCount,
  mode,
  onModeChange,
}: AppHeaderProps) {
  const hostname = getHostname(source.url);

  return (
    <header className="rounded-[18px] border border-border bg-white/95 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        {/* Site info */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <SiteAvatar title={source.title || hostname} url={source.url} favIconUrl={source.favIconUrl} size={30} />
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold text-ink" title={source.title || hostname}>
              {source.title || hostname}
            </h1>
            <p className="truncate text-[10px] text-muted">{hostname}</p>
          </div>
        </div>

        {/* Mode toggle — centred in the header */}
        <div
          className="flex shrink-0 items-center gap-0.5 rounded-[14px] border border-border bg-[#f4f5f7] p-1"
          role="group"
          aria-label="Mode de téléchargement"
        >
          <button
            type="button"
            id="mode-manga"
            aria-label="Mode Manga"
            aria-pressed={mode === 'manga'}
            onClick={() => onModeChange('manga')}
            className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
              mode === 'manga'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink/55 hover:text-ink/80'
            }`}
          >
            <BookIcon size={13} />
            Manga
          </button>
          <button
            type="button"
            id="mode-general"
            aria-label="Mode Général"
            aria-pressed={mode === 'general'}
            onClick={() => onModeChange('general')}
            className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
              mode === 'general'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink/55 hover:text-ink/80'
            }`}
          >
            <GridIcon size={13} />
            Général
          </button>
        </div>

        {/* Counters */}
        <div className="hidden items-center gap-1 text-[10px] text-muted lg:flex">
          <span className="rounded-full bg-border/50 px-2 py-0.5">{chapterCount} ch</span>
          <span className="rounded-full bg-border/50 px-2 py-0.5">{mangaPageCount} pages</span>
          <span className="rounded-full bg-border/50 px-2 py-0.5">{generalCount} img</span>
        </div>
      </div>
    </header>
  );
}
