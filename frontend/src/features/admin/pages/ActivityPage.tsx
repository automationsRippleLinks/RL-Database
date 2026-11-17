import { useMemo, useState } from 'react';
import { ArrowRight, Check, Activity, LogIn, X } from 'lucide-react';
import { useAdminActions } from '@/features/admin/context';
import { ago, exact, groupByDay } from '@/features/admin/helpers';
import { TableSearch } from '@/components/TableSearch';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar, btn, Fixed, PageFrame, CountBar, PageBody, ScrollBody, TABLE_PANEL, TABLE_SCROLL, LinkButton, PageHeader, Panel, SegTabs, SelectBox, SkeletonRows, UserStatusPill, Toolbar } from '@/features/admin/parts';
import { useAdminUsers, useHistory, useLogins } from '@/features/admin/queries';
import type { AdminUser, HistoryEntry, HistoryType } from '@/features/admin/types';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<HistoryType, string> = { access: 'Access', account: 'Account', team: 'Team', invite: 'Invitation' };
const TYPE_TONE: Record<HistoryType, string> = {
  access: 'bg-rp-primary-soft text-rp-primary',
  account: 'bg-rp-warn/15 text-rp-warn',
  team: 'bg-rp-success/15 text-rp-success',
  invite: 'bg-rp-surface2 text-rp-muted',
};

export function ActivityPage() {
  const [view, setView] = useState<'changes' | 'signins'>('changes');
  const history = useHistory();
  const logins = useLogins();
  return (
    <PageFrame>
      <Fixed>
      <PageHeader
        title="Activity"
        subtitle="What admins changed, and who signed in."
        actions={<SegTabs label="Activity view" value={view} onChange={setView} items={[{ key: 'changes', label: 'Changes', count: history.data?.length }, { key: 'signins', label: 'Sign-ins', count: logins.data?.length }]} />}
      />
      </Fixed>
      {view === 'changes' ? <Changes /> : <SignIns />}
    </PageFrame>
  );
}

function Day({ label, first }: { label: string; first: boolean }) {
  return <div className={cn('border-b border-rp-border bg-rp-head px-4 py-1.5 text-[11px] font-bold tracking-wide text-rp-muted uppercase', !first && 'border-t')}>{label}</div>;
}

// ── changes ───────────────────────────────────────────────────────────────────

