import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ListPlus, Loader2, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { addedMessage, useListActions, useLists } from './queries';
import { useAuth } from '@/features/auth/useAuth';

type Mode = 'add' | 'move' | 'copy';

interface Props {
  creatorIds: string[];
  /** The button that opens the menu. */
  trigger: ReactNode;
  mode?: Mode;
  /** For move / copy: the list the creators are in now (hidden from the choices). */
  fromListId?: string;
  /** Tag for the shell's outside-click listener, so opening this inside a drawer keeps the drawer. */
  surface?: string;
  align?: 'start' | 'end';
  onDone?: (result: { listId: string; listName: string; added: number }) => void;
}

const VERB: Record<Mode, string> = { add: 'Add', move: 'Move', copy: 'Copy' };

/**
 * "Add to list": pick an existing list or make a new one, right where you are.
 * Creators already in the chosen list are skipped and the message says how many.
 */
export function AddToListMenu({ creatorIds, trigger, mode = 'add', fromListId, surface, align = 'end', onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lists = useLists();
  const act = useListActions();
  const { user } = useAuth();
  const { flash } = useToast();
  const n = creatorIds.length;

  const choices = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lists.data?.lists ?? []).filter((l) => l.id !== fromListId && l.can_edit && (!t || l.name.toLowerCase().includes(t)));
  }, [lists.data, q, fromListId]);

  const reset = () => {
    setQ('');
    setCreating(false);
    setName('');
    setError(null);
    setBusy(null);
  };

  const finish = (listId: string, listName: string, added: number, skipped: number) => {
    const verb = mode === 'move' ? 'Moved' : mode === 'copy' ? 'Copied' : null;
    flash(verb ? `${verb} ${added} ${added === 1 ? 'creator' : 'creators'} to ${listName}${skipped ? ` · ${skipped} already there` : ''}` : addedMessage(listName, added, skipped));
    setOpen(false);
    reset();
    onDone?.({ listId, listName, added });
  };

  const pickList = async (id: string, listName: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = mode === 'add' ? await act.add.mutateAsync({ id, creatorIds }) : await act.transfer(fromListId!, id, creatorIds, mode);
      finish(id, listName, res.added, res.skipped);
    } catch (e) {
      setBusy(null);
      setError(e instanceof ApiError ? e.detail : 'Could not save. Please try again.');
    }
  };

  const createList = async () => {
    const clean = name.trim();
    if (!clean) {
      setError('Give the list a name.');
      return;
    }
    setBusy('new');
    setError(null);
    try {
      const l = await act.create.mutateAsync({ name: clean, creator_ids: mode === 'add' ? creatorIds : [] });
      if (mode !== 'add') {
        const res = await act.transfer(fromListId!, l.id, creatorIds, mode);
        finish(l.id, l.name, res.added, 0);
      } else finish(l.id, l.name, l.creator_count, 0);
    } catch (e) {
      setBusy(null);
      setError(e instanceof ApiError ? e.detail : 'Could not create the list.');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        data-rp-pop={surface}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        // z-70: above the creator drawer (z-60), or the menu opens hidden behind it.
        className="z-70 w-80 rounded-xl border-rp-border bg-rp-surface p-0 text-rp-text shadow-rp"
      >
        <div className="flex flex-col gap-2 border-b border-rp-border p-3">
          <p className="text-[13px] font-bold">
            {VERB[mode]} {formatNumber(n)} {n === 1 ? 'creator' : 'creators'} to…
          </p>
          <label className="flex items-center gap-2 rounded-lg border border-rp-border bg-rp-bg px-2.5 py-1.75">
            <Search className="size-3.5 text-rp-muted" aria-hidden="true" />
            <span className="sr-only">Find a list</span>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a list"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-rp-muted"
            />
          </label>
        </div>

        {creating ? (
          <form
            className="flex flex-col gap-2 border-b border-rp-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void createList();
            }}
          >
            <label className="text-[11.5px] font-semibold text-rp-muted" htmlFor="new-list-name">
              New list name
            </label>
            <input
              id="new-list-name"
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali beauty shortlist"
              className="rounded-lg border border-rp-border bg-rp-bg px-2.5 py-2 text-[12.5px] outline-none focus:border-rp-primary"
            />
            <p className="text-[11px] text-rp-muted">
              {user?.team ? `Shared with ${user.team.name}.` : 'Shared with everyone (you are not in a team).'} Change it later from the list.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-rp-muted hover:bg-rp-surface2">
                Cancel
              </button>
              <button type="submit" disabled={busy === 'new'} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-rp-primary px-3 py-1.5 text-[12px] font-bold text-rp-primary-fg disabled:opacity-60">
                {busy === 'new' && <Loader2 className="size-3.5 animate-spin" />}
                Create and {VERB[mode].toLowerCase()}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setName(q.trim());
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 border-b border-rp-border px-3 py-2.75 text-left text-[12.5px] font-bold text-rp-primary hover:bg-rp-surface2"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Create new list{q.trim() ? ` “${q.trim()}”` : ''}
          </button>
        )}

        <div className="max-h-64 overflow-y-auto py-1 rp-scroll">
          {lists.isPending && <p className="px-3 py-3 text-[12px] text-rp-muted">Loading lists…</p>}
          {lists.data && choices.length === 0 && (
            <p className="px-3 py-3 text-[12px] text-rp-muted">{q ? 'No list matches. Create one above.' : 'No other lists yet. Create one above.'}</p>
          )}
          {choices.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={!!busy}
              onClick={() => void pickList(l.id, l.name)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-rp-surface2 disabled:cursor-wait',
                busy === l.id && 'bg-rp-surface2',
              )}
            >
              <ListPlus className="size-3.75 shrink-0 text-rp-muted" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12.5px] font-semibold">{l.name}</span>
                <span className="text-[11px] text-rp-muted">by {l.owner.name}</span>
              </span>
              {busy === l.id ? (
                <Loader2 className="size-3.5 animate-spin text-rp-muted" />
              ) : (
                <span className="text-[11.5px] tabular-nums text-rp-muted">{formatNumber(l.creator_count)}</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="border-t border-rp-border px-3 py-2 text-[12px] text-rp-danger">
            {error}
          </p>
        )}
        <p className="flex items-center gap-1.5 border-t border-rp-border px-3 py-2 text-[11px] text-rp-muted">
          <Check className="size-3" aria-hidden="true" /> Creators already in a list are skipped.
        </p>
      </PopoverContent>
    </Popover>
  );
}
