import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatRow, StatTile } from '@/components/StatTile';
import { formatDateTime, formatNumber, pluralise } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IngestJob, IngestJobStatus } from '@/types/api';

const STATUS_META: Record<
  IngestJobStatus,
  { label: string; variant: 'success' | 'destructive' | 'primary'; icon: typeof CheckCircle2 }
> = {
  queued: { label: 'Queued', variant: 'primary', icon: Loader2 },
  running: { label: 'Running', variant: 'primary', icon: Loader2 },
  success: { label: 'Success', variant: 'success', icon: CheckCircle2 },
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

/** One plain sentence saying what happened, so nobody has to read the numbers to find out. */
function headline(job: IngestJob): string {
  const { received, failed } = job.counts;
  const rows = (n: number) => `${formatNumber(n)} ${pluralise(n, 'row')}`;
  if (job.dry_run) {
    if (job.status === 'success') return `All ${rows(received)} look fine`;
    return `${rows(failed)} ${failed === 1 ? 'has a mistake' : 'have mistakes'}. Nothing was saved.`;
  }
  if (job.status === 'success') return `All ${rows(received)} saved`;
  return 'Saving failed. Nothing was saved.';
}

export function JobResult({ job }: { job: IngestJob }) {
  const { counts } = job;
  const mistakes = job.status === 'failed';

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusBadge status={job.status} />
          {job.dry_run && <Badge variant="outline">Check only</Badge>}
          <span className="text-sm font-semibold">{headline(job)}</span>
        </div>
        {job.message && <p className="text-xs text-muted-foreground">{job.message}</p>}
      </div>

      <StatRow cols={4}>
        <StatTile label="Rows in file" value={formatNumber(counts.received)} />
        {job.dry_run ? (
          <>
            <StatTile label="Fine" value={formatNumber(Math.max(counts.received - counts.failed, 0))} />
            <StatTile label="Mistakes" value={formatNumber(counts.failed)} className={mistakes ? 'border-destructive/50' : undefined} />
          </>
        ) : (
          <>
            <StatTile label="Added" value={formatNumber(counts.inserted)} />
            <StatTile label="Updated" value={formatNumber(counts.updated)} />
            {counts.skipped > 0 && <StatTile label="Skipped" value={formatNumber(counts.skipped)} />}
          </>
        )}
      </StatRow>

      {job.errors.length > 0 && <ErrorList job={job} />}

      <p className="text-[11px] text-muted-foreground">
        {job.file_name ? `${job.file_name} · ` : ''}
        Started {formatDateTime(job.started_at)}
        {job.started_by ? ` by ${job.started_by}` : ''}
        {job.finished_at ? ` · finished ${formatDateTime(job.finished_at)}` : ''}
      </p>
    </div>
  );
}

/** Every row the backend kept, in file order. A row of 0 means the whole file was refused, not one row. */
export function ErrorList({ job }: { job: IngestJob }) {
  const truncated = job.counts.errors_truncated;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-destructive">
        {formatNumber(job.errors.length)} {pluralise(job.errors.length, 'mistake')} to fix
      </p>

      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2 scrollbar-thin">
        {job.errors.map((issue, index) => (
          <li key={index} className="flex gap-2 text-[11px]">
            <span className="shrink-0 font-mono text-muted-foreground">
              {issue.row === 0 ? 'whole file' : `row ${issue.row}`}
              {issue.field ? ` · ${issue.field}` : ''}
            </span>
            <span className="text-destructive">{issue.message}</span>
          </li>
        ))}
      </ul>

      {truncated > 0 && (
        <p className="text-[11px] text-muted-foreground">
          …and {formatNumber(truncated)} more mistakes that are not shown. Fix these, then check again to see the rest.
        </p>
      )}
    </div>
  );
}