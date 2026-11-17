/** Small building blocks shared by the Administration screens, so tables, filters and buttons look identical everywhere. */
import type { ReactNode } from 'react';
import { Crown, KeyRound, Loader2, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { initials, ROLE_LABEL, STATUS_LABEL } from './helpers';
import type { Role, UserStatus } from './types';

// ── buttons ───────────────────────────────────────────────────────────────────
const BTN = 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const btn = {
  base: cn(BTN, 'border-rp-border bg-rp-surface hover:bg-rp-surface2'),
  primary: cn(BTN, 'border-rp-primary bg-rp-primary font-bold text-rp-primary-fg hover:opacity-90'),
  danger: cn(BTN, 'border-rp-danger/40 text-rp-danger hover:bg-rp-danger/10'),
  small: 'px-2.5 py-1.5',
};

export const fieldClass =
  'h-9 rounded-lg border border-rp-border bg-rp-surface px-3 text-xs outline-none focus:border-rp-primary disabled:cursor-not-allowed disabled:opacity-60';

// ── people ────────────────────────────────────────────────────────────────────
const HUES = [
  'bg-[oklch(0.78_0.1_250)] text-[oklch(0.25_0.05_250)]',
  'bg-[oklch(0.8_0.1_155)] text-[oklch(0.25_0.05_155)]',
  'bg-[oklch(0.82_0.1_75)] text-[oklch(0.3_0.05_75)]',
  'bg-[oklch(0.8_0.1_310)] text-[oklch(0.28_0.05_310)]',
  'bg-[oklch(0.8_0.1_20)] text-[oklch(0.3_0.05_20)]',
  'bg-[oklch(0.8_0.08_200)] text-[oklch(0.28_0.05_200)]',
];

export function Avatar({ id, name, size = 'md' }: { id: number | null; name: string; size?: 'sm' | 'md' | 'xl' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        HUES[(id ?? 0) % HUES.length],
        size === 'sm' && 'size-7 text-[10px]',
        size === 'md' && 'size-8.5 text-[11px]',
        size === 'xl' && 'size-12 text-sm',
      )}
    >
      {initials(name) || '?'}
    </span>
  );
}

const ROLE_ICON = { super: Crown, admin: KeyRound, member: User };
const ROLE_TONE: Record<Role, string> = {
  super: 'bg-rp-primary-soft text-rp-primary',
  admin: 'bg-rp-warn/15 text-rp-warn',
  member: 'bg-rp-surface2 text-rp-muted',
};

export function RoleBadge({ role }: { role: Role }) {
  const Icon = ROLE_ICON[role];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', ROLE_TONE[role])}>
      <Icon className="size-3" />
      {ROLE_LABEL[role]}
    </span>
  );
}

const STATUS_TONE: Record<UserStatus, string> = {
  active: 'bg-rp-success/15 text-rp-success',
  pending: 'bg-rp-warn/15 text-rp-warn',
  off: 'bg-rp-surface2 text-rp-muted',
};
export function UserStatusPill({ status, label }: { status: UserStatus | string; label?: string }) {
  const tone = STATUS_TONE[status as UserStatus] ?? 'bg-rp-surface2 text-rp-muted';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', tone)}>
      {label ?? STATUS_LABEL[status as UserStatus] ?? status}
    </span>
  );
}

// ── page furniture ──────────────────────────────────────────────────────────
/** A page that stays put: wrap the title and filters in <Fixed>, the list or table in <PageBody>. */
export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
export function Fixed({ children }: { children: ReactNode }) {
  return <div className="shrink-0">{children}</div>;
}
/** The area under a fixed title and filters: it fills the screen, and a table panel inside it keeps its column heads and footer in view. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
}
export const TABLE_PANEL = 'flex min-h-0 flex-col';
export const TABLE_SCROLL = 'min-h-0 flex-1 overflow-auto overscroll-contain scrollbar-thin';
export const STICKY_HEAD = 'sticky top-0 z-10';

export function ScrollBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 scrollbar-thin', className)}>{children}</div>;
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[19px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-rp-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2.5">{children}</div>;
}

export function SegTabs<K extends string>({
  items, value, onChange, label,
}: { items: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-rp-border bg-rp-surface p-0.5 scrollbar-thin">
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cn(
            'shrink-0 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            value === it.key ? 'bg-rp-primary-soft text-rp-primary' : 'text-rp-muted hover:text-rp-text',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className="ml-1.5 font-medium tabular-nums opacity-70">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SelectBox({
  value, onChange, label, children, className, disabled, title,
}: { value: string; onChange: (v: string) => void; label: string; children: ReactNode; className?: string; disabled?: boolean; title?: string }) {
  return (
    <select aria-label={label} title={title} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, 'cursor-pointer', className)}>
      {children}
    </select>
  );
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer text-xs font-semibold text-rp-primary hover:underline">
      {children}
    </button>
  );
}

// ── states ────────────────────────────────────────────────────────────────────
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-hidden rounded-xl border border-rp-border bg-rp-surface', className)}>{children}</div>;
}

export function SkeletonRows({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <Panel>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn('flex items-center gap-3 border-b border-rp-border px-4 py-3 last:border-0', className)}>
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </Panel>
  );
}

export function Spinner() {
  return <Loader2 className="size-3.5 animate-spin" />;
}

/** Pinned footer under a table: just the count, the table above it scrolls. */
export function CountBar({ total, noun }: { total: number; noun: string }) {
  return (
    <div className="shrink-0 border-t border-rp-border px-4 py-2.5 text-xs text-rp-muted tabular-nums">
      Showing all {total} {noun}
    </div>
  );
}