function Changes() {
  const actions = useAdminActions();
  const q = useHistory();
  const [type, setType] = useState<'all' | HistoryType>('all');
  const [actor, setActor] = useState('all');
  const [text, setText] = useState('');
  
  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [q.data]);
  const needle = text.trim().toLowerCase();
  const matches = (e: HistoryEntry) =>
    (actor === 'all' || String(e.actor_id) === actor) &&
    (!needle || `${e.actor_name} ${e.verb} ${e.target} ${e.tail} ${e.change?.field ?? ''} ${e.change?.from ?? ''} ${e.change?.to ?? ''}`.toLowerCase().includes(needle));
  const scoped = all.filter(matches);
  const rows = scoped.filter((e) => type === 'all' || e.type === type);
  const count = (t: HistoryType) => scoped.filter((e) => e.type === t).length;
  const actors = useMemo(() => {
    const seen = new Map<number, string>();
    all.forEach((e) => e.actor_id != null && seen.set(e.actor_id, e.actor_name));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const filtered = type !== 'all' || actor !== 'all' || !!needle;
  const clear = () => { setType('all'); setActor('all'); setText('') };
  const groups = groupByDay(rows);

  return (
    <PageFrame>
      <Fixed>
      <Toolbar>
        <SegTabs
          label="Type" value={type} onChange={(k) => { setType(k) }}
          items={[{ key: 'all', label: 'All', count: scoped.length }, ...(['access', 'account', 'team', 'invite'] as HistoryType[]).map((t) => ({ key: t, label: TYPE_LABEL[t], count: count(t) }))]}
        />
        <SelectBox label="Done by" value={actor} onChange={(v) => { setActor(v) }}>
          <option value="all">Anyone</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </SelectBox>
        {filtered && <LinkButton onClick={clear}>Clear filters</LinkButton>}
        <div className="ml-auto flex-1 sm:max-w-72"><TableSearch label="Search activity" placeholder="Search activity" value={text} onChange={(v) => { setText(v) }} /></div>
      </Toolbar>
      </Fixed>

      <PageBody>
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} className="mb-3 py-8" />}
      {q.isLoading && <SkeletonRows count={6} />}
      {q.isSuccess && rows.length === 0 && (
        <Panel><EmptyState icon={<Activity className="size-5" />} title={filtered ? 'No activity matches' : 'No changes yet'} description={filtered ? 'Try another filter.' : 'Changes to people, teams and invitations show up here.'} action={filtered && <button className={btn.base} onClick={clear}>Clear filters</button>} /></Panel>
      )}

      {rows.length > 0 && (
        <Panel className={TABLE_PANEL}>
          <div className={TABLE_SCROLL}>
          {groups.map((g, gi) => (
            <div key={g.label}>
              <Day label={g.label} first={gi === 0} />
              {g.items.map((e) => (
                <div key={e.id} className="flex items-start gap-3 border-b border-rp-border px-4 py-3 last:border-0">
                  <Avatar id={e.actor_id} name={e.actor_name} size="sm" />
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <div>
                      <b>{e.actor_name}</b> {e.verb}{' '}
                      {e.target_id != null ? <button className="cursor-pointer font-semibold text-rp-primary hover:underline" onClick={() => actions.openUser(e.target_id!)}>{e.target}</button> : <b>{e.target}</b>}
                      {e.tail}
                    </div>
                    {e.change && (
                      <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[11.5px]">
                        <span className="text-rp-muted">{e.change.field}</span>
                        <span className="rounded bg-rp-surface2 px-1.5 py-0.5 text-rp-muted line-through">{e.change.from}</span>
                        <ArrowRight className="size-3 text-rp-muted" />
                        <span className="rounded bg-rp-success/15 px-1.5 py-0.5 font-semibold text-rp-success">{e.change.to}</span>
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-rp-muted">{exact(e.at)}</div>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', TYPE_TONE[e.type])}>{TYPE_LABEL[e.type]}</span>
                  <span className="hidden w-16 text-right text-[11px] text-rp-muted tabular-nums sm:block">{ago(e.at)}</span>
                </div>
              ))}
            </div>
          ))}
          </div>
          <CountBar total={rows.length} noun="changes" />
        </Panel>
      )}
      </PageBody>
    </PageFrame>
  );
}

// ── sign-ins ──────────────────────────────────────────────────────────────────

function SignIns() {
  const actions = useAdminActions();
  const usersQ = useAdminUsers();
  const q = useLogins();
  const [result, setResult] = useState<'all' | 'ok' | 'failed'>('all');
  const [text, setText] = useState('');
  const users = usersQ.data ?? [];
  const byId = (id: number | null) => users.find((u) => u.id === id);

  const live = users.filter((u) => u.active_sessions > 0).sort((a, b) => (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''));
  const all = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [q.data]);
  const needle = text.trim().toLowerCase();
  const scoped = all.filter((l) => !needle || `${byId(l.user_id)?.name ?? ''} ${l.email}`.toLowerCase().includes(needle));
  const rows = scoped.filter((l) => result === 'all' || (result === 'ok') === l.ok);
  const groups = groupByDay(rows);
  const filtered = result !== 'all' || !!needle;

  return (
    <PageFrame>
      <ScrollBody>
      <Panel className="mb-4">
        <div className="border-b border-rp-border px-4 py-3">
          <h3 className="text-[13px] font-bold">Signed in now</h3>
          <p className="text-[11.5px] text-rp-muted">People with a live session. Last active is the time of their latest request.</p>
        </div>
        {live.length === 0 ? <p className="px-4 py-5 text-center text-xs text-rp-muted">Nobody has a live session.</p> : (
          <ul className="divide-y divide-rp-border">
            {live.map((u: AdminUser) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" onClick={() => actions.openUser(u.id)}>
                  <Avatar id={u.id} name={u.name} size="sm" />
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{u.name}</span><span className="block text-[11px] text-rp-muted">{u.active_sessions === 1 ? '1 live sign-in' : `${u.active_sessions} live sign-ins`} · active {ago(u.last_activity_at)}</span></span>
                </button>
                <button className={cn(btn.base, btn.small)} disabled={u.id === actions.me?.id} title={u.id === actions.me?.id ? 'That would sign you out too' : undefined} onClick={() => actions.signOutEverywhere(u)}>Sign out</button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="sticky top-0 z-10 bg-rp-bg pb-1">
      <Toolbar>
        <SegTabs
          label="Result" value={result} onChange={(k) => { setResult(k) }}
          items={[{ key: 'all', label: 'All', count: scoped.length }, { key: 'ok', label: 'Successful', count: scoped.filter((l) => l.ok).length }, { key: 'failed', label: 'Failed', count: scoped.filter((l) => !l.ok).length }]}
        />
        {filtered && <LinkButton onClick={() => { setResult('all'); setText('') }}>Clear filters</LinkButton>}
        <div className="ml-auto flex-1 sm:max-w-72"><TableSearch label="Search sign-ins" placeholder="Search by name or email" value={text} onChange={(v) => { setText(v) }} /></div>
      </Toolbar>
      </div>

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} className="mb-3 py-8" />}
      {q.isLoading && <SkeletonRows count={6} />}
      {q.isSuccess && rows.length === 0 && (
        <Panel><EmptyState icon={<LogIn className="size-5" />} title={filtered ? 'No sign-ins match' : 'No sign-ins yet'} description="Sign-ins show up here as people use Ripple Pulse." /></Panel>
      )}

      {rows.length > 0 && (
        <Panel>
          {groups.map((g, gi) => (
            <div key={g.label}>
              <Day label={g.label} first={gi === 0} />
              {g.items.map((l) => {
                const u = byId(l.user_id);
                return (
                  <div key={l.id} className="flex items-center gap-3 border-b border-rp-border px-4 py-3 last:border-0">
                    <Avatar id={u?.id ?? null} name={u?.name ?? l.email} size="sm" />
                    <div className="min-w-0 flex-1 text-[12.5px]">
                      <div className="truncate">
                        {u ? <button className="cursor-pointer font-semibold text-rp-primary hover:underline" onClick={() => actions.openUser(u.id)}>{u.name}</button> : <b>{l.email}</b>}{' '}
                        {l.ok ? 'signed in' : 'could not sign in'} with {l.method === 'google' ? 'Google' : 'a password'}
                        {!l.ok && l.reason && <span className="text-rp-muted"> · {l.reason}</span>}
                      </div>
                      <div className="text-[11px] text-rp-muted">{exact(l.at)}</div>
                    </div>
                    <span className="inline-flex items-center gap-1">{l.ok ? <Check className="size-3 text-rp-success" /> : <X className="size-3 text-rp-danger" />}<UserStatusPill status={l.ok ? 'active' : 'off'} label={l.ok ? 'Success' : 'Failed'} /></span>
                    <span className="hidden w-16 text-right text-[11px] text-rp-muted tabular-nums sm:block">{ago(l.at)}</span>
                  </div>
                );
              })}
            </div>
          ))}
          <CountBar total={rows.length} noun="sign-ins" />
        </Panel>
      )}
      </ScrollBody>
    </PageFrame>
  );
}