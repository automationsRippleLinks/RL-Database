import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/states';
import { SectionTitle } from '@/components/bits';
import { Badge } from '@/components/ui/badge';
import { ingestApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { INGEST_SOURCE_LABELS } from '@/lib/enums';
import { formatDateTime, formatNumber, pluralise } from '@/lib/format';
import type { IngestJob } from '@/types/api';
import { JsonUploadPanel } from '@/features/ingest/JsonUploadPanel';
import { JobStatusBadge } from '@/features/ingest/JobResult';
import { RunDrawer } from './RunDrawer';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function IngestPage() {
  useDocumentTitle('Ingest');

  const sourcesQuery = useQuery({
    queryKey: queryKeys.ingestSources,
    queryFn: ({ signal }) => ingestApi.sources({ signal }),
  });

  const jobsQuery = useQuery({
    queryKey: queryKeys.ingestJobs,
    queryFn: ({ signal }) => ingestApi.jobs({ signal }),
  });

  // The run whose details are open. Looked up in the list each time, so it stays current.
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const openJob = jobsQuery.data?.jobs.find((job) => job.job_id === openJobId) ?? null;

  if (sourcesQuery.isPending) return <LoadingState label="Loading ingest sources…" />;
  if (sourcesQuery.isError) {
    return <ErrorState error={sourcesQuery.error} onRetry={() => sourcesQuery.refetch()} />;
  }

  const sources = sourcesQuery.data?.sources ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Ingest</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Upload a JSON file. Check it first, then save it. A file is saved only when every row is fine.
        </p>
      </div>

      <section>
        <JsonUploadPanel sources={sources} />
      </section>

      <section>
        <SectionTitle count={jobsQuery.data?.jobs.length}>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <History className="size-4" />
          </span>
          Recent runs
        </SectionTitle>
        {jobsQuery.isError ? (
          <ErrorState error={jobsQuery.error} onRetry={() => jobsQuery.refetch()} />
        ) : (
          <div data-rp-pop="results">
            <DataTable
              columns={jobColumns}
              rows={jobsQuery.data?.jobs ?? []}
              rowKey={(job) => job.job_id}
              onRowClick={(job) => setOpenJobId(job.job_id)}
              activeRowKey={openJobId}
              isLoading={jobsQuery.isPending}
              maxHeightClass="max-h-80"
              emptyState={
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No ingest runs recorded yet.
                </p>
              }
            />
          </div>
        )}
      </section>

      {openJob && <RunDrawer key={openJob.job_id} job={openJob} onClose={() => setOpenJobId(null)} />}
    </div>
  );
}

/** One short line per run, so the table can be read without opening anything. */
function resultText(job: IngestJob): string {
  const { received, inserted, updated, failed } = job.counts;
  const rows = (n: number) => `${formatNumber(n)} ${pluralise(n, 'row')}`;
  if (job.status === 'queued' || job.status === 'running') return 'Working…';
  if (job.dry_run) return job.status === 'success' ? `All ${rows(received)} fine` : `${rows(failed)} with mistakes`;
  if (job.status === 'success') return `${formatNumber(inserted)} added, ${formatNumber(updated)} updated`;
  return 'Nothing saved';
}

const jobColumns: Column<IngestJob>[] = [
  {
    id: 'job',
    header: 'Job',
    cell: (job) => <span className="font-mono text-xs">{job.job_id.slice(0, 8)}</span>,
  },
  {
    id: 'source',
    header: 'Source',
    cell: (job) => INGEST_SOURCE_LABELS[job.source] ?? job.source,
  },
  {
    id: 'type',
    header: 'Type',
    cell: (job) => <Badge variant="outline">{job.dry_run ? 'Check' : 'Save'}</Badge>,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (job) => <JobStatusBadge status={job.status} />,
  },
  { id: 'result', header: 'Result', cell: (job) => resultText(job) },
  { id: 'file', header: 'File', cell: (job) => <span className="font-mono text-xs">{job.file_name ?? '—'}</span> },
  { id: 'by', header: 'Started by', cell: (job) => job.started_by ?? '—' },
  { id: 'when', header: 'Started', cell: (job) => formatDateTime(job.started_at) },
];