import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, MoreHorizontal, Pencil, Plus, Power, LogOut, Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAdminActions } from '@/features/admin/context';
import { lockReason, roleOf, statusOf, STATUS_LABEL } from '@/features/admin/helpers';
import { TableSearch } from '@/components/TableSearch';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar, btn, Fixed, PageFrame, CountBar, PageBody, STICKY_HEAD, TABLE_PANEL, TABLE_SCROLL, LinkButton, PageHeader, Panel, RoleBadge, SegTabs, SelectBox, SkeletonRows, UserStatusPill, Toolbar } from '@/features/admin/parts';
import { useAdminTeams, useAdminUsers } from '@/features/admin/queries';
import type { AdminUser, Role, UserStatus } from '@/features/admin/types';
import { cn } from '@/lib/utils';

const COLS = 'grid grid-cols-[minmax(230px,2fr)_130px_minmax(120px,1fr)_100px_84px] items-center gap-3';

export function UsersPage() {
  const actions = useAdminActions();
  const usersQ = useAdminUsers();
  const teamsQ = useAdminTeams();
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const teams = teamsQ.data ?? [];
  const teamName = (id: number | null) => teams.find((t) => t.id === id)?.name;

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | UserStatus>('all');
  const [role, setRole] = useState<'all' | Role>('all');
  const [team, setTeam] = useState('all');

  const needle = q.trim().toLowerCase();
  // Status counts follow the other filters, so the tab numbers always add up to the rows you would get.
  const base = useMemo(
    () =>
      users.filter((u) => {
        if (needle && !`${u.name} ${u.email}`.toLowerCase().includes(needle)) return false;
        if (role !== 'all' && roleOf(u) !== role) return false;
        if (team === 'none' ? u.team_id != null : team !== 'all' && String(u.team_id) !== team) return false;
        return true;
      }),
    [users, needle, role, team],
  );
  const rows = base.filter((u) => status === 'all' || statusOf(u) === status).sort((a, b) => a.name.localeCompare(b.name));
  const count = (k: UserStatus) => base.filter((u) => statusOf(u) === k).length;
  const filtered = !!needle || status !== 'all' || role !== 'all' || team !== 'all';
  const clear = () => { setQ(''); setStatus('all'); setRole('all'); setTeam('all') };

  return (
    <PageFrame>
      <Fixed>
        <PageHeader
          title="Users & access"
          subtitle="Who can sign in, what they can do and which team they are in."
          actions={<button className={btn.primary} onClick={() => actions.openInvite()}><Plus className="size-3.5" />Invite user</button>}
        />

        <Toolbar>
          <TableSearch label="Search users by name or email" placeholder="Search by name or email" value={q} onChange={(v) => { setQ(v) }} />
          <SegTabs
            label="Status" value={status} onChange={(k) => { setStatus(k) }}
            items={[{ key: 'all', label: 'All', count: base.length }, { key: 'active', label: 'Active', count: count('active') }, { key: 'pending', label: 'Pending', count: count('pending') }, { key: 'off', label: 'Inactive', count: count('off') }]}
          />
          <SelectBox label="Role" value={role} onChange={(v) => { setRole(v as 'all' | Role) }}>
            <option value="all">All roles</option>
            <option value="super">Super admin</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </SelectBox>
          <SelectBox label="Team" value={team} onChange={(v) => { setTeam(v) }}>
            <option value="all">All teams</option>
            <option value="none">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectBox>
          {filtered && <LinkButton onClick={clear}>Clear</LinkButton>}
        </Toolbar>
      </Fixed>

      <PageBody>
        {usersQ.isError && <ErrorState error={usersQ.error} onRetry={() => usersQ.refetch()} className="mb-3 py-8" />}
        {usersQ.isLoading && <SkeletonRows count={7} />}

        {usersQ.isSuccess && users.length === 0 && (
          <Panel><EmptyState icon={<Users className="size-5" />} title="No users yet" description="Invite your first teammates to get started." action={<button className={btn.primary} onClick={() => actions.openInvite()}>Invite user</button>} /></Panel>
        )}
        {usersQ.isSuccess && users.length > 0 && rows.length === 0 && (
          <Panel><EmptyState icon={<Users className="size-5" />} title="No users match" description="Try another name or clear the filters." action={<button className={btn.base} onClick={clear}>Clear filters</button>} /></Panel>
        )}

        {rows.length > 0 && (
          <Panel className={TABLE_PANEL}>
            <div className={TABLE_SCROLL}>
              <div className="min-w-190">
                <div className={cn(COLS, STICKY_HEAD, 'border-b border-rp-border bg-rp-head px-4 py-2.5 text-[11px] font-bold tracking-wide text-rp-muted uppercase')}>
                  <span>User</span><span>Role</span><span>Team</span><span>Status</span><span />
                </div>
                {rows.map((u) => (
                  <UserRow key={u.id} user={u} teamName={teamName(u.team_id)} />
                ))}
              </div>
            </div>
            <CountBar total={rows.length} noun="users" />
          </Panel>
        )}
      </PageBody>
    </PageFrame>
  );
}

