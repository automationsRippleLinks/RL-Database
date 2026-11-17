/** The Administration dialogs and the user drawer. Each reports the backend's refusal in place, never with a silent failure. */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DetailDrawer } from '@/components/DetailDrawer';
import { useDismissable } from '@/hooks/useDismissable';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { APPROVED_DOMAIN, inDomain, isEmail, lockReason, plural, roleOf, ROLE_LABEL, statusOf } from './helpers';
import { Avatar, btn, fieldClass, SelectBox, Spinner } from './parts';
import { useAdminTeams, useCreateTeam, useInvite, useUpdateTeam, useUpdateUser } from './queries';
import type { AdminTeam, AdminUser, Role, UserPatch } from './types';

const errorText = (e: unknown) => (e instanceof ApiError ? e.detail : 'That did not work. Nothing was changed. Please try again.');

function Modal({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('rounded-2xl border-rp-border bg-rp-surface p-5 shadow-rp', wide ? 'max-w-130' : 'max-w-110')}>
        <DialogTitle className="text-[16px] font-bold">{title}</DialogTitle>
        <DialogDescription className={description ? 'mt-1 text-xs text-rp-muted' : 'sr-only'}>{description ?? title}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1 block text-[11.5px] font-semibold text-rp-muted">{children}</label>
);
const FieldError = ({ children }: { children?: ReactNode }) => (children ? <p role="alert" className="mt-1.5 text-xs text-rp-danger">{children}</p> : null);

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', on ? 'bg-rp-primary' : 'bg-rp-faint')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
    </button>
  );
}

const roleOptions = (me: AdminUser | null) =>
  (['member', 'admin', 'super'] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r], disabled: r !== 'member' && !me?.is_superadmin }));

const roleToPatch = (role: Role): UserPatch => ({ is_admin: role === 'admin', is_superadmin: role === 'super' });

// ── user drawer ───────────────────────────────────────────────────────────────

