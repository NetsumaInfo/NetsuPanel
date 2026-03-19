import { SparkIcon } from './icons';

interface BrandLogoProps {
  compact?: boolean;
}

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-white shadow-sm">
        <SparkIcon size={14} />
      </div>
      <p className={`truncate font-semibold uppercase tracking-[0.22em] text-ink ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        Netsu
      </p>
    </div>
  );
}
