import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { FeedbackDialog } from './FeedbackDialog';
import { PulseSearch } from './PulseSearch';

export function PulseHeader() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-rp-border px-[18px] py-[9px]">
      <Link to="/search" className="flex shrink-0 items-center gap-2.5">
        {/* White plate under the mark, and the logo scaled slightly past its box
            so it bleeds to the rounded edge instead of floating in padding. */}
        <span className="block size-8 overflow-hidden rounded-[9px] bg-white">
          <img
            src="/ripple-links-logo.png"
            alt="Ripple Links"
            className="size-full scale-[1.18] object-cover"
          />
        </span>
        <span className="text-[14.5px] font-bold tracking-[-0.01em]">Ripple Pulse</span>
      </Link>

      <PulseSearch />

      <div className="ml-auto flex shrink-0 items-center gap-[7px]">
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          title="Send feedback or report a problem"
          aria-label="Send feedback or report a problem"
          className="flex cursor-pointer rounded-full p-2 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
        >
          <AlertCircle className="size-[18px]" />
        </button>
        <AccountMenu />
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </header>
  );
}
