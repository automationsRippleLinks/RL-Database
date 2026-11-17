import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Pencil, Plus, Users, X } from 'lucide-react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminActions } from '@/features/admin/context';
import { AddMembersDialog, TeamDialog } from '@/features/admin/dialogs';
import { plural, roleOf } from '@/features/admin/helpers';
import { TableSearch } from '@/components/TableSearch';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar, btn, Fixed, PageFrame, PageBody, STICKY_HEAD, TABLE_PANEL, TABLE_SCROLL, PageHeader, Panel, RoleBadge, SkeletonRows, UserStatusPill } from '@/features/admin/parts';
import { useAdminTeams, useAdminUsers, useDeleteTeam, useUpdateTeam } from '@/features/admin/queries';
import { cn } from '@/lib/utils';

const COLS = 'grid grid-cols-[minmax(190px,1.6fr)_minmax(170px,1.6fr)_110px_130px_minmax(150px,1fr)] items-center gap-3';

export function TeamDetailPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const actions = useAdminActions();
  const { flash } = useToast();
  const teamsQ = useAdminTeams();
  const usersQ = useAdminUsers();
  const updateTeam = useUpdateTeam();
  const remove = useDeleteTeam();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const teams = teamsQ.data ?? [];
  const users = usersQ.data ?? [];
  const team = teams.find((t) => t.id === Number(teamId));
  const back = <button className="mb-3 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-rp-muted hover:text-rp-text" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/admin/teams'))}><ChevronLeft className="size-3.5" />Back</button>;

  if (teamsQ.isLoading || usersQ.isLoading) return <>{back}<SkeletonRows count={5} /></>;
  if (teamsQ.isError || usersQ.isError) return <>{back}<ErrorState error={teamsQ.error ?? usersQ.error} onRetry={() => { teamsQ.refetch(); usersQ.refetch(); }} className="mb-3 py-8" /></>;
  if (!team) return <>{back}<Panel><EmptyState icon={<Users className="size-5" />} title="This team does not exist" description="It may have been deleted." action={<button className={btn.base} onClick={() => navigate('/admin/teams')}>All teams</button>} /></Panel></>;

  const all = users.filter((u) => u.team_id === team.id).sort((a, b) => a.name.localeCompare(b.name));
  const needle = q.trim().toLowerCase();
  const list = all.filter((u) => !needle || `${u.name} ${u.email}`.toLowerCase().includes(needle));
  const lead = users.find((u) => u.id === team.lead_id);

  return (
    <PageFrame>
      <Fixed>
      {back}
      <PageHeader
        title={team.name}
        subtitle={`${plural(all.length, 'member')} · ${lead ? `Lead: ${lead.name}` : 'No team lead'}`}
        actions={
          <>
            <button className={btn.primary} onClick={() => setAdding(true)}><Plus className="size-3.5" />Add members</button>
            <button className={btn.base} onClick={() => setEditing(true)}><Pencil className="size-3.5" />Edit team</button>
            <button
              className={btn.danger}
              onClick={() => setConfirm({
                title: `Delete ${team.name}?`,
                body: all.length ? `${plural(all.length, 'person moves', 'people move')} to Unassigned. They keep their access.` : 'This team is empty.',
                confirmLabel: 'Delete team', danger: true,
                onConfirm: async () => { await remove.mutateAsync(team.id); flash(`${team.name} was deleted`); navigate('/admin/teams', { replace: true }); },
              })}
            >Delete team</button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <TableSearch label="Search members" placeholder="Search members" value={q} onChange={setQ} />
        <span className="ml-auto text-xs text-rp-muted tabular-nums">{list.length === all.length ? plural(all.length, 'member') : `${list.length} of ${all.length} members`}</span>
      </div>
      </Fixed>

      <PageBody>
      <Panel className={TABLE_PANEL}>
        {list.length > 0 ? (
          <div className={TABLE_SCROLL}>
            <div className="min-w-205">
              <div className={cn(COLS, STICKY_HEAD, 'border-b border-rp-border bg-rp-head px-4 py-2.5 text-[11px] font-bold tracking-wide text-rp-muted uppercase')}>
                <span>Member</span><span>Email</span><span>In team</span><span>Role</span><span />
              </div>
              {list.map((u) => {
                const isLead = team.lead_id === u.id;
                return (
                  <div key={u.id} data-rp-pop="results" className={cn(COLS, 'border-b border-rp-border px-4 py-2.5 last:border-0 hover:bg-rp-surface2/60')}>                    <button className="flex min-w-0 cursor-pointer items-center gap-3 text-left" onClick={() => actions.openUser(u.id)}>
                      <Avatar id={u.id} name={u.name} />
                      <span className="truncate text-[12.5px] font-semibold">{u.name}</span>
                      {!u.is_currently_employed && <UserStatusPill status="off" />}
                    </button>
                    <span className="truncate text-xs text-rp-muted">{u.email}</span>
                    <span>{isLead ? <UserStatusPill status="active" label="Team lead" /> : <span className="text-xs text-rp-muted">Member</span>}</span>
                    <span><RoleBadge role={roleOf(u)} /></span>
                    <span className="flex items-center justify-end gap-1.5">
                      <button
                        className={cn(btn.base, btn.small)} disabled={isLead || updateTeam.isPending}
                        onClick={async () => { try { await updateTeam.mutateAsync({ id: team.id, patch: { lead_id: u.id } }); flash(`${u.name} is now the lead of ${team.name}`); } catch (e) { flash(e instanceof Error ? e.message : 'Could not change the lead'); } }}
                      >Make lead</button>
                      <button
                        aria-label={`Remove ${u.name} from team`} title="Remove from team"
                        className="cursor-pointer rounded-md p-1.5 text-rp-muted hover:bg-rp-surface2 hover:text-rp-danger"
                        onClick={() => setConfirm({
                          title: `Remove ${u.name} from ${team.name}?`, body: 'They keep their access and move to Unassigned.', confirmLabel: 'Remove', danger: true,
                          onConfirm: async () => actions.assignTeam(u, null),
                        })}
                      ><X className="size-3.5" /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Users className="size-5" />}
            title={needle ? 'No member matches' : 'No members yet'}
            description={needle ? 'Try another name or email.' : 'Add people to this team.'}
            action={!needle && <button className={btn.primary} onClick={() => setAdding(true)}>Add members</button>}
          />
        )}
      </Panel>
      </PageBody>

      <AddMembersDialog team={adding ? team : null} users={users} teams={teams} onClose={() => setAdding(false)} />
      <TeamDialog mode={editing ? 'edit' : null} team={team} users={users} teams={teams} onClose={() => setEditing(false)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </PageFrame>
  );
}