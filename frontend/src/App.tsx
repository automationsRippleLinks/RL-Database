import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Database, Download, LogOut, Moon, Search, Sun, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/states';
import { USE_MOCKS } from '@/lib/api-client';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/useAuth';

export function App() {
  const { user, canIngest, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
          <Link to="/search" className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Database className="size-4" />
            </span>
            <span className="hidden text-sm font-semibold sm:inline">Ripple Pulse</span>
          </Link>

          <nav className="flex items-center gap-1">
            <TopNavLink to="/search">
              <Search className="size-3.5" />
              Search
            </TopNavLink>
            {/* Hidden unless the backend says this account may ingest. The route is
                guarded too, and the backend's 403 remains the real gate. */}
            {canIngest && (
              <>
                <TopNavLink to="/ingest">
                  <Download className="size-3.5" />
                  Ingest
                </TopNavLink>
                <TopNavLink to="/taxonomy">
                  <Tags className="size-3.5" />
                  Taxonomy
                </TopNavLink>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {USE_MOCKS && (
              <Badge variant="warning" title="VITE_USE_MOCKS=true — serving fixture data">
                Fixture data
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            {user && (
              <>
                <span className="hidden max-w-48 truncate text-xs text-muted-foreground md:inline">
                  {user.email}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => void logout()} aria-label="Sign out">
                  <LogOut />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5">
        {/* Detail pages and the ingest screen are lazy-loaded (see router.tsx). */}
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

function TopNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-secondary text-foreground'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
