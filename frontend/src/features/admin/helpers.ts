/** Rules and wording shared by every Administration screen. */
import type { AdminUser, Role, UserStatus } from './types';

export const APPROVED_DOMAIN = 'ripplelinks.com';

export const ROLE_LABEL: Record<Role, string> = { super: 'Super admin', admin: 'Admin', member: 'Member' };
export const STATUS_LABEL: Record<UserStatus, string> = { active: 'Active', pending: 'Pending', off: 'Inactive' };

export const statusOf = (u: AdminUser): UserStatus =>
  !u.is_currently_employed ? 'off' : !u.is_verified ? 'pending' : 'active';

export const roleOf = (u: AdminUser): Role => (u.is_superadmin ? 'super' : u.is_admin ? 'admin' : 'member');

export type LockedField = 'role' | 'status';

/**
 * Why a control is locked for this person, or '' when it is allowed. These are
 * the rules the backend enforces (services/users.py); the screen only mirrors
 * them so nobody clicks something that is going to be refused.
 */
export function lockReason(me: AdminUser | null, target: AdminUser, field: LockedField): string {
  if (!me) return '';
  if (!me.is_superadmin && field === 'role') return 'Only a super admin can change roles.';
  if (!me.is_superadmin && (target.is_admin || target.is_superadmin) && target.id !== me.id)
    return 'Only a super admin can change another admin.';
  if (target.id === me.id) return 'You cannot change your own role or deactivate yourself.';
  return '';
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── time ────────────────────────────────────────────────────────────────────

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Never';
  const h = (now - new Date(iso).getTime()) / 36e5;
  if (h < 1) return 'Just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 48) return 'Yesterday';
  if (h < 720) return `${Math.floor(h / 24)}d ago`;
  return `${Math.floor(h / 720)}mo ago`;
}

export const exact = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const start = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diff = Math.round((start(new Date(now)) - start(d)) / 864e5);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Groups already-sorted (newest first) items under Today / Yesterday / date headings. */
export function groupByDay<T extends { at: string }>(items: T[]): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const inDomain = (v: string) => v.toLowerCase().endsWith(`@${APPROVED_DOMAIN}`);