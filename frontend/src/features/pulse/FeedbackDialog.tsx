import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-client';
import { feedbackApi } from '@/lib/endpoints';
import { cn } from '@/lib/utils';

const KINDS = ['Something looks wrong', 'Data is missing', 'An idea'];

/** Where a report goes when the backend has nowhere to put it yet. */
const FALLBACK_ADDRESS = 'automations@ripplelinks.com';

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const location = useLocation();
  const { flash } = useToast();
  const [kind, setKind] = useState(KINDS[0]);
  const [message, setMessage] = useState('');

  const page = `${location.pathname}${location.search}`;

  const send = useMutation({
    mutationFn: () => feedbackApi.send({ kind, message: message.trim(), page }),
    onSuccess: () => {
      close();
      flash('Thanks — sent to the team');
    },
    onError: (error) => {
      // /feedback isn't built yet. Rather than telling someone their report went
      // to the team when it went nowhere, hand it to their mail client with
      // everything already filled in and say plainly that that is what happened.
      if (error instanceof ApiError && error.isMissingEndpoint) {
        const subject = encodeURIComponent(`Ripple Pulse — ${kind}`);
        const body = encodeURIComponent(`${message.trim()}\n\n—\nReported from: ${page}`);
        window.location.href = `mailto:${FALLBACK_ADDRESS}?subject=${subject}&body=${body}`;
        close();
        flash('Opened your mail app — send it from there');
        return;
      }
      flash("Couldn't send that — try again in a moment");
    },
  });

  const close = () => {
    onOpenChange(false);
    setMessage('');
    setKind(KINDS[0]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-[426px] rounded-2xl border-rp-border bg-rp-surface p-[21px] shadow-rp">
        <DialogTitle className="mb-[5px] text-[15.5px] font-bold">
          Tell us what's not working
        </DialogTitle>
        <DialogDescription className="mb-[13px] text-[12.5px] text-rp-muted">
          Goes straight to the team that builds this. Wrong data counts too.
        </DialogDescription>

        <div className="mb-[11px] flex gap-1.5">
          {KINDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              aria-pressed={kind === option}
              className={cn(
                'cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                kind === option
                  ? 'border-rp-primary bg-rp-primary-soft font-semibold text-rp-primary'
                  : 'border-rp-border font-medium text-rp-muted hover:bg-rp-surface2',
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What happened, and what did you expect?"
          aria-label="What happened, and what did you expect?"
          className="min-h-[94px] w-full resize-y rounded-[11px] border border-rp-border bg-rp-surface2 px-3 py-[11px] text-[13px] outline-none focus-visible:border-rp-primary"
        />

        <div className="mt-[13px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={close}
            className="cursor-pointer rounded-[10px] border border-rp-border px-[13px] py-[9px] text-[12.5px] font-semibold hover:bg-rp-surface2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => send.mutate()}
            disabled={!message.trim() || send.isPending}
            className="cursor-pointer rounded-[10px] bg-rp-primary px-[15px] py-[9px] text-[12.5px] font-bold text-rp-primary-fg disabled:opacity-50"
          >
            {send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
