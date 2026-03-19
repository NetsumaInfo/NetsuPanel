import { useMemo, useState } from 'react';
import { GlobeIcon } from './icons';

interface SiteAvatarProps {
  title: string;
  url: string;
  favIconUrl?: string;
  size?: number;
}

function buildInitials(title: string): string {
  const parts = title
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'NP';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function SiteAvatar({ title, url, favIconUrl, size = 56 }: SiteAvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const initials = useMemo(() => buildInitials(title), [title]);

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-border bg-white text-ink shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {favIconUrl && !loadFailed ? (
        <img
          src={favIconUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setLoadFailed(true)}
        />
      ) : url ? (
        <span className="text-xs font-semibold tracking-wide text-ink/75">{initials}</span>
      ) : (
        <GlobeIcon size={22} className="text-muted" />
      )}
    </div>
  );
}