function UserRow({ user: u, teamName }: { user: AdminUser; teamName?: string }) {
  const actions = useAdminActions();
  const [menu, setMenu] = useState(false);
  const st = statusOf(u);
  const flipLock = lockReason(actions.me, u, 'status');
  const close = (fn: () => void) => () => { setMenu(false); fn(); };

  return (
    <div data-rp-pop="results" className={cn(COLS, 'border-b border-rp-border px-4 py-2.5 last:border-0 hover:bg-rp-surface2/60')}>
      <button className="flex min-w-0 cursor-pointer items-center gap-3 text-left" onClick={() => actions.openUser(u.id)} title={`Open ${u.name}`}>
        <Avatar id={u.id} name={u.name} />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold">{u.name}{u.id === actions.me?.id && <span className="font-normal text-rp-muted"> (you)</span>}</span>
          <span className="block truncate text-[11.5px] text-rp-muted">{u.email}</span>
        </span>
      </button>
      <span><RoleBadge role={roleOf(u)} /></span>
      <span className="min-w-0 truncate text-xs">
        {u.team_id != null && teamName ? <Link to={`/admin/teams/${u.team_id}`} className="font-medium hover:text-rp-primary hover:underline">{teamName}</Link> : <span className="text-rp-muted">No team</span>}
      </span>
      <span><UserStatusPill status={st} label={STATUS_LABEL[st]} /></span>
      <span className="flex justify-end gap-1">
        <button aria-label={`Edit ${u.name}`} title="Edit user" onClick={() => actions.editUser(u)} className="cursor-pointer rounded-md p-1.5 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"><Pencil className="size-3.5" /></button>
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger asChild>
            <button aria-label={`More actions for ${u.name}`} className="cursor-pointer rounded-md p-1.5 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"><MoreHorizontal className="size-3.5" /></button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 border-rp-border bg-rp-surface p-1">
            <MenuItem icon={<Eye className="size-3.5" />} onClick={close(() => actions.openUser(u.id))}>View profile</MenuItem>
            <MenuItem icon={<Pencil className="size-3.5" />} onClick={close(() => actions.editUser(u))}>Edit user</MenuItem>
            <MenuItem
              icon={<Power className="size-3.5" />} danger={u.is_currently_employed} disabled={!!flipLock} title={flipLock}
              onClick={close(() => (u.is_currently_employed ? actions.deactivate(u) : actions.reactivate(u)))}
            >
              {u.is_currently_employed ? 'Deactivate' : 'Reactivate'}
            </MenuItem>
            <MenuItem icon={<LogOut className="size-3.5" />} disabled={u.active_sessions === 0} title={u.active_sessions === 0 ? 'No live sign-ins' : 'End every live sign-in'} onClick={close(() => actions.signOutEverywhere(u))}>
              Sign out everywhere
            </MenuItem>
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger, disabled, title }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      role="menuitem" disabled={disabled} title={title} onClick={onClick}
      className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-45', danger && 'text-rp-danger')}
    >
      {icon}{children}
    </button>
  );
}