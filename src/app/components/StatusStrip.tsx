interface StatusStripProps {
  message: string;
  progress: number;   // 0..1
  error?: string;
}

export function StatusStrip({ message, progress, error }: StatusStripProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const isActive = progress > 0 && progress < 1;

  return (
    <div className="space-y-1.5 px-4 py-3 surface animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`truncate text-xs font-medium ${error ? 'text-danger' : isActive ? 'text-accent' : 'text-muted'}`}
        >
          {error ?? message}
        </span>
        {isActive && (
          <span className="shrink-0 text-2xs tabular-nums text-muted">{pct}%</span>
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
