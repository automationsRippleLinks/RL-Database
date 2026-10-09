import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/useAuth';

/**
 * Signing out clears every cached result, so it is worth one confirmation —
 * especially from a menu whose other rows are harmless.
 */
export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-91 rounded-2xl border-rp-border bg-rp-surface p-5.25 shadow-rp">
        <DialogTitle className="mb-1.5 text-[15.5px] font-bold">
          Sign out of Ripple Pulse?
        </DialogTitle>
        <DialogDescription className="mb-4.25 text-[12.5px] leading-normal text-rp-muted">
          You'll need your work email to sign back in.
        </DialogDescription>
        <div className="flex justify-end gap-2.25">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-[10px] border border-rp-border px-3.25 py-2.25 text-[12.5px] font-semibold hover:bg-rp-surface2"
          >
            Stay signed in
          </button>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              // The provider navigates to /login and clears the query cache in
              // onSettled, so this component is unmounted before the promise
              // resolves — no success state to render, and nothing to reset.
              setSigningOut(true);
              void logout();
            }}
            className="cursor-pointer rounded-[10px] bg-rp-danger px-3.5 py-2.25 text-[12.5px] font-bold text-white disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
