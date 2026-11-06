import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardList, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PlatformMark } from '@/components/PlatformMark';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ApiError } from '@/lib/api-client';
import { MAX_BULK_ITEMS, splitItems } from '@/lib/bulk';
import { searchApi } from '@/lib/endpoints';
import { compact, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CreatorRow, CreatorSearchRequest } from '@/types/api';
import { addedMessage, useListActions } from './queries';

/** A search request with every filter off — the same one the bulk search sends. */
export function plainCreatorRequest(text: string, pageSize = 25): CreatorSearchRequest {
  return {
    text,
    platforms: [], tiers: [], genders: [], categories: [], languages: [], cities: [], has_email: false, has_phone: false,
    has_contact: false, campaign_involvement: null, brand_ids: [], tags: [], min_followers: null, max_followers: null,
    min_avg_views: null, max_avg_views: null, has_commercial: false, min_commercial_cost: null, max_commercial_cost: null,
    sort: 'relevance', page: 1, page_size: pageSize, is_active: null,
  };
}

type Tab = 'search' | 'paste';

/**
 * "Add creators" inside a list: search and tick, or paste up to 500 names, handles or
 * links (the same matching as the header's Bulk search). Already-listed creators are
 * shown ticked and greyed, so nobody adds the same person twice.
 */
