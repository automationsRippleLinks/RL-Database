import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/UI/dialog';
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
      <DialogContent className="max-w-[364px] rounded-2xl border-rp-border bg-rp-surface p-[21px] shadow-rp">
        <DialogTitle className="mb-1.5 text-[15.5px] font-bold">
          Sign out of Ripple Pulse?
        </DialogTitle>
        <DialogDescription className="mb-[17px] text-[12.5px] leading-[1.5] text-rp-muted">
          You'll need your work email to sign back in.
        </DialogDescription>
        <div className="flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-[10px] border border-rp-border px-[13px] py-[9px] text-[12.5px] font-semibold hover:bg-rp-surface2"
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
            className="cursor-pointer rounded-[10px] bg-rp-danger px-[14px] py-[9px] text-[12.5px] font-bold text-white disabled:opacity-60"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
