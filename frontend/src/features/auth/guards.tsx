import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { EmptyState, LoadingState } from '@/components/states';
import { useAuth } from './useAuth';

/**
 * Waits for the /auth/me bootstrap before deciding. Rendering the login page while
 * that request is still in flight would flash it on every page load.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingState label="Checking your session…" />;

  if (status === 'unauthenticated') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <Outlet />;
}

/**
 * A permission the user may legitimately not have, so this explains rather than
 * redirects — bouncing someone to a page they can see is more confusing than
 * telling them why they can't see this one. The backend's 403 is still the real
 * gate; this only avoids showing UI that would fail.
 */
export function RequireIngestPermission() {
  console.log("inside guard!!");
  const { canIngest, user ,isAdmin,isSuperAdmin} = useAuth();
  

  if (!canIngest || !isAdmin || !isSuperAdmin) {
    return (
      <EmptyState
        icon={<ShieldOff className="size-7" />}
        title="Data ingestion is restricted"
        description={
          <>
            {user?.email} does not have ingest access. Ask an admin to enable it for your account —
            it is configured in the backend, not here.
          </>
        }
      />
    );
  }

  return <Outlet />;
}
