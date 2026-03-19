import { ActivityIcon } from './icons';

interface StatusStripProps {
  message: string;
  progress: number;   // 0..1
  error?: string;
}

export function StatusStrip({ message, progress, error }: StatusStripProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const isActive = progress > 0 && progress < 1;

  return (
    <div className="surface animate-fade-in space-y-1.5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${error ? 'bg-danger/10 text-danger' : 'bg-border/50 text-ink'}`}>
            <ActivityIcon size={14} />
          </span>
          <span
            className={`truncate text-[11px] font-medium ${error ? 'text-danger' : isActive ? 'text-accent' : 'text-ink/75'}`}
          >
            {error ?? message}
          </span>
        </div>
        {isActive && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted">{pct}%</span>
        )}
      </div>

      {isActive && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
