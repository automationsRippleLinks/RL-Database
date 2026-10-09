import { NavLink } from 'react-router-dom';
import { BarChart3, Database, Search, Tags } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { cn } from '@/lib/utils';

/**
 * The 56px icon rail: the three things this app does, above the data it does
 * them to. Icon-only by design — three destinations is few enough to learn, and
 * every pixel it doesn't take is a column the results table keeps.
 */
export function AppRail() {
  const { canIngest } = useAuth();

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-rp-border py-2.25">
      <RailLink to="/search" label="Search" icon={<Search className="size-[19px]" />} />
      {/* Hidden unless the backend says this account may ingest. The routes are
          guarded too, and the backend's 403 remains the real gate. */}
      {canIngest && (
        <>
          <RailLink to="/ingest" label="Ingest" icon={<Database className="size-4.75" />} />
          <RailLink to="/taxonomy" label="Tags" icon={<Tags className="size-4.75" />} />
          <RailLink to="/analytics" label="Analytics" icon={<BarChart3 className="size-.475" />} />
        </>
      )}
    </aside>
  );
}

function RailLink({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'flex size-10 items-center justify-center rounded-[11px] transition-colors',
          isActive
            ? 'bg-rp-primary-soft text-rp-primary'
            : 'text-rp-muted hover:bg-rp-surface2 hover:text-rp-text',
        )
      }
    >
      {icon}
    </NavLink>
  );
}
