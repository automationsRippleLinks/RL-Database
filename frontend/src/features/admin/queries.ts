/**
 * Administration: reads and writes. Every write refreshes everything under
 * ['admin'] — a team change moves counts on the Users, Teams, Invitations and
 * Activity screens at once, so no screen is left showing yesterday's numbers.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './api';
import type { InviteRequest, TeamCreate, TeamPatch, UserPatch } from './types';

const key = {
  users: ['admin', 'users'] as const,
  teams: ['admin', 'teams'] as const,
  invitations: ['admin', 'invitations'] as const,
  history: ['admin', 'history'] as const,
  logins: ['admin', 'logins'] as const,
};

const read = { staleTime: 15_000, retry: false } as const;

export const useAdminUsers = () => useQuery({ queryKey: key.users, queryFn: () => adminApi.users(), ...read });
export const useAdminTeams = () => useQuery({ queryKey: key.teams, queryFn: () => adminApi.teams(), ...read });
export const useInvitations = () => useQuery({ queryKey: key.invitations, queryFn: () => adminApi.invitations(), ...read });
export const useHistory = () => useQuery({ queryKey: key.history, queryFn: () => adminApi.history(), ...read });
export const useLogins = () => useQuery({ queryKey: key.logins, queryFn: () => adminApi.logins(), ...read });

/** One hook for every write, so the refresh rule lives in a single place. */
function useAdminMutation<Vars, Result>(fn: (vars: Vars) => Promise<Result>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useUpdateUser = () => useAdminMutation(({ id, patch }: { id: number; patch: UserPatch }) => adminApi.updateUser(id, patch));
export const useSignOutEverywhere = () => useAdminMutation((id: number) => adminApi.signOutEverywhere(id));
export const useCreateTeam = () => useAdminMutation((body: TeamCreate) => adminApi.createTeam(body));
export const useUpdateTeam = () => useAdminMutation(({ id, patch }: { id: number; patch: TeamPatch }) => adminApi.updateTeam(id, patch));
export const useDeleteTeam = () => useAdminMutation((id: number) => adminApi.deleteTeam(id));
export const useInvite = () => useAdminMutation((body: InviteRequest) => adminApi.invite(body));
export const useResendInvitation = () => useAdminMutation((id: number) => adminApi.resendInvitation(id));
export const useCancelInvitation = () => useAdminMutation((id: number) => adminApi.cancelInvitation(id));
