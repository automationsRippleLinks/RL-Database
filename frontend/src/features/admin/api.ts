/**
 * The Administration backend: every screen in this module calls the API through here.
 */
import { api } from '@/lib/api-client';
import type { AdminBackend, AdminTeam, AdminUser, HistoryEntry, Invitation, LoginEvent } from './types';

const realBackend: AdminBackend = {
  // ── users ──
  users: () => api.get<AdminUser[]>('/admin/users'),
  updateUser: (id, patch) => api.patch<AdminUser>(`/admin/users/${id}`, patch),
  signOutEverywhere: (id) => api.post<void>(`/admin/users/${id}/sign-out`),

  // ── teams ──
  teams: () => api.get<AdminTeam[]>('/admin/teams'),
  createTeam: (body) => api.post<AdminTeam>('/admin/teams', body),
  updateTeam: (id, patch) => api.patch<AdminTeam>(`/admin/teams/${id}`, patch),
  deleteTeam: (id) => api.del(`/admin/teams/${id}`),

  // ── invitations ──
  invitations: () => api.get<Invitation[]>('/admin/invitations'),
  invite: (body) => api.post<Invitation[]>('/admin/invitations', body),
  resendInvitation: (id) => api.post<Invitation>(`/admin/invitations/${id}/resend`),
  cancelInvitation: (id) => api.del(`/admin/invitations/${id}`),

  // ── activity ──
  history: () => api.get<HistoryEntry[]>('/admin/history'),
  logins: () => api.get<LoginEvent[]>('/admin/logins'),
};

export const adminApi: AdminBackend = realBackend;