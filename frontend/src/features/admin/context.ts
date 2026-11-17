import { createContext, useContext } from 'react';
import type { AdminUser } from './types';

/** What every Administration screen can ask the layout to do — the dialogs live there, once. */
export interface AdminActions {
  /** The admin using the page (their own row), or null while users load. */
  me: AdminUser | null;
  openUser: (id: number) => void;
  editUser: (user: AdminUser) => void;
  openInvite: (teamId?: number | null) => void;
  /** Asks first, then switches the account off and signs the person out everywhere. */
  deactivate: (user: AdminUser) => void;
  reactivate: (user: AdminUser) => void;
  signOutEverywhere: (user: AdminUser) => void;
  assignTeam: (user: AdminUser, teamId: number | null) => void;
}

export const AdminActionsContext = createContext<AdminActions | null>(null);

export function useAdminActions(): AdminActions {
  const ctx = useContext(AdminActionsContext);
  if (!ctx) throw new Error('useAdminActions must be used inside <AdminLayout>');
  return ctx;
}