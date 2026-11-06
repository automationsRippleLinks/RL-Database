import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface ConfirmSpec {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
}

/** One confirm dialog for every "are you sure": shows the backend's refusal in place if the action fails. */
export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  return (
    <Dialog open={!!spec} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-105 rounded-2xl border-rp-border bg-rp-surface p-5 shadow-rp">
        {spec && (
          <>
            <DialogTitle className="text-[16px] font-bold">{spec.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-2 text-[13px] leading-relaxed text-rp-muted">{spec.body}</div>
            </DialogDescription>
            {error && <p role="alert" className="mt-3 text-[12.5px] text-rp-danger">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={close} className="cursor-pointer rounded-lg border border-rp-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await spec.onConfirm();
                    setBusy(false);
                    onClose();
                  } catch (e) {
                    setBusy(false);
                    setError(e instanceof ApiError ? e.detail : 'That did not work. Please try again.');
                  }
                }}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-60',
                  spec.danger ? 'bg-rp-danger text-rp-primary-fg' : 'bg-rp-primary text-rp-primary-fg',
                )}
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                {spec.confirmLabel}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
