import { useCallback, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Mail, Shield, Users, UsersRound } from 'lucide-react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { AdminActionsContext, type AdminActions } from '@/features/admin/context';
import { EditUserDialog, InviteDialog, UserDrawer } from '@/features/admin/dialogs';
import { useAdminTeams, useAdminUsers, useInvitations, useSignOutEverywhere, useUpdateUser } from '@/features/admin/queries';
import { cn } from '@/lib/utils';

/**
 * The frame around every Administration screen: the section tabs, and the dialogs
 * that more than one screen opens (a person's drawer, edit, invite, deactivate).
 * They live here so each screen only says "open this person" and never owns a dialog.
 */
export function AdminLayout() {
  const { user: session } = useAuth();

  const users = useAdminUsers().data;
  const teams = useAdminTeams().data;
  const invitations = useInvitations().data;
  const update = useUpdateUser();
  const signOut = useSignOutEverywhere();
  const { flash } = useToast();

  const me = useMemo(() => {
    if (!users) return null;
    return users.find((u) => u.id === session?.id) ?? null;
  }, [users, session?.id]);

  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [invite, setInvite] = useState<{ teamId: number | null } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const byId = useCallback((id: number | null) => users?.find((u) => u.id === id) ?? null, [users]);
  const existingEmails = useMemo(
    () => new Set([...(users ?? []).map((u) => u.email.toLowerCase()), ...(invitations ?? []).filter((i) => i.status === 'pending').map((i) => i.email.toLowerCase())]),
    [users, invitations],
  );

  const askDeactivate = useCallback((u: { id: number; name: string }, run: () => Promise<unknown> | unknown) =>
    setConfirm({
      title: `Deactivate ${u.name}?`,
      body: 'They are signed out everywhere and cannot sign in until you reactivate them.',
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: run,
    }), []);

  const actions: AdminActions = useMemo(() => ({
    me,
    openUser: (id) => setDrawerId(id),
    editUser: (u) => { setDrawerId(null); setEditing(u.id); },
    openInvite: (teamId = null) => setInvite({ teamId }),
    deactivate: (u) => askDeactivate(u, async () => {
      await update.mutateAsync({ id: u.id, patch: { is_currently_employed: false } });
      flash(`${u.name} was deactivated and signed out everywhere`);
    }),
    reactivate: async (u) => {
      try {
        await update.mutateAsync({ id: u.id, patch: { is_currently_employed: true } });
        flash(`${u.name} was reactivated`);
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Could not reactivate');
      }
    },
    signOutEverywhere: async (u) => {
      try {
        await signOut.mutateAsync(u.id);
        flash(`${u.name} was signed out everywhere`);
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Could not sign out');
      }
    },
    assignTeam: async (u, teamId) => {
      try {
        await update.mutateAsync({ id: u.id, patch: { team_id: teamId } });
        const t = teams?.find((x) => x.id === teamId);
        flash(t ? `${u.name} was added to ${t.name}` : `${u.name} was removed from their team`);
      } catch (e) {
        flash(e instanceof Error ? e.message : 'Could not change the team');
      }
    },
  }), [me, update, signOut, flash, teams, askDeactivate]);

  const tabs = [
    { to: '/admin/users', label: 'Users & access', icon: Users, count: users?.length },
    { to: '/admin/teams', label: 'Teams', icon: UsersRound, count: teams?.length },
    { to: '/admin/invitations', label: 'Invitations', icon: Mail, count: invitations?.filter((i) => i.status === 'pending').length },
    { to: '/admin/activity', label: 'Activity', icon: Activity },
  ];

  const drawerUser = byId(drawerId);
  const editUser = byId(editing);

  return (
    <AdminActionsContext value={actions}>
      <div className="flex h-full flex-col">
        <div className="mb-5 flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-rp-border pb-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-rp-primary-soft text-rp-primary"><Shield className="size-4" /></span>
            Administration
          </div>
          <nav aria-label="Administration sections" className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <NavLink
                key={t.to} to={t.to}
                className={({ isActive }) =>
                  cn('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors', isActive ? 'bg-rp-primary-soft text-rp-primary' : 'text-rp-muted hover:bg-rp-surface2 hover:text-rp-text')
                }
              >
                <t.icon className="size-3.5" />
                {t.label}
                {t.count !== undefined && <span className="rounded-full bg-rp-surface2 px-1.5 text-[10.5px] tabular-nums">{t.count}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Each page keeps its title and filters fixed and scrolls only its own list. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>

      {drawerUser && (
        <UserDrawer
          key={drawerUser.id}
          user={drawerUser}
          me={me}
          onClose={() => setDrawerId(null)}
          onDeactivate={(u, save) => askDeactivate(u, save)}
        />
      )}
      <EditUserDialog user={editUser} me={me} onClose={() => setEditing(null)} />
      <InviteDialog open={!!invite} defaultTeamId={invite?.teamId} me={me} existingEmails={existingEmails} onClose={() => setInvite(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </AdminActionsContext>
  );
}