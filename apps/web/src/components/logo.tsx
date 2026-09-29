import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-6 shrink-0', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="8" y="9" width="16" height="3" rx="1.5" className="fill-primary-foreground" />
      <rect x="8" y="14.5" width="11" height="3" rx="1.5" className="fill-primary-foreground" />
      <rect x="8" y="20" width="6" height="3" rx="1.5" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-16 font-semibold tracking-tight">Formyx</span>
    </span>
  );
}
