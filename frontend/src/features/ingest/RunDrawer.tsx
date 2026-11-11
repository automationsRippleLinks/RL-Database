import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { DetailDrawer } from '@/components/DetailDrawer';
import { StatRow, StatTile } from '@/components/StatTile';
import { Badge } from '@/components/ui/badge';
import { useDismissable } from '@/hooks/useDismissable';
import { INGEST_SOURCE_LABELS } from '@/lib/enums';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { IngestJob } from '@/types/api';
import { ErrorList,JobStatusBadge } from '@/features/ingest/JobResult';

/** Same exit time as the creator and brand drawers, so the animation matches. */
const EXIT_MS = 185;

/** The full story of one run: what it was, what happened, and every mistake it found. */
export function RunDrawer({ job, onClose }: { job: IngestJob; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  const requestClose = useCallback(() => {
    if (exitTimer.current) return;
    setClosing(true);
    exitTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Escape and a click outside close it. A click on a row of the runs table
  // (data-rp-pop="results") means "show me that run instead", so it does not.
  useDismissable(['drawer', 'results'], !closing, requestClose);

  const { counts } = job;
  const isCheck = job.dry_run;

  return (
    <DetailDrawer ariaLabel={`Run ${job.job_id.slice(0, 8)}`} closing={closing}>
      <div className="flex shrink-0 items-center gap-2 border-b border-rp-border px-4.5 py-3.75">
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold">
          {INGEST_SOURCE_LABELS[job.source] ?? job.source}
        </h2>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close run details"
          className="rounded-lg p-1 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4.5 py-4 scrollbar-thin">
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusBadge status={job.status} />
          <Badge variant="outline">{isCheck ? 'Check' : 'Save'}</Badge>
        </div>

        {job.message && <p className="text-xs text-rp-muted">{job.message}</p>}

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-rp-muted">Run</dt>
          <dd className="font-mono">{job.job_id.slice(0, 8)}</dd>
          <dt className="text-rp-muted">File</dt>
          <dd className="min-w-0 truncate font-mono">{job.file_name ?? '—'}</dd>
          <dt className="text-rp-muted">Started by</dt>
          <dd>{job.started_by ?? '—'}</dd>
          <dt className="text-rp-muted">Started</dt>
          <dd>{formatDateTime(job.started_at)}</dd>
          {job.finished_at && (
            <>
              <dt className="text-rp-muted">Finished</dt>
              <dd>{formatDateTime(job.finished_at)}</dd>
            </>
          )}
        </dl>

        <StatRow cols={4} className="lg:grid-cols-2">
          <StatTile label="Rows in file" value={formatNumber(counts.received)} />
          {isCheck ? (
            <>
              <StatTile label="Fine" value={formatNumber(Math.max(counts.received - counts.failed, 0))} />
              <StatTile label="Mistakes" value={formatNumber(counts.failed)} />
            </>
          ) : (
            <>
              <StatTile label="Added" value={formatNumber(counts.inserted)} />
              <StatTile label="Updated" value={formatNumber(counts.updated)} />
              {counts.skipped > 0 && <StatTile label="Skipped" value={formatNumber(counts.skipped)} />}
            </>
          )}
        </StatRow>

        {job.errors.length > 0 ? (
          <ErrorList job={job} />
        ) : (
          job.status === 'success' && <p className="text-xs text-rp-muted">Every row was fine.</p>
        )}
      </div>
    </DetailDrawer>
  );
}