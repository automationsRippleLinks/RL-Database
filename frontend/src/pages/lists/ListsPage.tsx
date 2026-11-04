import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Copy,
  Eye,
  HeartPulse,
  LayoutGrid,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Rows3,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { ListFormDialog } from '@/features/lists/ListFormDialog';
import { ShareDialog } from '@/features/lists/ShareDialog';
import { VisibilityPill } from '@/features/lists/Visibility';
import { backState } from '@/lib/navigation';
import { healthMeta, useListActions, useLists } from '@/features/lists/queries';
import { useDismissable } from '@/hooks/useDismissable';
import { formatNumber, timeAgo } from '@/lib/format';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';
import type { ListSummary } from '@/types/api';

export const listPath = (id: string) => `/search/creators?list=${encodeURIComponent(id)}`;
export const listMissingPath = (id: string) => `/analytics/creators?list=${encodeURIComponent(id)}`;

type Tab = 'mine' | 'shared' | 'team';
type View = 'cards' | 'table';
const VIEW_KEY = 'rp-lists-view';

const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
};

/**
 * /lists — every list you can open, as cards (or a table for long lists of lists).
 *  - My Lists: lists you own;
 *  - Shared With Me: someone added you by name;
 *  - Team Lists: the rest you can open — your team's, everyone's, and (for admins) other teams'.
 * Opening a list shows the normal Creators table scoped to it.
 */
