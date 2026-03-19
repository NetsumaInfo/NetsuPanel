import type { AppMode, SourceTabContext } from '@shared/types';
import { SiteAvatar } from './SiteAvatar';

interface AppHeaderProps {
  source: SourceTabContext;
  mode: AppMode;
  chapterCount: number;
  generalCount: number;
  mangaPageCount: number;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function countLabel(value: number, unit: string): string {
  return `${value} ${unit}`;
}

export function AppHeader({
  source,
  mode,
  chapterCount,
  generalCount,
  mangaPageCount,
}: AppHeaderProps) {
  const hostname = getHostname(source.url);

  return (
    <header className="rounded-[18px] border border-border bg-white/95 px-3 py-2.5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <SiteAvatar title={source.title || hostname} url={source.url} favIconUrl={source.favIconUrl} size={36} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-ink" title={source.title || hostname}>
              {source.title || hostname}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white">
                {mode === 'manga' ? 'Manga' : 'Général'}
              </span>
              <span className="text-[11px] text-muted">{hostname}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span className="rounded-full bg-border/50 px-2.5 py-1">{countLabel(generalCount, 'img')}</span>
          <span className="rounded-full bg-border/50 px-2.5 py-1">{countLabel(chapterCount, 'ch')}</span>
          <span className="rounded-full bg-border/50 px-2.5 py-1">
            {countLabel(mode === 'manga' ? mangaPageCount : generalCount, 'pages')}
          </span>
        </div>
      </div>
    </header>
  );
}
