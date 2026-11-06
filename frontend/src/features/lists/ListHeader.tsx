import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardCheck, Copy, Eye, MoreHorizontal, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { BackLink } from '@/components/BackLink';
import { backState } from '@/lib/navigation';
import { VisibilityPill } from './Visibility';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { useDismissable } from '@/hooks/useDismissable';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { compact, formatNumber, rupeesCompact, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ListDetail, ListStatus } from '@/types/api';
import { listMissingPath } from '@/pages/lists/ListsPage';
import { AddCreatorsDialog } from './AddCreatorsDialog';
import { ListFormDialog } from './ListFormDialog';
import { ShareDialog } from './ShareDialog';
import { STATUS_META, STATUSES, useListActions } from './queries';

/**
 * The top of a list: what it is, how big and how good it is, and where to go next.
 * Sits above the normal Creators table when the URL has ?list=<id>.
 */
export function ListHeader({ list }: { list: ListDetail }) {
  const { user } = useAuth();
  const location = useLocation();
  const fromList = backState(location, list.name);
  const navigate = useNavigate();
  const act = useListActions();
  const { flash } = useToast();
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  useDismissable('list-head-menu', menu, () => setMenu(false));

  const s = list.stats;
  const canDelete = list.can_delete;
  const canEdit = list.can_edit;
  const memberIds = new Set(list.members.map((m) => m.creator_id));

  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: 'Total followers', value: compact(s.total_followers), hint: s.missing_followers ? `${s.missing_followers} without a count` : undefined },
    { label: 'Median avg views', value: s.median_views ? compact(s.median_views) : '—' },
    { label: 'Estimated cost', value: rupeesCompact(s.est_cost), hint: s.missing_cost ? `${s.missing_cost} have no cost on file` : 'From each latest cost' },
    { label: 'Median cost per view', value: s.median_cpv != null ? `₹${s.median_cpv.toFixed(2)}` : '—' },
    { label: 'Missing info', value: formatNumber(s.with_gaps), hint: s.with_gaps ? 'creators with gaps' : 'All complete' },
  ];

  return (
    <section aria-label={`List ${list.name}`} className="flex shrink-0 flex-col gap-2.5 px-4.5 pt-2.5">
      <BackLink />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-rp-muted">
        <Link to="/lists" className="hover:text-rp-text">Lists</Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <span className="font-semibold text-rp-text">{list.name}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-[20px] font-bold tracking-[-0.01em]">{list.name}</h1>
            {canEdit ? (
              <button type="button" onClick={() => setRenaming(true)} aria-label="Rename list" title="Rename, describe and tag" className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-rp-muted hover:bg-rp-surface2 hover:text-rp-text">
                <Pencil className="size-3.75" />
              </button>
            ) : (
              <span title="You can open this list but not change it" className="inline-flex items-center gap-1 rounded-full bg-rp-surface2 px-2 py-0.5 text-[11.5px] font-semibold text-rp-muted">
                <Eye className="size-3" aria-hidden="true" /> View only
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-rp-muted">
            <span className="text-rp-text/85">{list.description ?? 'No description yet.'}</span>
            <span>Owner: <b className="font-semibold text-rp-text">{list.owner.id === user?.id ? 'You' : list.owner.name}</b></span>
            <span>Updated {timeAgo(list.updated_at)}</span>
            {list.tags.length > 0 && <span>{list.tags.map((t) => `#${t}`).join(' ')}</span>}
            <button type="button" onClick={() => setSharing(true)} title={list.can_manage ? 'Change sharing' : 'See who has access'} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full hover:opacity-80">
              Shared with <VisibilityPill visibility={list.visibility} team={list.team} shares={list.shares} level={list.audience_level} />
            </button>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.75">
          <Link to={listMissingPath(list.id)} state={fromList} className="inline-flex items-center gap-1.75 rounded-[9px] border border-rp-border px-3 py-1.75 text-[12.5px] font-semibold hover:bg-rp-surface2">
            <ClipboardCheck className="size-3.75" /> Missing info
          </Link>
          {canEdit && <button type="button" onClick={() => setAdding(true)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] bg-rp-primary px-3 py-1.75 text-[12.5px] font-bold text-rp-primary-fg">
            <Plus className="size-3.75" strokeWidth={2.4} /> Add creators
          </button>}
          <div data-rp-pop="list-head-menu" className="relative">
            <button type="button" aria-label="More list actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="flex size-8.5 cursor-pointer items-center justify-center rounded-[9px] border border-rp-border text-rp-muted hover:bg-rp-surface2">
              <MoreHorizontal className="size-4" />
            </button>
            {menu && (
              <div className="animate-rp-menu absolute top-[calc(100%+6px)] right-0 z-40 w-56 rounded-xl border border-rp-border bg-rp-surface p-1.5 shadow-rp">
                <button type="button" disabled={!canEdit} onClick={() => { setMenu(false); setRenaming(true); }} className="flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-45">
                  <Pencil className="size-3.75" /> Rename / edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setMenu(false);
                    const copy = await act.duplicate.mutateAsync(list.id);
                    flash(`Made ${copy.name}. It is private to you.`);
                    navigate(`/search/creators?list=${encodeURIComponent(copy.id)}`, { state: fromList });
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-rp-surface2"
                >
                  <Copy className="size-3.75" /> Duplicate
                </button>
                <button type="button" onClick={() => { setMenu(false); setSharing(true); }} className="flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-rp-surface2">
                  <Share2 className="size-3.75" /> {list.can_manage ? 'Share…' : 'Who has access'}
                </button>
                <button
                  type="button"
                  disabled={!canDelete}
                  onClick={() => {
                    setMenu(false);
                    setConfirm({
                      title: `Delete “${list.name}”?`,
                      body: `The list, its statuses and notes go away for everyone. The ${formatNumber(list.creator_count)} creators stay in the database.`,
                      confirmLabel: 'Delete list',
                      danger: true,
                      onConfirm: async () => {
                        await act.remove.mutateAsync(list.id);
                        flash(`Deleted ${list.name}`);
                        navigate('/lists');
                      },
                    });
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-rp-danger hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 className="size-3.75" /> Delete list
                </button>
                {!canDelete && <p className="px-2.5 pt-1 pb-1.5 text-[11px] text-rp-muted">Only {list.owner.name} or an admin can delete this list.</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] overflow-hidden rounded-xl border border-rp-border bg-rp-border gap-px">
        {tiles.map((t) => (
          <div key={t.label} className="bg-rp-surface px-3.5 py-2" title={t.hint}>
            <p className="truncate text-[11px] font-semibold text-rp-muted">{t.label}</p>
            <p className="flex items-baseline gap-2">
              <span className="text-[16px] font-bold tabular-nums">{t.value}</span>
              {t.hint && <span className="truncate text-[11px] text-rp-muted">{t.hint}</span>}
            </p>
          </div>
        ))}
      </div>

      <ListFormDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename list"
        submitLabel="Save"
        initial={{ name: list.name, description: list.description, tags: list.tags }}
        onSubmit={async (v) => {
          await act.update.mutateAsync({ id: list.id, body: v });
          flash('Saved');
        }}
      />
      <ShareDialog list={sharing ? list : null} onOpenChange={setSharing} />
      <AddCreatorsDialog open={adding} onOpenChange={setAdding} listId={list.id} listName={list.name} memberIds={memberIds} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

/** All / Shortlisted / Contacted / Confirmed / Rejected, with counts. Lives in the URL as ?lstatus=. */
export function ListStatusTabs({ list }: { list: ListDetail }) {
  const url = useUrlSearchState();
  const statusFilter = url.getList('lstatus') as ListStatus[];
  const setStatus = (st: ListStatus | null) => url.setParams({ lstatus: st }, { replace: true, resetPage: true });
  return (
    <div role="tablist" aria-label="Filter by status" className="mr-auto flex flex-wrap items-center gap-1.5">
      <StatusTab active={statusFilter.length === 0} onClick={() => setStatus(null)} label="All" count={list.stats.creator_count} />
      {STATUSES.map((st) => (
        <StatusTab
          key={st}
          active={statusFilter.length === 1 && statusFilter[0] === st}
          onClick={() => setStatus(statusFilter.length === 1 && statusFilter[0] === st ? null : st)}
          label={STATUS_META[st].label}
          count={list.stats.status_counts[st]}
          dot={STATUS_META[st].dot}
        />
      ))}
    </div>
  );
}

function StatusTab({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.75 rounded-full border px-3 py-1.25 text-[12px] font-semibold',
        active ? 'border-rp-primary bg-rp-primary-soft text-rp-primary' : 'border-rp-border text-rp-muted hover:text-rp-text',
      )}
    >
      {dot && <i className={cn('size-1.5 rounded-full', dot)} aria-hidden="true" />}
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}
