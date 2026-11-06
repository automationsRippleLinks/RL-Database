import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { backState } from '@/lib/navigation';
import { Check, ChevronDown, ChevronRight, ListChecks, Search, Users, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLists } from '@/features/lists/queries';
import { listPath } from '@/pages/lists/ListsPage';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

// Only Missing info for now. More tabs (Overview, graphs) can be added here later and the bar shows itself.
const TABS = [
  { to: '/analytics/creators', label: 'Missing info', end: true },
];

/** The list in the URL (?list=<id>), shared by every Creators analytics tab. */
export function useAnalyticsListId(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const id = params.get('list') || null;
  const set = (next: string | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('list', next);
        else p.delete('list');
        return p;
      },
      { replace: false },
    );
  return [id, set];
}

/**
 * Analytics › Creators: the three tabs and the "Showing" picker. The picker lives in
 * the URL, so a list's analytics are a link you can share, and switching tabs keeps
 * the same creators in view.
 */
export function CreatorAnalyticsNav({ title, subtitle }: { title: string; subtitle?: string }) {
  const [listId, setListId] = useAnalyticsListId();
  const lists = useLists();
  const current = lists.data?.lists.find((l) => l.id === listId) ?? null;
  const qs = listId ? `?list=${encodeURIComponent(listId)}` : '';
  const location = useLocation();
  const here = backState(location, title);

  return (
    <header className="flex flex-col gap-3 pb-4">
      <BackLink />
      {/* With a list picked, the trail starts at the list, so every step back is one click. */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12px] text-rp-muted">
        {current ? (
          <>
            <Link to="/lists" className="hover:text-rp-text">Lists</Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <Link to={listPath(current.id)} state={here} className="hover:text-rp-text">{current.name}</Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span>Analytics</span>
          </>
        ) : (
          <>
            <Link to="/analytics" className="hover:text-rp-text">Analytics</Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span>Creators</span>
          </>
        )}
        <ChevronRight className="size-3" aria-hidden="true" />
        <span className="font-semibold text-rp-text">{title}</span>
      </nav>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-[-0.01em]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-rp-muted">{subtitle}</p>}
        </div>
        <ScopePicker listId={listId} onPick={setListId} />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-rp-border">
        {TABS.length > 1 && (
        <div role="tablist" aria-label="Creator analytics" className="flex gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={`${t.to}${qs}`}
              // Switching tabs keeps the "Back to …" you arrived with.
              state={location.state}
              end={t.end}
              role="tab"
              className={({ isActive }) =>
                cn(
                  '-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold',
                  isActive ? 'border-rp-primary text-rp-text' : 'border-transparent text-rp-muted hover:text-rp-text',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        )}
        {current && (
          <span className="mb-1.5 ml-auto inline-flex items-center gap-2 rounded-full bg-rp-primary-soft py-1 pr-1.5 pl-3 text-[12px] font-semibold text-rp-primary">
            <ListChecks className="size-3.5" aria-hidden="true" />
            Only the {formatNumber(current.creator_count)} creators in {current.name}
            <Link to={listPath(current.id)} state={here} className="rounded-full px-1.5 underline-offset-2 hover:underline">Open list</Link>
            <button type="button" onClick={() => setListId(null)} title="Show every creator" aria-label="Show every creator" className="flex cursor-pointer rounded-full p-0.5 hover:bg-rp-primary/15">
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>
    </header>
  );
}

function ScopePicker({ listId, onPick }: { listId: string | null; onPick: (id: string | null) => void }) {
  const lists = useLists();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = lists.data?.lists.find((l) => l.id === listId) ?? null;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lists.data?.lists ?? []).filter((l) => !t || l.name.toLowerCase().includes(t));
  }, [lists.data, q]);
  const pick = (id: string | null) => {
    onPick(id);
    setOpen(false);
    setQ('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-rp-muted">Showing</span>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex max-w-80 cursor-pointer items-center gap-2 rounded-[10px] border border-rp-border bg-rp-surface px-3 py-2 text-[13px] font-semibold hover:border-rp-primary">
            {current ? <ListChecks className="size-4 shrink-0 text-rp-primary" /> : <Users className="size-4 shrink-0 text-rp-muted" />}
            <span className="truncate">{current ? current.name : listId ? 'Loading list…' : 'All creators'}</span>
            <ChevronDown className="size-3.5 shrink-0 text-rp-muted" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="end" className="w-80 rounded-xl border-rp-border bg-rp-surface p-0 text-rp-text shadow-rp">
        <button type="button" onClick={() => pick(null)} className="flex w-full cursor-pointer items-center gap-2.5 border-b border-rp-border px-3 py-2.75 text-left hover:bg-rp-surface2">
          <Users className="size-4 text-rp-muted" />
          <span className="flex-1 text-[13px] font-semibold">All creators</span>
          {!listId && <Check className="size-4 text-rp-primary" />}
        </button>
        <div className="p-2">
          <label className="flex items-center gap-2 rounded-lg border border-rp-border bg-rp-bg px-2.5 py-1.5">
            <Search className="size-3.5 text-rp-muted" aria-hidden="true" />
            <span className="sr-only">Find a list</span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a list" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-rp-muted" />
          </label>
        </div>
        <div className="max-h-64 overflow-y-auto pb-1.5 rp-scroll">
          {shown.length === 0 && <p className="px-3 py-2 text-[12px] text-rp-muted">No list matches.</p>}
          {shown.map((l) => (
            <button key={l.id} type="button" onClick={() => pick(l.id)} className={cn('flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-rp-surface2', l.id === listId && 'bg-rp-primary-soft')}>
              <ListChecks className="size-3.75 shrink-0 text-rp-muted" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12.5px] font-semibold">{l.name}</span>
                <span className="text-[11px] text-rp-muted">by {l.owner.name}</span>
              </span>
              <span className="text-[11.5px] tabular-nums text-rp-muted">{formatNumber(l.creator_count)}</span>
              {l.id === listId && <Check className="size-4 text-rp-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
