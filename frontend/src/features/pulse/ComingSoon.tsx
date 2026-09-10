import type { LucideIcon } from 'lucide-react';

/**
 * The placeholder the handoff specifies for the three sections this round did
 * not redesign.
 *
 * It is not wired up by default. Brands, Campaigns and Pitches all have working
 * search in this app today — tables, filters, detail pages — and swapping that
 * for a placeholder would take features away from people who use them. The
 * prototype showed "Coming soon" because those screens had not been designed
 * yet, not because the underlying search should stop existing. See
 * REDESIGNED_SCOPES in router.tsx: flipping one constant there turns this on for
 * any scope, so if the intent really was to hide them until they are redesigned,
 * that is the whole change.
 */
export function ComingSoon({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-[340px] text-center">
        <span className="mb-3.5 inline-flex size-[46px] items-center justify-center rounded-[14px] bg-rp-surface2 text-rp-muted">
          <Icon className="size-[22px]" />
        </span>
        <h1 className="mb-1.5 text-[17px] font-bold">{title}</h1>
        <p className="text-[13px] leading-[1.5] text-rp-muted text-pretty">
          Coming soon — we're finishing Creators first, then this section gets the same treatment.
        </p>
      </div>
    </div>
  );
}
