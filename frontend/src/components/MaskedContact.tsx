import { useState } from 'react';
import { Check, Copy, Eye } from 'lucide-react';
import { maskEmail, maskPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';

/**
 * Creator emails and phone numbers are personal data. The Streamlit app rendered
 * them in plain text for anyone who opened the page; here they stay masked until
 * someone deliberately reveals one, which keeps casual screen-sharing safe and
 * gives the backend a natural place to log access (see PROPOSED_BACKEND_CHANGES.md).
 */
export function MaskedContact({
  value,
  kind,
  className,
}: {
  value: string | null | undefined;
  kind: 'email' | 'phone';
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return <span className="text-muted-foreground">—</span>;

  const masked = kind === 'email' ? maskEmail(value) : maskPhone(value);

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } else {
      // Genuinely couldn't copy — reveal so they can select it manually,
      // but don't pretend it succeeded.
      setRevealed(true);
    }
  };
  return (
    <span className={cn('group/contact inline-flex items-center gap-1.5', className)}>
      <span className={cn('truncate', !revealed && 'text-muted-foreground')}>
        {revealed ? value : masked}
      </span>
      {!revealed && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setRevealed(true);
          }}
          className="opacity-0 transition-opacity group-hover/contact:opacity-100 focus:opacity-100"
          aria-label={`Reveal ${kind}`}
          title={`Reveal ${kind}`}
        >
          <Eye className="size-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        className="opacity-0 transition-opacity group-hover/contact:opacity-100 focus:opacity-100"
        aria-label={`Copy ${kind}`}
        title={`Copy ${kind}`}
      >
        {copied ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Copy className="size-3.5 text-muted-foreground hover:text-foreground" />
        )}
      </button>
    </span>
  );
}