export function ListsPage() {
  useDocumentTitle('Lists');
  const { user } = useAuth();
  const lists = useLists();
  const act = useListActions();
  const navigate = useNavigate();
  const { flash } = useToast();
  const location = useLocation();
  const fromLists = backState(location, 'Lists');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('mine');
  const [view, setViewState] = useState<View>(readView);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ListSummary | null>(null);
  const [sharing, setSharing] = useState<ListSummary | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private window: remember for this visit only */
    }
  };

  const tabOf = (l: ListSummary): Tab =>
    l.owner.id === user?.id ? 'mine' : l.shares.some((s) => s.user.id === user?.id) ? 'shared' : 'team';

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { mine: 0, shared: 0, team: 0 };
    for (const l of lists.data?.lists ?? []) c[tabOf(l)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists.data, user?.id]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lists.data?.lists ?? []).filter(
      (l) => tabOf(l) === tab && (!t || `${l.name} ${l.description ?? ''} ${l.owner.name} ${l.tags.map((x) => `#${x}`).join(' ')}`.toLowerCase().includes(t)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists.data, q, tab, user?.id]);

  const askDelete = (l: ListSummary) =>
    setConfirm({
      title: `Delete “${l.name}”?`,
      body: (
        <>
          The list and its statuses and notes go away for everyone. The {formatNumber(l.creator_count)} creators in it stay in
          the database.
        </>
      ),
      confirmLabel: 'Delete list',
      danger: true,
      onConfirm: async () => {
        await act.remove.mutateAsync(l.id);
        flash(`Deleted ${l.name}`);
      },
    });

  const duplicate = async (l: ListSummary) => {
    try {
      const copy = await act.duplicate.mutateAsync(l.id);
      flash(`Made ${copy.name}. It is private to you.`);
      setTab('mine');
    } catch {
      flash('Could not duplicate the list');
    }
  };

  const menuFor = (l: ListSummary) => (
    <ListMenu
      list={l}
      fromLists={fromLists}
      onEdit={() => setEditing(l)}
      onDuplicate={() => void duplicate(l)}
      onShare={() => setSharing(l)}
      onDelete={() => askDelete(l)}
    />
  );

  const TABS: [Tab, string][] = [
    ['mine', 'My Lists'],
    ['shared', 'Shared With Me'],
    ['team', 'Team Lists'],
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-[22px] font-bold tracking-[-0.01em]">Lists</h1>
          <p className="text-[13px] text-rp-muted">Your saved creator groups. Each list is a group of creators you can review, check for missing info and share.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-rp-primary px-3.5 py-2.25 text-[13px] font-bold text-rp-primary-fg"
        >
          <Plus className="size-4" strokeWidth={2.4} /> New list
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <div role="tablist" aria-label="Whose lists" className="inline-flex rounded-[10px] border border-rp-border bg-rp-surface p-0.75">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn('cursor-pointer rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold', tab === value ? 'bg-rp-surface2 text-rp-text' : 'text-rp-muted hover:text-rp-text')}
            >
              {label} <span className="tabular-nums opacity-70">· {counts[value]}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex min-w-55 flex-[0_1_300px] items-center gap-2 rounded-[10px] border border-rp-border bg-rp-surface px-3 py-2">
          <Search className="size-4 text-rp-muted" aria-hidden="true" />
          <span className="sr-only">Search lists</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, owners or #tags" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-rp-muted" />
        </label>
        <div role="group" aria-label="Layout" className="inline-flex rounded-[10px] border border-rp-border bg-rp-surface p-0.75">
          {(
            [
              ['cards', LayoutGrid, 'Cards'],
              ['table', Rows3, 'Table'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={`Show as ${label.toLowerCase()}`}
              title={label}
              onClick={() => setView(v)}
              className={cn('flex size-8 cursor-pointer items-center justify-center rounded-[7px]', view === v ? 'bg-rp-surface2 text-rp-text' : 'text-rp-muted hover:text-rp-text')}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {lists.isError ? (
        <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
      ) : lists.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-rp-border bg-rp-surface" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rp-border px-6 py-14 text-center">
          <ListChecks className="mx-auto mb-2 size-7 text-rp-muted" aria-hidden="true" />
          <p className="mb-1 text-[13.5px] font-bold">{q ? 'No list matches' : EMPTY[tab].title}</p>
          <p className="text-[12.5px] text-rp-muted">{q ? 'Try another word, or another tab.' : EMPTY[tab].body}</p>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {rows.map((l) => (
            <ListCard key={l.id} list={l} you={user?.id} menu={menuFor(l)} onOpen={() => navigate(listPath(l.id))} />
          ))}
        </div>
      ) : (
        <ListTable rows={rows} you={user?.id} menuFor={menuFor} onOpen={(l) => navigate(listPath(l.id))} />
      )}

      <ListFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New list"
        description="Start an empty list, then add creators from the Creators page or by pasting many at once. Use Share… later to add specific people."
        submitLabel="Create list"
        visibility={{ initial: user?.team ? 'team' : 'everyone', teamName: user?.team?.name ?? null }}
        onSubmit={async (v) => {
          const l = await act.create.mutateAsync(v);
          flash(`Created ${l.name}`);
          navigate(listPath(l.id));
        }}
      />
      <ListFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Rename / edit list"
        submitLabel="Save"
        initial={editing ? { name: editing.name, description: editing.description, tags: editing.tags } : undefined}
        onSubmit={async (v) => {
          await act.update.mutateAsync({ id: editing!.id, body: v });
          flash('Saved');
        }}
      />
      <ShareDialog list={sharing} onOpenChange={(o) => !o && setSharing(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

const EMPTY: Record<Tab, { title: string; body: string }> = {
  mine: { title: 'No lists yet', body: 'Tick creators on the Creators page and press Add to list, or make an empty one with New list.' },
  shared: { title: 'Nothing shared with you yet', body: 'When someone adds you to a list by name, it shows up here.' },
  team: { title: 'No team lists', body: 'Lists your team or everyone at Ripple Links can open show up here.' },
};

function OwnerLine({ list, you }: { list: ListSummary; you?: number }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-rp-muted">
      <span className="truncate">{list.owner.id === you ? 'You' : list.owner.name}</span>
      <VisibilityPill visibility={list.visibility} team={list.team} shares={list.shares} level={list.audience_level} className="bg-transparent px-0" />
      {list.access === 'view' && (
        <span title="You can open this list but not change it" className="inline-flex items-center gap-1 rounded-full bg-rp-surface2 px-1.75 py-0.25 text-[11px] font-semibold">
          <Eye className="size-3" aria-hidden="true" /> View only
        </span>
      )}
    </span>
  );
}

function Health({ list }: { list: ListSummary }) {
  const h = healthMeta(list.health);
  return (
    <span title="How complete the creators’ details are (followers, views, contacts, location, categories, languages)" className={cn('inline-flex items-center gap-1.25 text-[12px] font-semibold', h.tone)}>
      <HeartPulse className="size-3.5" aria-hidden="true" />
      {list.health != null && <span className="tabular-nums">{list.health} ·</span>} {h.label}
    </span>
  );
}

function ListCard({ list, you, menu, onOpen }: { list: ListSummary; you?: number; menu: React.ReactNode; onOpen: () => void }) {
  return (
    <article
      onClick={onOpen}
      className="group flex cursor-pointer flex-col gap-2.5 rounded-2xl border border-rp-border bg-rp-surface p-4 transition-colors hover:border-rp-primary/50"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rp-primary-soft text-rp-primary">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link to={listPath(list.id)} onClick={(e) => e.stopPropagation()} className="truncate text-[14.5px] font-bold hover:text-rp-primary">
            {list.name}
          </Link>
          <OwnerLine list={list} you={you} />
        </div>
        <div onClick={(e) => e.stopPropagation()}>{menu}</div>
      </div>
      <p className={cn('line-clamp-2 min-h-[2lh] text-[12.5px]', list.description ? 'text-rp-text/85' : 'text-rp-muted')}>{list.description ?? 'No description'}</p>
      {list.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.tags.map((t) => (
            <span key={t} className="rounded-md bg-rp-surface2 px-1.75 py-0.5 text-[11.5px] font-medium text-rp-muted">#{t}</span>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rp-border pt-2.5 text-[12px] text-rp-muted">
        <span><b className="text-[13px] font-bold text-rp-text tabular-nums">{formatNumber(list.creator_count)}</b> creators</span>
        <Health list={list} />
        <span className="ml-auto" title={new Date(list.updated_at).toLocaleString()}>Updated {timeAgo(list.updated_at)}</span>
      </div>
    </article>
  );
}

function ListTable({ rows, you, menuFor, onOpen }: { rows: ListSummary[]; you?: number; menuFor: (l: ListSummary) => React.ReactNode; onOpen: (l: ListSummary) => void }) {
  const th = 'bg-rp-head px-3 py-2.75 shadow-[inset_0_-1px_0_var(--rp-border)]';
  return (
    <div className="overflow-x-auto rounded-[13px] border border-rp-border bg-rp-surface scrollbar-thin">
      <table className="w-full min-w-215 border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] font-bold tracking-[0.05em] text-rp-muted uppercase">
            <th className={cn(th, 'px-4')}>List</th>
            <th className={th}>Creators</th>
            <th className={th}>Health</th>
            <th className={th}>Owner &amp; sharing</th>
            <th className={th}>Updated</th>
            <th className={cn(th, 'w-12')}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} onClick={() => onOpen(l)} className="cursor-pointer hover:bg-rp-surface2/60">
              <td className="border-b border-rp-border px-4 py-3">
                <Link to={listPath(l.id)} onClick={(e) => e.stopPropagation()} className="font-bold hover:text-rp-primary">{l.name}</Link>
                <p className="mt-0.5 line-clamp-1 max-w-110 text-[12px] text-rp-muted">
                  {l.tags.map((t) => `#${t}`).join(' ')} {l.description ?? (l.tags.length ? '' : 'No description')}
                </p>
              </td>
              <td className="border-b border-rp-border px-3 py-3 font-bold tabular-nums">{formatNumber(l.creator_count)}</td>
              <td className="border-b border-rp-border px-3 py-3"><Health list={l} /></td>
              <td className="border-b border-rp-border px-3 py-3"><OwnerLine list={l} you={you} /></td>
              <td className="border-b border-rp-border px-3 py-3 text-rp-muted" title={new Date(l.updated_at).toLocaleString()}>{timeAgo(l.updated_at)}</td>
              <td className="border-b border-rp-border px-2 py-2" onClick={(e) => e.stopPropagation()}>{menuFor(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The ⋯ menu on a card or row. Items you can't use stay visible, greyed, with the reason. */
function ListMenu({
  list,
  fromLists,
  onEdit,
  onDuplicate,
  onShare,
  onDelete,
}: {
  list: ListSummary;
  fromLists: ReturnType<typeof backState>;
  onEdit: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tag = `list-menu-${list.id}`;
  useDismissable(tag, open, () => setOpen(false));
  const navigate = useNavigate();
  const go = (path: string) => {
    setOpen(false);
    navigate(path, { state: fromLists });
  };
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div data-rp-pop={tag} className="relative">
      <button
        type="button"
        aria-label={`More actions for ${list.name}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="animate-rp-menu absolute top-[calc(100%+4px)] right-0 z-30 w-56 rounded-xl border border-rp-border bg-rp-surface p-1.5 shadow-rp">
          <MenuItem icon={<AlertTriangle className="size-3.75" />} onClick={() => go(listMissingPath(list.id))}>View missing analytics</MenuItem>
          <hr className="my-1.25 border-rp-border" />
          <MenuItem icon={<Pencil className="size-3.75" />} disabled={!list.can_edit} title={list.can_edit ? undefined : 'You can only view this list'} onClick={run(onEdit)}>Rename / edit</MenuItem>
          <MenuItem icon={<Copy className="size-3.75" />} onClick={run(onDuplicate)}>Duplicate</MenuItem>
          <MenuItem icon={<Share2 className="size-3.75" />} onClick={run(onShare)}>{list.can_manage ? 'Share…' : 'Who has access'}</MenuItem>
          <hr className="my-1.25 border-rp-border" />
          <MenuItem icon={<Trash2 className="size-3.75" />} danger disabled={!list.can_delete} title={list.can_delete ? undefined : `Only ${list.owner.name} or an admin can delete this list`} onClick={run(onDelete)}>Delete…</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger, disabled, title }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent',
        danger && 'text-rp-danger',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
