import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { DataTable, type Column } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/states';
import { SectionTitle } from '@/components/bits';
import { Badge } from '@/components/ui/badge';
import { ingestApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { INGEST_SOURCE_LABELS } from '@/lib/enums';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { IngestJob } from '@/types/api';
import { AppsScriptPanel } from '@/features/ingest/AppsScriptPanel';
import { JsonUploadPanel } from "@/features/ingest/JsonUploadPanel";
import { JobStatusBadge } from "@/features/ingest/JobResult";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export function IngestPage() {
  useDocumentTitle("Ingest");

  const sourcesQuery = useQuery({
    queryKey: queryKeys.ingestSources,
    queryFn: ({ signal }) => ingestApi.sources({ signal }),
  });

  const jobsQuery = useQuery({
    queryKey: queryKeys.ingestJobs,
    queryFn: ({ signal }) => ingestApi.jobs({ signal }),
  });

  if (sourcesQuery.isPending) return <LoadingState label="Loading ingest sources…" />;
  if (sourcesQuery.isError) {
    return <ErrorState error={sourcesQuery.error} onRetry={() => sourcesQuery.refetch()} />;
  }

  const sources = sourcesQuery.data?.sources ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Data ingestion</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pull the master sheets from Google Apps Script, or upload a JSON export directly. Rows whose
          business key already exists are skipped rather than updated.
        </p>
      </div>

      <section>
        <SectionTitle>From Google Apps Script</SectionTitle>
        <AppsScriptPanel sources={sources} />
      </section>

      <section>
        <SectionTitle>From a JSON file</SectionTitle>
        <JsonUploadPanel sources={sources} />
      </section>

      <section>
        <SectionTitle count={jobsQuery.data?.jobs.length}>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <History className="size-4" />
          </span>
          Recent runs
        </SectionTitle>
        <DataTable
          columns={jobColumns}
          rows={jobsQuery.data?.jobs ?? []}
          rowKey={(job) => job.job_id}
          isLoading={jobsQuery.isPending}
          maxHeightClass="max-h-80"
          emptyState={
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              No ingest runs recorded yet.
            </p>
          }
        />
      </section>
    </div>
  );
}

const jobColumns: Column<IngestJob>[] = [
  {
    id: 'job',
    header: 'Job',
    cell: (job) => <span className="font-mono text-xs">{job.job_id}</span>,
  },
  {
    id: 'source',
    header: 'Source',
    cell: (job) => INGEST_SOURCE_LABELS[job.source] ?? job.source,
  },
  {
    id: 'origin',
    header: 'Origin',
    cell: (job) => (
      <Badge variant="outline">{job.origin === 'apps_script' ? 'Apps Script' : 'Upload'}</Badge>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (job) => (
      <span className="flex items-center gap-1.5">
        <JobStatusBadge status={job.status} />
        {job.dry_run && <Badge variant="outline">dry run</Badge>}
      </span>
    ),
  },
  { id: 'received', header: 'Received', numeric: true, cell: (job) => formatNumber(job.counts.received) },
  { id: 'inserted', header: 'Inserted', numeric: true, cell: (job) => formatNumber(job.counts.inserted) },
  { id: 'skipped', header: 'Skipped', numeric: true, cell: (job) => formatNumber(job.counts.skipped) },
  { id: 'failed', header: 'Failed', numeric: true, cell: (job) => formatNumber(job.counts.failed) },
  { id: 'by', header: 'Started by', cell: (job) => job.started_by ?? '—' },
  { id: 'when', header: 'Started', cell: (job) => formatDateTime(job.started_at) },
];
