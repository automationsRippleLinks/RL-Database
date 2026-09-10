import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * The confirmation for every copy action — copying a profile link, an email or a
 * phone number. Copy is otherwise completely silent: the clipboard changes and
 * nothing on screen does, which reads as a dead button.
 */
interface ToastValue {
  flash: (message: string) => void;
  /** Copies, then flashes. Failure is silent by design — see below. */
  copy: (text: string, message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const VISIBLE_MS = 2600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((next: string) => {
    setMessage(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), VISIBLE_MS);
  }, []);

  const copy = useCallback(
    (text: string, confirmation: string) => {
      // navigator.clipboard is absent on http origins and can reject when the
      // document isn't focused. Neither is worth a modal: the toast is the only
      // feedback either way, so say what happened rather than what was promised.
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) {
        flash('Could not copy — your browser blocked clipboard access');
        return;
      }
      clipboard.writeText(text).then(
        () => flash(confirmation),
        () => flash('Could not copy — your browser blocked clipboard access'),
      );
    },
    [flash],
  );

  const value = useMemo(() => ({ flash, copy }), [flash, copy]);

  return (
    <ToastContext value={value}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-80 flex -translate-x-1/2 items-center gap-2.25 rounded-[11px] border border-rp-border bg-rp-surface px-4 py-2.75 text-[12.5px] font-[550] shadow-rp"
        >
          <CheckCircle2 className="size-4 text-rp-success" />
          {message}
        </div>
      )}
    </ToastContext>
  );
}

export function useToast(): ToastValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