export function UserDrawer({ user, me, onClose, onDeactivate }: { user: AdminUser; me: AdminUser | null; onClose: () => void; onDeactivate: (u: AdminUser, save: () => Promise<unknown>) => void }) {
  const teams = useAdminTeams().data ?? [];
  const update = useUpdateUser();
  const { flash } = useToast();
  const [role, setRole] = useState<Role>(roleOf(user));
  const [teamId, setTeamId] = useState(user.team_id == null ? '' : String(user.team_id));
  const [active, setActive] = useState(user.is_currently_employed);
  const [edit, setEdit] = useState(user.can_edit);
  const [ingest, setIngest] = useState(user.can_ingest);
  const [error, setError] = useState('');
    // Click anywhere outside the drawer (or press Esc) to close it. Skipped while a confirm dialog is open on top.
  useDismissable(['drawer', 'results'], true, () => {
        if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
    onClose();
  });

  const roleLock = lockReason(me, user, 'role');
  const statusLock = lockReason(me, user, 'status');
  const full = role === 'super';

  const patch = useMemo(() => {
    const p: UserPatch = {};
    if (role !== roleOf(user) && !roleLock) Object.assign(p, roleToPatch(role));
    if (!full && edit !== user.can_edit) p.can_edit = edit;
    if (!full && ingest !== user.can_ingest) p.can_ingest = ingest;
    if (active !== user.is_currently_employed && !statusLock) p.is_currently_employed = active;
    const next = teamId === '' ? null : Number(teamId);
    if (next !== user.team_id) p.team_id = next;
    return p;
  }, [role, edit, ingest, active, teamId, user, roleLock, statusLock, full]);
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setError('');
    try {
      await update.mutateAsync({ id: user.id, patch });
      flash(`Saved changes to ${user.name}`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <DetailDrawer ariaLabel={`${user.name}, user details`} closing={false}>
      <div className="flex items-start gap-3 border-b border-rp-border px-5 py-4">
        <Avatar id={user.id} name={user.name} size="xl" />
        <div className="min-w-0 flex-1 self-center">
          <h2 className="truncate text-[15px] font-bold">{user.name}{user.id === me?.id && ' (you)'}</h2>
          <p className="truncate text-xs text-rp-muted">{user.email}</p>
        </div>
        <button aria-label="Close" onClick={onClose} className="cursor-pointer rounded-md p-1.5 text-rp-muted hover:bg-rp-surface2"><X className="size-4" /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
        <div>
          <Label htmlFor="dr-role">Role</Label>
          <SelectBox label="Role" value={role} onChange={(v) => setRole(v as Role)} disabled={!!roleLock} title={roleLock} className="w-full">
            {roleOptions(me).map((o) => <option key={o.value} value={o.value} disabled={o.disabled && o.value !== roleOf(user)}>{o.label}</option>)}
          </SelectBox>
          {roleLock && <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-rp-muted"><Lock className="size-3" />{roleLock}</p>}
        </div>
        <div>
          <Label htmlFor="dr-status">Status</Label>
          <SelectBox label="Status" value={active ? 'on' : 'off'} onChange={(v) => setActive(v === 'on')} disabled={!!statusLock} title={statusLock} className="w-full">
            <option value="on">Active</option>
            <option value="off">Inactive</option>
          </SelectBox>
          {!statusLock && statusOf(user) === 'pending' && <p className="mt-1.5 text-[11.5px] text-rp-muted">Email not verified yet.</p>}
        </div>
        <div>
          <Label htmlFor="dr-team">Team</Label>
          <SelectBox label="Team" value={teamId} onChange={setTeamId} className="w-full">
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectBox>
        </div>
        <div>
          <span className="mb-1 block text-[11.5px] font-semibold text-rp-muted">Permissions</span>
          {full && <p className="mb-2 text-[11.5px] text-rp-muted">Super admins have every permission.</p>}
          <div className="divide-y divide-rp-border rounded-xl border border-rp-border">
            {([['Can edit', edit, setEdit, 'Change creator details'], ['Can ingest', ingest, setIngest, 'Upload data and manage tags']] as const).map(([label, on, set, hint]) => (
              <div key={label} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{label}</div>
                  <div className="text-[11.5px] text-rp-muted">{hint}</div>
                </div>
                <span className="text-[10.5px] font-bold text-rp-muted">{full || on ? 'ON' : 'OFF'}</span>
                <Switch on={full || on} onChange={set} label={label} disabled={full} />
              </div>
            ))}
          </div>
        </div>
        <FieldError>{error}</FieldError>
      </div>

      <div className="flex justify-end gap-2 border-t border-rp-border px-5 py-3">
        <button className={btn.base} onClick={onClose}>Cancel</button>
        <button
          className={btn.primary} disabled={!dirty || update.isPending}
          onClick={() => (patch.is_currently_employed === false ? onDeactivate(user, save) : save())}
        >
          {update.isPending && <Spinner />}Save changes
        </button>
      </div>
    </DetailDrawer>
  );
}

// ── edit user ─────────────────────────────────────────────────────────────────

export function EditUserDialog({ user, me, onClose }: { user: AdminUser | null; me: AdminUser | null; onClose: () => void }) {
  return (
    <Modal open={!!user} onClose={onClose} title="Edit user" wide>
      {user && <EditUserForm key={user.id} user={user} me={me} onClose={onClose} />}
    </Modal>
  );
}

function EditUserForm({ user, me, onClose }: { user: AdminUser; me: AdminUser | null; onClose: () => void }) {
  const teams = useAdminTeams().data ?? [];
  const update = useUpdateUser();
  const { flash } = useToast();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(roleOf(user));
  const [teamId, setTeamId] = useState(user.team_id == null ? '' : String(user.team_id));
  const [error, setError] = useState('');
  const roleLock = lockReason(me, user, 'role');
  const nameError = !name.trim() ? 'Enter a name.' : name.trim().length > 100 ? 'Keep the name under 100 characters.' : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const patch: UserPatch = {};
    if (name.trim() !== user.name) patch.name = name.trim();
    if (role !== roleOf(user) && !roleLock) Object.assign(patch, roleToPatch(role));
    const next = teamId === '' ? null : Number(teamId);
    if (next !== user.team_id) patch.team_id = next;
    if (!Object.keys(patch).length) { flash('No changes to save'); onClose(); return; }
    try {
      await update.mutateAsync({ id: user.id, patch });
      flash(`Saved changes to ${patch.name ?? user.name}`);
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3.5">
      <div>
        <Label htmlFor="edit-name">Full name</Label>
        <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} className={cn(fieldClass, 'w-full', nameError && 'border-rp-danger')} />
        <FieldError>{nameError}</FieldError>
      </div>
      <div>
        <Label htmlFor="edit-email">Email</Label>
        <input id="edit-email" value={user.email} disabled className={cn(fieldClass, 'w-full')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="edit-role">Role</Label>
          <SelectBox label="Role" value={role} onChange={(v) => setRole(v as Role)} disabled={!!roleLock} title={roleLock} className="w-full">
            {roleOptions(me).map((o) => <option key={o.value} value={o.value} disabled={o.disabled && o.value !== roleOf(user)}>{o.label}</option>)}
          </SelectBox>
        </div>
        <div>
          <Label htmlFor="edit-team">Team</Label>
          <SelectBox label="Team" value={teamId} onChange={setTeamId} className="w-full">
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectBox>
        </div>
      </div>
      {roleLock && <p className="flex items-center gap-1.5 text-[11.5px] text-rp-muted"><Lock className="size-3" />{roleLock}</p>}
      <FieldError>{error}</FieldError>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={btn.base} onClick={onClose}>Cancel</button>
        <button type="submit" className={btn.primary} disabled={!!nameError || update.isPending}>{update.isPending && <Spinner />}Save changes</button>
      </div>
    </form>
  );
}

// ── invite ────────────────────────────────────────────────────────────────────

const splitEmails = (text: string) => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function InviteDialog({ open, onClose, me, existingEmails, defaultTeamId }: { open: boolean; onClose: () => void; me: AdminUser | null; existingEmails: Set<string>; defaultTeamId?: number | null }) {
  return (
    <Modal open={open} onClose={onClose} title="Invite user" description={`Only @${APPROVED_DOMAIN} addresses. They get an email with a sign-up link.`} wide>
      {open && <InviteForm me={me} existingEmails={existingEmails} defaultTeamId={defaultTeamId ?? null} onClose={onClose} />}
    </Modal>
  );
}

function InviteForm({ me, existingEmails, defaultTeamId, onClose }: { me: AdminUser | null; existingEmails: Set<string>; defaultTeamId: number | null; onClose: () => void }) {
  const teams = useAdminTeams().data ?? [];
  const invite = useInvite();
  const { flash } = useToast();
  const [text, setText] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [teamId, setTeamId] = useState(defaultTeamId == null ? '' : String(defaultTeamId));
  const [edit, setEdit] = useState(false);
  const [ingest, setIngest] = useState(false);
  const [error, setError] = useState('');

  const chips = splitEmails(text).map((email) => {
    const msg = !isEmail(email) ? 'Not a valid email' : !inDomain(email) ? `Only @${APPROVED_DOMAIN}` : existingEmails.has(email) ? 'Already invited or has an account' : '';
    return { email, msg };
  });
  const good = chips.filter((c) => !c.msg);
  const canSend = good.length > 0 && chips.every((c) => !c.msg) && !invite.isPending;

  const send = async () => {
    setError('');
    try {
      await invite.mutateAsync({ emails: good.map((c) => c.email), role, team_id: teamId === '' ? null : Number(teamId), can_edit: edit || role === 'super', can_ingest: ingest || role === 'super' });
      flash(good.length === 1 ? `Invitation sent to ${good[0].email}` : `${good.length} invitations sent`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="mt-4 space-y-3.5">
      <div>
        <Label htmlFor="invite-emails">Email addresses</Label>
        <textarea id="invite-emails" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`name@${APPROVED_DOMAIN}`} className={cn(fieldClass, 'h-auto w-full py-2')} />
        <p className="mt-1 text-[11.5px] text-rp-muted">Separate several with commas or new lines.</p>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.email} title={c.msg} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', c.msg ? 'bg-rp-danger/12 text-rp-danger' : 'bg-rp-success/15 text-rp-success')}>
              {c.email}{c.msg && <span className="font-medium"> · {c.msg}</span>}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="invite-role">Role</Label>
          <SelectBox label="Role" value={role} onChange={(v) => setRole(v as Role)} className="w-full">
            {roleOptions(me).map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
          </SelectBox>
        </div>
        <div>
          <Label htmlFor="invite-team">Team (optional)</Label>
          <SelectBox label="Team" value={teamId} onChange={setTeamId} className="w-full">
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectBox>
        </div>
      </div>
      {!me?.is_superadmin && <p className="-mt-1.5 text-[11.5px] text-rp-muted">Admin and Super admin roles can only be given by a super admin.</p>}
      <div>
        <span className="mb-1 block text-[11.5px] font-semibold text-rp-muted">Permissions</span>
        <div className="space-y-2">
          {([['Can edit', edit, setEdit], ['Can ingest', ingest, setIngest]] as const).map(([label, on, set]) => (
            <div key={label} className="flex items-center gap-3 text-xs font-semibold">
              <Switch on={role === 'super' || on} onChange={set} label={label} disabled={role === 'super'} />{label}
            </div>
          ))}
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex justify-end gap-2 pt-1">
        <button className={btn.base} onClick={onClose}>Cancel</button>
        <button className={btn.primary} disabled={!canSend} onClick={send}>
          {invite.isPending && <Spinner />}{good.length > 1 ? `Send ${good.length} invitations` : 'Send invitation'}
        </button>
      </div>
    </div>
  );
}

// ── team: create / rename ─────────────────────────────────────────────────────

export function TeamDialog({ mode, team, users, teams, onClose }: { mode: 'new' | 'edit' | null; team?: AdminTeam; users: AdminUser[]; teams: AdminTeam[]; onClose: () => void }) {
  return (
    <Modal open={mode !== null} onClose={onClose} title={mode === 'new' ? 'New team' : 'Edit team'}>
      {mode && <TeamForm key={team?.id ?? 'new'} mode={mode} team={team} users={users} teams={teams} onClose={onClose} />}
    </Modal>
  );
}

function TeamForm({ mode, team, users, teams, onClose }: { mode: 'new' | 'edit'; team?: AdminTeam; users: AdminUser[]; teams: AdminTeam[]; onClose: () => void }) {
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const { flash } = useToast();
  const [name, setName] = useState(team?.name ?? '');
  const [lead, setLead] = useState(team?.lead_id == null ? '' : String(team.lead_id));
  const [picked, setPicked] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const trimmed = name.trim();
  const clash = teams.some((t) => t.id !== team?.id && t.name.toLowerCase() === trimmed.toLowerCase());
  const nameError = !trimmed ? '' : clash ? 'A team with that name already exists.' : trimmed.length > 60 ? 'Keep the name under 60 characters.' : '';

  // The lead has to be on the team: current members when editing, the people ticked when creating.
  const leadChoices = mode === 'edit' ? users.filter((u) => u.team_id === team?.id) : users.filter((u) => picked.includes(u.id));
  const candidates = users
    .filter((u) => u.is_currently_employed && (!q.trim() || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => Number(a.team_id != null) - Number(b.team_id != null) || a.name.localeCompare(b.name))
    .slice(0, 30);
  const busy = create.isPending || update.isPending;

  const save = async () => {
    setError('');
    try {
      if (mode === 'new') {
        await create.mutateAsync({ name: trimmed, lead_id: lead === '' ? null : Number(lead), member_ids: picked });
        flash(`${trimmed} was created`);
      } else if (team) {
        await update.mutateAsync({ id: team.id, patch: { name: trimmed, lead_id: lead === '' ? null : Number(lead) } });
        flash(`Saved changes to ${trimmed}`);
      }
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="mt-4 space-y-3.5">
      <div>
        <Label htmlFor="team-name">Team name</Label>
        <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Brand Partnerships" className={cn(fieldClass, 'w-full', nameError && 'border-rp-danger')} />
        <FieldError>{nameError}</FieldError>
      </div>
      {mode === 'new' && (
        <div>
          <span className="mb-1 flex justify-between text-[11.5px] font-semibold text-rp-muted">Members <small className="font-medium">{picked.length ? `${picked.length} chosen` : 'optional'}</small></span>
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-rp-muted" />
            <input aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className={cn(fieldClass, 'w-full pl-8')} />
          </div>
          <div className="max-h-44 overflow-y-auto rounded-xl border border-rp-border scrollbar-thin">
            {candidates.map((u) => {
              const on = picked.includes(u.id);
              return (
                <button
                  key={u.id} type="button" role="checkbox" aria-checked={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))}
                  className="flex w-full cursor-pointer items-center gap-2.5 border-b border-rp-border px-3 py-2 text-left last:border-0 hover:bg-rp-surface2"
                >
                  <span className={cn('flex size-4 items-center justify-center rounded border-[1.5px] text-[10px] text-rp-primary-fg', on ? 'border-rp-primary bg-rp-primary' : 'border-rp-box')}>{on && '✓'}</span>
                  <Avatar id={u.id} name={u.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{u.name}</span>
                  <span className="text-[11px] text-rp-muted">{u.team_id == null ? 'Unassigned' : `In ${teams.find((t) => t.id === u.team_id)?.name} · will move`}</span>
                </button>
              );
            })}
            {candidates.length === 0 && <p className="px-3 py-4 text-center text-xs text-rp-muted">No one matches.</p>}
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="team-lead">Team lead</Label>
        <SelectBox label="Team lead" value={lead} onChange={setLead} disabled={leadChoices.length === 0} className="w-full">
          <option value="">{leadChoices.length === 0 ? 'Add members first' : 'No lead'}</option>
          {leadChoices.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </SelectBox>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex justify-end gap-2 pt-1">
        <button className={btn.base} onClick={onClose}>Cancel</button>
        <button className={btn.primary} disabled={!trimmed || !!nameError || busy} onClick={save}>
          {busy && <Spinner />}{mode === 'new' ? (picked.length ? `Create team with ${plural(picked.length, 'member')}` : 'Create team') : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

// ── team: add members ─────────────────────────────────────────────────────────

export function AddMembersDialog({ team, users, teams, onClose }: { team: AdminTeam | null; users: AdminUser[]; teams: AdminTeam[]; onClose: () => void }) {
  const update = useUpdateUser();
  const { flash } = useToast();
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const needle = q.trim().toLowerCase();
  const candidates = team
    ? users
        .filter((u) => u.team_id !== team.id && u.is_currently_employed && (!needle || `${u.name} ${u.email}`.toLowerCase().includes(needle)))
        .sort((a, b) => Number(a.team_id != null) - Number(b.team_id != null) || a.name.localeCompare(b.name))
        .slice(0, 8)
    : [];

  const add = async (u: AdminUser) => {
    if (!team) return;
    setError('');
    try {
      await update.mutateAsync({ id: u.id, patch: { team_id: team.id } });
      flash(`${u.name} was added to ${team.name}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Modal open={!!team} onClose={() => { setQ(''); setError(''); onClose(); }} title={`Add members to ${team?.name ?? ''}`}>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-rp-muted" />
        <input aria-label="Search people" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} className={cn(fieldClass, 'w-full pl-8')} />
      </div>
      <div className="mt-2 divide-y divide-rp-border">
        {candidates.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-2.5">
            <Avatar id={u.id} name={u.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{u.name}</div>
              <div className="text-[11px] text-rp-muted">{u.team_id == null ? 'Unassigned' : `In ${teams.find((t) => t.id === u.team_id)?.name} · will move`}</div>
            </div>
            <button className={cn(btn.base, btn.small)} disabled={update.isPending} onClick={() => add(u)}>Add</button>
          </div>
        ))}
        {candidates.length === 0 && <p className="py-5 text-center text-xs text-rp-muted">No one else matches.</p>}
      </div>
      <FieldError>{error}</FieldError>
      <div className="mt-3 flex justify-end"><button className={btn.primary} onClick={() => { setQ(''); setError(''); onClose(); }}>Done</button></div>
    </Modal>
  );
}