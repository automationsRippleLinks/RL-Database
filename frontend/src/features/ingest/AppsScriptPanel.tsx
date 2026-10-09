import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/states';
import { ingestApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { IngestJob, IngestSource, IngestSourceInfo } from '@/types/api';
import { JobResult } from './JobResult';

/**
 * Pull data from the Google Apps Script web app, one card per source.
 *
 * The backend fetches these itself over a shared secret — the browser never talks
 * to Apps Script — so this is only a trigger plus a place to see the outcome.
 */
export function AppsScriptPanel({ sources }: { sources: IngestSourceInfo[] }) {
  const queryClient = useQueryClient();

  const run = useMutation({
    mutationFn: (source: IngestSource) => ingestApi.runAppsScript(source),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ingestJobs });
      if (!job.dry_run){
        // A successful ingest changes row counts, facet vocabularies and results.
        void queryClient.invalidateQueries({ queryKey: queryKeys.ingestSources });
        void queryClient.invalidateQueries({ queryKey: ['facets'] });
        void queryClient.invalidateQueries({ queryKey: ['search'] });
      }
      
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((info) => (
          <Card key={info.source}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle>{info.label}</CardTitle>
                  <CardDescription className="font-mono">{info.source}</CardDescription>
                </div>
                {!info.apps_script_supported && <Badge variant="outline">Not implemented</Badge>}
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5">
              <dl className="space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Rows in database</dt>
                  <dd className="tnum">{info.row_count === null ? '—' : formatNumber(info.row_count)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Last run</dt>
                  <dd>{info.last_job ? formatDateTime(info.last_job.finished_at ?? info.last_job.started_at) : 'never'}</dd>
                </div>
                {info.last_job && (
                  <div className="flex justify-between gap-2">
                    <dt>Last result</dt>
                    <dd className="tnum">
                      {formatNumber(info.last_job.counts.inserted)} inserted,{' '}
                      {formatNumber(info.last_job.counts.skipped)} skipped
                    </dd>
                  </div>
                )}
              </dl>

              <Button
                size="sm"
                variant={info.apps_script_supported ? 'default' : 'outline'}
                className="w-full"
                disabled={!info.apps_script_supported || run.isPending}
                onClick={() => run.mutate(info.source)}
              >
                {run.isPending && run.variables === info.source ? (
                  <Loader2 className="animate-spin" />
                ) : info.last_job ? (
                  <RefreshCw />
                ) : (
                  <Play />
                )}
                {info.apps_script_supported ? 'Run ingest' : 'No backend parser yet'}
              </Button>

              {!info.apps_script_supported && (
                <p className="text-[11px] text-muted-foreground">
                  Declared in the backend's <code className="font-mono">IngestType</code> enum but has no
                  Apps Script action, parser or ingest method. Creator-level data cannot arrive until this
                  exists.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {run.isError && <ErrorState error={run.error} onRetry={() => run.reset()} />}
      {run.isSuccess && run.data && (
        <JobResult job={run.data as IngestJob} title="Apps Script pull complete" />
      )}
    </div>
  );
}
