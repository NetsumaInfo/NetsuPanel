import type { AppMode, SourceTabContext } from '@shared/types';
import { ModeSwitch } from './ModeSwitch';
import { SiteAvatar } from './SiteAvatar';

interface AppHeaderProps {
  source: SourceTabContext;
  mode: AppMode;
  chapterCount: number;
  generalCount: number;
  mangaPageCount: number;
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
  mode,
  chapterCount,
  generalCount,
  mangaPageCount,
  onModeChange,
}: AppHeaderProps) {
  const hostname = getHostname(source.url);
  const countItems =
    mode === 'manga'
      ? [
          { value: `${chapterCount} ch` },
          { value: `${mangaPageCount} pages détectées` },
        ]
      : [{ value: `${generalCount} images` }];

  return (
    <header className="rounded-[18px] border border-border bg-white/95 px-3 py-2 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-2.5">
          <SiteAvatar title={source.title || hostname} url={source.url} favIconUrl={source.favIconUrl} size={30} />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold text-ink" title={source.title || hostname}>
              {source.title || hostname}
            </h1>
            <p className="truncate text-[11px] text-muted">{hostname}</p>
          </div>
        </div>

        <div className="justify-self-center">
          <ModeSwitch value={mode} onChange={onModeChange} />
        </div>

        <div className="flex flex-wrap items-center justify-start gap-1.5 text-[11px] text-muted lg:justify-end">
          {countItems.map((item) => (
            <span key={item.value} className="rounded-full bg-border/50 px-2.5 py-1">
              {item.value}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
