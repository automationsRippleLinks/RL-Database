import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/UI/badge';
import { formatDateTime, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IngestJob, IngestJobStatus, IngestRowError } from '@/types/api';

const STATUS_META: Record<
  IngestJobStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'primary'; icon: typeof CheckCircle2 }
> = {
  queued: { label: 'Queued', variant: 'primary', icon: Loader2 },
  running: { label: 'Running', variant: 'primary', icon: Loader2 },
  success: { label: 'Success', variant: 'success', icon: CheckCircle2 },
  partial_success: { label: 'Partial', variant: 'warning', icon: AlertTriangle },
  failed: { label: 'Failed', variant: 'destructive', icon: XCircle },
};

export function JobStatusBadge({ status }: { status: IngestJobStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const spinning = status === 'queued' || status === 'running';
  return (
    <Badge variant={meta.variant}>
      <Icon className={cn('size-3', spinning && 'animate-spin')} />
      {meta.label}
    </Badge>
  );
}

export function JobResult({ job, title }: { job: IngestJob; title?: string }) {
  const { counts } = job;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusBadge status={job.status} />
          {job.dry_run && <Badge variant="outline">Dry run — nothing written</Badge>}
          <span className="text-xs text-muted-foreground">{title ?? job.message}</span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{job.job_id}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <CountTile label="Received" value={counts.received} />
        <CountTile label={job.dry_run ? 'Would insert' : 'Inserted'} value={counts.inserted} tone="success" />
        <CountTile label="Updated" value={counts.updated} />
        <CountTile label="Skipped" value={counts.skipped} tone={counts.skipped ? 'warning' : undefined} />
        <CountTile label="Failed" value={counts.failed} tone={counts.failed ? 'destructive' : undefined} />
      </div>

      {job.errors.length > 0 && <IssueList job={job} />}

      <p className="text-[11px] text-muted-foreground">
        Started {formatDateTime(job.started_at)}
        {job.started_by ? ` by ${job.started_by}` : ''}
        {job.finished_at ? ` · finished ${formatDateTime(job.finished_at)}` : ''}
      </p>
    </div>
  );
}

/**
 * Errors and warnings are not the same thing and must not look the same.
 * Warnings mean the row went in with something coerced; they outnumber real
 * errors on a typical export, and painting them all destructive-red made every
 * successful ingest look like a disaster.
 */
function IssueList({ job }: { job: IngestJob }) {
  const isError = (issue: IngestRowError) => (issue.severity ?? 'error') === 'error';
  const errors = job.errors.filter(isError);
  const warnings = job.errors.filter((issue) => !isError(issue));
  const truncated = job.counts.errors_truncated ?? 0;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">
        {errors.length > 0 && (
          <span className="text-destructive">
            {formatNumber(errors.length)} {errors.length === 1 ? 'error' : 'errors'}
          </span>
        )}
        {errors.length > 0 && warnings.length > 0 && <span className="text-muted-foreground"> · </span>}
        {warnings.length > 0 && (
          <span className="text-[var(--warning)]">
            {formatNumber(warnings.length)} {warnings.length === 1 ? 'warning' : 'warnings'}
          </span>
        )}
      </p>

      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 scrollbar-thin">
        {[...errors, ...warnings].map((issue, index) => (
          <li key={index} className="flex gap-2 text-[11px]">
            <span className="shrink-0 font-mono text-muted-foreground">
              row {issue.row}
              {issue.field ? `·${issue.field}` : ''}
            </span>
            <span className={isError(issue) ? 'text-destructive' : 'text-[var(--warning)]'}>
              {issue.message}
            </span>
          </li>
        ))}
      </ul>

      {truncated > 0 && (
        <p className="text-[11px] text-muted-foreground">
          …and {formatNumber(truncated)} more not stored with this job.
        </p>
      )}
    </div>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'destructive';
}) {
  return (
    <div className="rounded-md border border-border px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-sm font-semibold tnum',
          tone === 'success' && 'text-[var(--success)]',
          tone === 'warning' && 'text-[var(--warning)]',
          tone === 'destructive' && 'text-destructive',
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
