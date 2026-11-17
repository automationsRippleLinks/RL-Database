import { useState } from 'react';
import { Lock, Mail, Plus, RefreshCw, X } from 'lucide-react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminActions } from '@/features/admin/context';
import { ago, APPROVED_DOMAIN, dateOf } from '@/features/admin/helpers';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar, btn, Fixed, PageFrame, PageBody, STICKY_HEAD, TABLE_PANEL, TABLE_SCROLL, PageHeader, Panel, RoleBadge, SegTabs, SkeletonRows, UserStatusPill, Toolbar } from '@/features/admin/parts';
import { useAdminTeams, useAdminUsers, useCancelInvitation, useInvitations, useResendInvitation } from '@/features/admin/queries';
import type { InviteStatus } from '@/features/admin/types';
import { cn } from '@/lib/utils';

const COLS = 'grid grid-cols-[minmax(220px,2fr)_130px_minmax(110px,1fr)_110px_190px_minmax(180px,1fr)] items-center gap-3';
const STATUS_LABEL: Record<InviteStatus, string> = { pending: 'Pending', accepted: 'Accepted', expired: 'Expired' };

function timing(status: InviteStatus, expiresAt: string | null, acceptedAt: string | null, sentAt: string) {
  if (status === 'pending' && expiresAt) {
    const days = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 864e5));
    return days <= 1 ? 'Expires today or tomorrow' : `Expires in ${days} days`;
  }
  if (status === 'accepted' && acceptedAt) return `Joined ${dateOf(acceptedAt)}`;
  return `Sent ${ago(sentAt)}`;
}

export function InvitationsPage() {
  const actions = useAdminActions();
  const { flash } = useToast();
  const invQ = useInvitations();
  const teams = useAdminTeams().data ?? [];
  const users = useAdminUsers().data ?? [];
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();
  const [tab, setTab] = useState<'all' | InviteStatus>('pending');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const all = [...(invQ.data ?? [])].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const count = (s: InviteStatus) => all.filter((i) => i.status === s).length;
  const rows = all.filter((i) => tab === 'all' || i.status === tab);
  const personFor = (email: string) => users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  return (
    <PageFrame>
      <Fixed>
      <PageHeader title="Invitations" subtitle="Everyone you have invited, and whether they have joined." actions={<button className={btn.primary} onClick={() => actions.openInvite()}><Plus className="size-3.5" />Invite user</button>} />

      <Toolbar>
        <SegTabs
          label="Status" value={tab} onChange={setTab}
          items={[{ key: 'pending', label: 'Pending', count: count('pending') }, { key: 'accepted', label: 'Accepted', count: count('accepted') }, { key: 'expired', label: 'Expired', count: count('expired') }, { key: 'all', label: 'All', count: all.length }]}
        />
        <span className="ml-auto flex items-center gap-1.5 text-xs text-rp-muted"><Lock className="size-3" />Approved domain: <b className="text-rp-text">@{APPROVED_DOMAIN}</b></span>
      </Toolbar>
      </Fixed>

      <PageBody>
      {invQ.isError && <ErrorState error={invQ.error} onRetry={() => invQ.refetch()} className="mb-3 py-8" />}
      {invQ.isLoading && <SkeletonRows count={5} />}

      {invQ.isSuccess && rows.length === 0 && (
        <Panel>
          <EmptyState
            icon={<Mail className="size-5" />}
            title={tab === 'all' ? 'No invitations yet' : `No ${STATUS_LABEL[tab as InviteStatus].toLowerCase()} invitations`}
            description="Invitations you send show up here with their status."
            action={<button className={btn.primary} onClick={() => actions.openInvite()}>Invite user</button>}
          />
        </Panel>
      )}

      {rows.length > 0 && (
        <Panel className={TABLE_PANEL}>
          <div className={TABLE_SCROLL}>
            <div className="min-w-250">
              <div className={cn(COLS, STICKY_HEAD, 'border-b border-rp-border bg-rp-head px-4 py-2.5 text-[11px] font-bold tracking-wide text-rp-muted uppercase')}>
                <span>Email</span><span>Role</span><span>Team</span><span>Invited</span><span>Status</span><span />
              </div>
              {rows.map((i) => {
                const person = i.status === 'accepted' ? personFor(i.email) : undefined;
                return (
                  <div key={i.id} className={cn(COLS, 'border-b border-rp-border px-4 py-2.5 last:border-0 hover:bg-rp-surface2/60')}>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar id={i.id} name={i.email.split('@')[0].replace(/[._]/g, ' ')} size="sm" />
                      <span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{i.email}</span><span className="block text-[11px] text-rp-muted">by {i.invited_by_name}</span></span>
                    </span>
                    <span><RoleBadge role={i.role} /></span>
                    <span className={cn('truncate text-xs', i.team_id == null && 'text-rp-muted')}>{teams.find((t) => t.id === i.team_id)?.name ?? 'No team'}</span>
                    <span className="text-xs tabular-nums">{ago(i.sent_at)}</span>
                    <span><UserStatusPill status={i.status} label={STATUS_LABEL[i.status]} /><span className="mt-0.5 block text-[11px] text-rp-muted">{timing(i.status, i.expires_at, i.accepted_at, i.sent_at)}</span></span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {i.status !== 'accepted' && (
                        <button
                          className={cn(btn.base, btn.small)} disabled={resend.isPending}
                          onClick={async () => { try { await resend.mutateAsync(i.id); flash(`Invitation re-sent to ${i.email}`); } catch (e) { flash(e instanceof Error ? e.message : 'Could not resend'); } }}
                        ><RefreshCw className="size-3" />Resend</button>
                      )}
                      {i.status === 'pending' && (
                        <button
                          className={cn(btn.danger, btn.small)}
                          onClick={() => setConfirm({
                            title: `Cancel the invitation to ${i.email}?`, body: 'The link in their email stops working. You can invite them again later.', confirmLabel: 'Cancel invitation', danger: true,
                            onConfirm: async () => { await cancel.mutateAsync(i.id); flash(`Invitation to ${i.email} was cancelled`); },
                          })}
                        ><X className="size-3" />Cancel</button>
                      )}
                      {person && <button className={cn(btn.base, btn.small)} onClick={() => actions.openUser(person.id)}>View profile</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
      </PageBody>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </PageFrame>
  );
}