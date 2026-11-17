import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminActions } from '@/features/admin/context';
import { TeamDialog } from '@/features/admin/dialogs';
import { plural } from '@/features/admin/helpers';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar, btn, Fixed, PageFrame, PageHeader, Panel, SelectBox } from '@/features/admin/parts';
import { useAdminTeams, useAdminUsers, useDeleteTeam } from '@/features/admin/queries';
import type { AdminTeam } from '@/features/admin/types';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function TeamsPage() {
  const navigate = useNavigate();
  const actions = useAdminActions();
  const { flash } = useToast();
  const teamsQ = useAdminTeams();
  const usersQ = useAdminUsers();
  const remove = useDeleteTeam();
  const teams = teamsQ.data ?? [];
  const users = usersQ.data ?? [];
  const [dialog, setDialog] = useState<{ mode: 'new' | 'edit'; team?: AdminTeam } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const membersOf = (id: number) => users.filter((u) => u.team_id === id);
  const unassigned = users.filter((u) => u.team_id == null && u.is_currently_employed).sort((a, b) => a.name.localeCompare(b.name));
  const loading = teamsQ.isLoading || usersQ.isLoading;

  const askDelete = (t: AdminTeam) => {
    const n = membersOf(t.id).length;
    setConfirm({
      title: `Delete ${t.name}?`,
      body: n ? `${plural(n, 'person moves', 'people move')} to Unassigned. They keep their access.` : 'This team is empty.',
      confirmLabel: 'Delete team',
      danger: true,
      onConfirm: async () => { await remove.mutateAsync(t.id); flash(`${t.name} was deleted`); },
    });
  };

  return (
    <PageFrame>
      <Fixed>
      <PageHeader
        title="Teams"
        subtitle="Group colleagues so lists can be shared with a whole team."
        actions={<button className={btn.primary} onClick={() => setDialog({ mode: 'new' })}><Plus className="size-3.5" />New team</button>}
      />
      </Fixed>

      {(teamsQ.isError || usersQ.isError) && <ErrorState error={teamsQ.error ?? usersQ.error} onRetry={() => { teamsQ.refetch(); usersQ.refetch(); }} className="mb-3 py-8" />}
      {loading && <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>}

      {/* Teams on the left, the people without a team beside them on wide screens (below on narrow ones),
          so a single team or no team never leaves the page mostly blank. */}
      {!loading && !teamsQ.isError && !usersQ.isError && (
        <div className="grid min-h-0 flex-1 items-start gap-6 overflow-y-auto overscroll-contain pr-1 scrollbar-thin xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:overflow-hidden">
          <div className="xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 scrollbar-thin">
            {teamsQ.isSuccess && teams.length === 0 && (
              <Panel><EmptyState icon={<UsersRound className="size-5" />} title="No teams yet" description="Create a team to group your colleagues." action={<button className={btn.primary} onClick={() => setDialog({ mode: 'new' })}>New team</button>} /></Panel>
            )}

            {/* auto-fill, not auto-fit: one team keeps a normal card width instead of stretching across the page. */}
            {teams.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4">
                {teams.map((t) => {
                  const m = membersOf(t.id);
                  const lead = users.find((u) => u.id === t.lead_id);
                  return (
                    <article key={t.id} className="flex flex-col gap-3 rounded-xl border border-rp-border bg-rp-surface p-4">
                      <button className="flex w-full cursor-pointer items-center gap-3 text-left" onClick={() => navigate(`/admin/teams/${t.id}`)}>
                        <span className="flex size-9 items-center justify-center rounded-lg bg-rp-primary-soft text-rp-primary"><UsersRound className="size-4" /></span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.name}</span>
                        <ChevronRight className="size-4 text-rp-muted" />
                      </button>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between"><dt className="text-rp-muted">Team lead</dt><dd className="flex items-center gap-1.5 font-medium">{lead ? <><Avatar id={lead.id} name={lead.name} size="sm" />{lead.name}</> : <span className="text-rp-muted">No lead</span>}</dd></div>
                        <div className="flex items-center justify-between"><dt className="text-rp-muted">Members</dt><dd className="font-bold tabular-nums">{plural(m.length, 'member')}</dd></div>
                      </dl>
                      <div className="flex min-h-7 items-center">
                        {m.slice(0, 5).map((u) => <span key={u.id} className="-ml-1.5 rounded-full ring-2 ring-rp-surface first:ml-0"><Avatar id={u.id} name={u.name} size="sm" /></span>)}
                        {m.length > 5 && <span className="ml-1.5 text-[11px] font-semibold text-rp-muted">+{m.length - 5}</span>}
                        {m.length === 0 && <span className="text-xs text-rp-muted">No members yet</span>}
                      </div>
                      <div className="mt-auto flex gap-2 border-t border-rp-border pt-3">
                        <button className={cn(btn.base, btn.small)} onClick={() => setDialog({ mode: 'edit', team: t })}><Pencil className="size-3" />Edit</button>
                        <button className={cn(btn.danger, btn.small)} onClick={() => askDelete(t)}><Trash2 className="size-3" />Delete</button>
                      </div>
                    </article>
                  );
                })}
                <button
                  onClick={() => setDialog({ mode: 'new' })}
                  className="flex min-h-40 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rp-border text-xs font-semibold text-rp-muted transition-colors hover:border-rp-primary hover:text-rp-primary"
                ><Plus className="size-3.5" />New team</button>
              </div>
            )}

          </div>

          {usersQ.isSuccess && (
            <section aria-label="Unassigned users" className="xl:flex xl:min-h-0 xl:flex-col">
              <div className="mb-2.5 flex items-center gap-2">
                <h2 className="text-sm font-bold">Unassigned users</h2>
                <span className="rounded-full bg-rp-warn/15 px-2 text-[11px] font-bold text-rp-warn tabular-nums">{unassigned.length}</span>
              </div>
              <Panel className="xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain scrollbar-thin">
                {unassigned.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs font-semibold">Everyone is in a team.</p>
                ) : (
                  <ul className="max-h-[60vh] divide-y divide-rp-border overflow-y-auto overscroll-contain scrollbar-thin xl:max-h-none xl:overflow-visible">
                  {unassigned.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                      <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" onClick={() => actions.openUser(u.id)}>
                        <Avatar id={u.id} name={u.name} size="sm" />
                        <span className="min-w-0"><span className="block truncate text-xs font-semibold">{u.name}</span><span className="block truncate text-[11px] text-rp-muted">{u.email}</span></span>
                      </button>
                      <SelectBox label={`Assign ${u.name} to a team`} value="" onChange={(v) => v && actions.assignTeam(u, Number(v))} className="h-8 w-36 shrink-0" disabled={teams.length === 0}>
                        <option value="">{teams.length ? 'Assign to team…' : 'Create a team first'}</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </SelectBox>
                    </li>
                  ))}
                  </ul>
                )}
              </Panel>
            </section>
          )}
        </div>
      )}

      <TeamDialog mode={dialog?.mode ?? null} team={dialog?.team} users={users} teams={teams} onClose={() => setDialog(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </PageFrame>
  );
}