export function AddCreatorsDialog({
  open,
  onOpenChange,
  listId,
  listName,
  memberIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  listId: string;
  listName: string;
  memberIds: Set<string>;
}) {
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState<Record<string, CreatorRow>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = useListActions();
  const { flash } = useToast();
  const debounced = useDebouncedValue(q, 250);
  const items = useMemo(() => splitItems(paste), [paste]);
  const [pasteRun, setPasteRun] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ['search', 'creators', 'add-dialog', debounced],
    queryFn: ({ signal }) => searchApi.creators(plainCreatorRequest(debounced.trim(), 25), { signal }),
    enabled: open && tab === 'search' && debounced.trim().length >= 2,
  });
  const bulk = useQuery({
    queryKey: ['search', 'creators', 'add-dialog-bulk', pasteRun],
    queryFn: ({ signal }) => searchApi.creators(plainCreatorRequest(pasteRun!, 500), { signal }),
    enabled: open && !!pasteRun,
  });
  const bulkInfo = (bulk.data as unknown as { bulk?: { matched: number; total: number; not_found: string[] } } | undefined)?.bulk;

  const close = (o: boolean) => {
    if (busy) return;
    onOpenChange(o);
    if (!o) {
      setQ('');
      setPaste('');
      setPasteRun(null);
      setPicked({});
      setError(null);
    }
  };

  const toggle = (row: CreatorRow) =>
    setPicked((p) => {
      const n = { ...p };
      if (n[row.id]) delete n[row.id];
      else n[row.id] = row;
      return n;
    });

  const addIds = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const res = await act.add.mutateAsync({ id: listId, creatorIds: ids });
      flash(addedMessage(listName, res.added, res.skipped));
      setBusy(false);
      close(false);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.detail : 'Could not add. Please try again.');
    }
  };

  const pickedIds = Object.keys(picked);
  const bulkNew = (bulk.data?.rows ?? []).filter((r) => !memberIds.has(r.id));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[86vh] max-w-150 flex-col rounded-2xl border-rp-border bg-rp-surface p-0 shadow-rp">
        <div className="px-5 pt-5">
          <DialogTitle className="text-[16px] font-bold">Add creators to {listName}</DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px] text-rp-muted">Search and tick, or paste many at once.</DialogDescription>
          <div role="tablist" className="mt-4 flex gap-1 border-b border-rp-border">
            {(
              [
                ['search', 'Search', Search],
                ['paste', 'Paste many', ClipboardList],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn('-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold', tab === k ? 'border-rp-primary text-rp-text' : 'border-transparent text-rp-muted hover:text-rp-text')}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'search' ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 pt-3">
            <label className="flex items-center gap-2 rounded-lg border border-rp-border bg-rp-bg px-3 py-2">
              <Search className="size-4 text-rp-muted" aria-hidden="true" />
              <span className="sr-only">Search creators</span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, @handle, city or topic" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-rp-muted" />
              {search.isFetching && <Loader2 className="size-3.5 animate-spin text-rp-muted" />}
            </label>
            <div className="mt-2 min-h-60 flex-1 overflow-y-auto rp-scroll">
              {debounced.trim().length < 2 && <p className="py-10 text-center text-[12.5px] text-rp-muted">Type at least 2 letters.</p>}
              {search.data?.rows.length === 0 && <p className="py-10 text-center text-[12.5px] text-rp-muted">Nobody matches “{debounced}”.</p>}
              {search.data?.rows.map((row) => {
                const inList = memberIds.has(row.id);
                const on = inList || !!picked[row.id];
                return (
                  <button
                    key={row.id}
                    type="button"
                    disabled={inList}
                    onClick={() => toggle(row)}
                    className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-rp-surface2 disabled:cursor-default disabled:opacity-60', picked[row.id] && 'bg-rp-primary-soft')}
                  >
                    <span className={cn('flex size-4.5 items-center justify-center rounded-[5px] border', on ? 'border-rp-primary bg-rp-primary text-rp-primary-fg' : 'border-rp-box')}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                    <PlatformMark platform={row.platform} size={16} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-semibold">{row.name}</span>
                      <span className="truncate text-[11.5px] text-rp-muted">@{row.username}{row.city ? ` · ${row.city}` : ''}{row.categories[0] ? ` · ${row.categories[0]}` : ''}</span>
                    </span>
                    <span className="text-[12px] tabular-nums text-rp-muted">{inList ? 'In this list' : `${compact(row.followers)} followers`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-5 pt-3">
            <textarea
              autoFocus
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setPasteRun(null);
              }}
              rows={7}
              placeholder={'One per line, or separated by commas:\n@sneha.fitlife\nhttps://www.instagram.com/karanlifts/\nRun with Rahul'}
              className="resize-none rounded-lg border border-rp-border bg-rp-bg px-3 py-2 font-mono text-[12.5px] outline-none focus:border-rp-primary"
            />
            <div className="flex items-center justify-between text-[12px] text-rp-muted">
              <span>
                {formatNumber(items.length)} {items.length === 1 ? 'item' : 'items'}
                {items.length >= MAX_BULK_ITEMS && ` (the first ${MAX_BULK_ITEMS})`}
              </span>
              <button
                type="button"
                disabled={!items.length || bulk.isFetching}
                onClick={() => setPasteRun(items.join('\n') + '\n')}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rp-border px-3 py-1.5 font-semibold text-rp-text hover:bg-rp-surface2 disabled:opacity-50"
              >
                {bulk.isFetching && <Loader2 className="size-3.5 animate-spin" />} Find them
              </button>
            </div>
            {bulk.data && (
              <div className="rounded-lg border border-rp-border bg-rp-bg p-3 text-[12.5px]">
                <p>
                  <b>{bulkInfo?.matched ?? 0} of {bulkInfo?.total ?? items.length}</b> found · {formatNumber(bulk.data.total)} creators match ·{' '}
                  <b>{formatNumber(bulkNew.length)}</b> not in this list yet
                </p>
                {bulkInfo && bulkInfo.not_found.length > 0 && (
                  <p className="mt-1 text-rp-warn">Not found: {bulkInfo.not_found.slice(0, 8).join(', ')}{bulkInfo.not_found.length > 8 ? ` and ${bulkInfo.not_found.length - 8} more` : ''}</p>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="px-5 pt-2 text-[12.5px] text-rp-danger">{error}</p>}
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-rp-border px-5 py-3.5">
          <button type="button" disabled={busy} onClick={() => close(false)} className="cursor-pointer rounded-lg border border-rp-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            Cancel
          </button>
          {tab === 'search' ? (
            <button type="button" disabled={busy || !pickedIds.length} onClick={() => void addIds(pickedIds)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-rp-primary px-4 py-2 text-xs font-bold text-rp-primary-fg disabled:opacity-50">
              {busy && <Loader2 className="size-3.5 animate-spin" />} Add {pickedIds.length || ''} {pickedIds.length === 1 ? 'creator' : 'creators'}
            </button>
          ) : (
            <button type="button" disabled={busy || !bulkNew.length} onClick={() => void addIds(bulkNew.map((r) => r.id))} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-rp-primary px-4 py-2 text-xs font-bold text-rp-primary-fg disabled:opacity-50">
              {busy && <Loader2 className="size-3.5 animate-spin" />} Add {bulkNew.length ? formatNumber(bulkNew.length) : ''} found
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
