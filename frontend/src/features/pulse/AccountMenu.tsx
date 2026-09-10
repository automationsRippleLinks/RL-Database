import { useCallback, useState } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/features/auth/useAuth';
import { useDismissable } from '@/hooks/useDismissable';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SignOutDialog } from './SignOutDialog';

const THEMES: { key: ThemePreference; label: string; icon: LucideIcon }[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System default', icon: Monitor },
];

/**
 * The avatar menu: who you are, how the app should look, and the way out.
 *
 * Appearance is a segmented control rather than a toggle because it has three
 * states — a toggle cannot express "follow the OS", which is the setting most
 * people actually want.
 */
export function AccountMenu() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  useDismissable('account', open, close);

  const name = user?.name || user?.email || 'Signed in';
  const badge = initials(user?.name || user?.email?.split('@')[0] || '') || '—';

  return (
    <div data-rp-pop="account" className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Your account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex cursor-pointer rounded-full p-0.5"
      >
        <span className="flex size-[30px] items-center justify-center rounded-full bg-rp-primary-soft text-[11.5px] font-bold text-rp-primary">
          {badge}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-rp-menu absolute top-[calc(100%+8px)] right-0 z-[60] w-[250px] rounded-[13px] border border-rp-border bg-rp-surface p-3 shadow-rp"
        >
          <div className="flex items-center gap-2.5 border-b border-rp-border pb-[11px]">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-rp-primary-soft text-[12.5px] font-bold text-rp-primary">
              {badge}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold">{name}</span>
              <span className="block truncate text-[11.5px] text-rp-muted">{user?.email}</span>
            </span>
          </div>

          <span className="mt-3 mb-[7px] block text-[10.5px] font-bold tracking-[0.06em] text-rp-muted uppercase">
            Appearance
          </span>
          <div
            role="radiogroup"
            aria-label="Appearance"
            className="flex gap-1 rounded-[10px] border border-rp-border p-[3px]"
          >
            {THEMES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={theme === key}
                title={label}
                aria-label={label}
                onClick={() => setTheme(key)}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center rounded-[7px] px-[11px] py-1.5 transition-colors',
                  theme === key
                    ? 'bg-rp-primary text-rp-primary-fg'
                    : 'text-rp-muted hover:bg-rp-surface2',
                )}
              >
                <Icon className="size-[15px]" />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setSignOutOpen(true);
            }}
            className="mt-[11px] flex w-full cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-[9px] text-left text-[13px] font-semibold text-rp-danger hover:bg-rp-surface2"
          >
            <LogOut className="size-[15px]" />
            Sign out
          </button>
        </div>
      )}

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </div>
  );
}
