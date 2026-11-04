import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { ApiError } from '@/lib/api-client';
import { initials } from '@/lib/format';
import type { ListAccessLevel, ListSummary, ListVisibility } from '@/types/api';
import { useListActions, usePeople } from './queries';
import { LevelSelect, VisibilityPicker } from './Visibility';

interface Pick {
  id: number;
  name: string;
  level: ListAccessLevel;
}

/**
 * NEW: "Share …" — who can open a list and whether they can edit it.
 * Saves everything in one PUT /lists/{id}/sharing, so a half-finished change never lands.
 * Only the owner or an admin can save; everyone else sees it read-only.
 */
export function ShareDialog({ list, onOpenChange }: { list: ListSummary | null; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const act = useListActions();
  const { flash } = useToast();
  const people = usePeople(!!list);
  const [vis, setVis] = useState<ListVisibility>('private');
  const [level, setLevel] = useState<ListAccessLevel>('edit');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [adding, setAdding] = useState('');
  const [addLevel, setAddLevel] = useState<ListAccessLevel>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!list) return;
    setVis(list.visibility);
    setLevel(list.audience_level);
    setPicks(list.shares.map((s) => ({ id: s.user.id, name: s.user.name, level: s.level })));
    setAdding('');
    setAddLevel('view');
    setError(null);
  }, [list]);

  const readOnly = !!list && !list.can_manage;
  const teamName = list?.team?.name ?? (list?.owner.id === user?.id ? user?.team?.name ?? null : 'The owner’s team');
  const candidates = useMemo(
    () => (people.data?.people ?? []).filter((p) => p.id !== list?.owner.id && !picks.some((x) => x.id === p.id)),
    [people.data, picks, list?.owner.id],
  );

  const addPerson = () => {
    const p = candidates.find((c) => String(c.id) === adding);
    if (!p) return;
    setPicks((xs) => [...xs, { id: p.id, name: p.name, level: addLevel }]);
    setAdding('');
    setError(null);
  };

  const save = async () => {
    if (!list) return;
    if (vis === 'people' && picks.length === 0) {
      setError('Add at least one person, or choose Private.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await act.share.mutateAsync({
        id: list.id,
        body: { visibility: vis, audience_level: level, shares: vis === 'private' ? [] : picks.map((p) => ({ user_id: p.id, level: p.level })) },
      });
      flash(vis === 'private' ? `${list.name} is private now` : 'Sharing saved');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not save sharing. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const audienceWord = vis === 'team' ? teamName ?? 'Your team' : 'Everyone';

  return (
    <Dialog open={!!list} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-170 rounded-2xl border-rp-border bg-rp-surface p-0 shadow-rp">
        <div className="border-b border-rp-border px-5 pt-5 pb-4">
          <DialogTitle className="text-[16px] font-bold">Share “{list?.name}”</DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px] text-rp-muted">Sharing a list never shares your other lists.</DialogDescription>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <VisibilityPicker value={vis} onChange={setVis} teamName={teamName} withPeople ownerIsYou={list?.owner.id === user?.id} disabledReason={readOnly ? `Only ${list?.owner.name} or an admin can change sharing.` : null} />

          {(vis === 'team' || vis === 'everyone') && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-rp-border px-3 py-2.5">
              <span className="text-[12.5px]">
                <b className="font-semibold">{audienceWord}</b> <span className="text-rp-muted">{vis === 'team' ? '(and admins)' : 'at Ripple Links'}</span>
              </span>
              <LevelSelect value={level} onChange={setLevel} label={`What ${audienceWord} can do`} disabled={readOnly} />
            </div>
          )}

          {vis !== 'private' && (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] font-semibold">
                {vis === 'people' ? 'People' : 'Also share with'} {vis !== 'people' && <span className="font-normal text-rp-muted">(optional, e.g. to let one person edit)</span>}
              </p>
              {!readOnly && (
                <div className="flex gap-2">
                  <select
                    aria-label="Add a person"
                    value={adding}
                    onChange={(e) => setAdding(e.target.value)}
                    className="min-w-0 flex-1 cursor-pointer rounded-lg border border-rp-border bg-rp-bg px-3 py-2 text-[13px] outline-none focus:border-rp-primary"
                  >
                    <option value="">{people.isPending ? 'Loading people…' : 'Add a person…'}</option>
                    {candidates.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.team ? ` · ${p.team.name}` : ''}
                      </option>
                    ))}
                  </select>
                  <LevelSelect value={addLevel} onChange={setAddLevel} label="Level for the new person" />
                  <button type="button" disabled={!adding} onClick={addPerson} className="cursor-pointer rounded-lg border border-rp-border px-3.5 text-[12.5px] font-semibold hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-45">
                    Add
                  </button>
                </div>
              )}
              <ul className="flex max-h-48 flex-col overflow-y-auto rounded-xl border border-rp-border scrollbar-thin">
                {picks.length === 0 && <li className="px-3 py-3 text-[12.5px] text-rp-muted">Nobody yet — add people above.</li>}
                {picks.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 border-b border-rp-border px-3 py-2 last:border-b-0">
                    <span className="flex size-7 items-center justify-center rounded-full bg-rp-primary-soft text-[10.5px] font-bold text-rp-primary">{initials(p.name)}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.name}</span>
                    <LevelSelect value={p.level} onChange={(lv) => setPicks((xs) => xs.map((x) => (x.id === p.id ? { ...x, level: lv } : x)))} label={`What ${p.name} can do`} disabled={readOnly} />
                    {!readOnly && (
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPicks((xs) => xs.filter((x) => x.id !== p.id))} className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-rp-muted hover:bg-rp-surface2 hover:text-rp-text">
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11.5px] text-rp-muted">“Can edit” lets people add and remove creators, change statuses and notes, and rename the list. Only the owner (and admins) can delete it or change sharing.</p>
          {error && <p role="alert" className="text-[12.5px] text-rp-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-rp-border px-5 py-3.5">
          <button type="button" disabled={busy} onClick={() => onOpenChange(false)} className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold hover:bg-rp-surface2 disabled:opacity-50">
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-rp-primary px-4 py-2 text-xs font-bold text-rp-primary-fg disabled:opacity-60">
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Save sharing
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
