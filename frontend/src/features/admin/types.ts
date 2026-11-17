/**
 * Administration: the shapes the screens work with.
 *
 * Field names follow what the backend already sends for users (UserAdminRow in
 * schemas/users.py), plus the few things it has to start sending: `team_id`,
 * teams, invitations, the change history and the sign-in log. Keeping the names
 * identical means switching from the sample data to the API changes no screen.
 */

export type Role = 'member' | 'admin' | 'super';
/** off = switched off by an admin, pending = signed up but email not verified. */
export type UserStatus = 'active' | 'pending' | 'off';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  auth_provider: 'google' | 'password';
  is_verified: boolean;
  /** false = switched off: cannot sign in, and is signed out everywhere. */
  is_currently_employed: boolean;
  is_admin: boolean;
  is_superadmin: boolean;
  can_ingest: boolean;
  can_edit: boolean;
  /** NEW: the one team this person belongs to, if any. */
  team_id: number | null;
  created_at: string;
  last_activity_at: string | null;
  /** Live sign-ins (counted in Redis). */
  active_sessions: number;
}

/** What may be changed on a user. Only the keys sent are changed. */
export interface UserPatch {
  name?: string;
  is_currently_employed?: boolean;
  can_edit?: boolean;
  can_ingest?: boolean;
  is_admin?: boolean;
  is_superadmin?: boolean;
  team_id?: number | null;
}

export interface AdminTeam {
  id: number;
  name: string;
  /** NEW: must be a member of the team, or null. */
  lead_id: number | null;
}

export interface TeamCreate {
  name: string;
  lead_id: number | null;
  member_ids: number[];
}

export interface TeamPatch {
  name?: string;
  lead_id?: number | null;
}

export type InviteStatus = 'pending' | 'accepted' | 'expired';

export interface Invitation {
  id: number;
  email: string;
  status: InviteStatus;
  invited_by_id: number | null;
  invited_by_name: string;
  sent_at: string;
  /** Pending: when the link stops working. */
  expires_at: string | null;
  accepted_at: string | null;
  role: Role;
  team_id: number | null;
  can_edit: boolean;
  can_ingest: boolean;
}

export interface InviteRequest {
  emails: string[];
  role: Role;
  team_id: number | null;
  can_edit: boolean;
  can_ingest: boolean;
}

export type HistoryType = 'access' | 'account' | 'team' | 'invite';

export interface HistoryEntry {
  id: string;
  at: string;
  actor_id: number | null;
  actor_name: string;
  /** "changed Can edit for", "invited", "created the team"... */
  verb: string;
  target: string;
  /** Set when the target is a person, so the name can open their profile. */
  target_id: number | null;
  tail: string;
  type: HistoryType;
  change: { field: string; from: string; to: string } | null;
}

export interface LoginEvent {
  id: string;
  at: string;
  /** null when the email belongs to nobody here (a rejected stranger). */
  user_id: number | null;
  email: string;
  method: 'google' | 'password';
  ok: boolean;
  /** Why it failed; empty on success. */
  reason: string;
}

/** The whole backend surface this module needs. api.ts has the real one, mock.ts the sample one. */
export interface AdminBackend {
  users(): Promise<AdminUser[]>;
  updateUser(id: number, patch: UserPatch): Promise<AdminUser>;
  signOutEverywhere(id: number): Promise<void>;
  teams(): Promise<AdminTeam[]>;
  createTeam(body: TeamCreate): Promise<AdminTeam>;
  updateTeam(id: number, patch: TeamPatch): Promise<AdminTeam>;
  deleteTeam(id: number): Promise<void>;
  invitations(): Promise<Invitation[]>;
  invite(body: InviteRequest): Promise<Invitation[]>;
  resendInvitation(id: number): Promise<Invitation>;
  cancelInvitation(id: number): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  logins(): Promise<LoginEvent[]>;
}