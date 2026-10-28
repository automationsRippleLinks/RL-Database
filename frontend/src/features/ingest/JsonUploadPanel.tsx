import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileJson, Loader2, Upload, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/states';
import { ingestApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { formatNumber, pluralise } from '@/lib/format';
import type { IngestJob, IngestSource, IngestSourceInfo } from '@/types/api';
import { FileFormat } from '@/pages/ingest/FileFormat';
import { JobResult } from './JobResult';
import { cn } from '@/lib/utils';

/** The backend refuses anything larger, so say so before the upload starts. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** A job still working. The backend runs jobs in the background, so the page asks again until it is done. */
const isWorking = (job: IngestJob | undefined) => job?.status === 'queued' || job?.status === 'running';

/**
 * The rows in a file, by the backend's own rule: a list of objects, or { "data": [...] }.
 * Anything else is left for the backend to explain, so this never blocks a file it would accept.
 */
function readRows(text: string): { rows: unknown[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: `This is not valid JSON: ${(e as Error).message}` };
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    return { error: 'This is not a list of rows. Choose a JSON file that holds a list of objects, or { "data": [...] }.' };
  }
  return { rows };
}

export function JsonUploadPanel({ sources }: { sources: IngestSourceInfo[] }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<IngestSource>(sources[0]?.source ?? 'creator');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  /** A short line explaining why a finished check disappeared. */
  const [note, setNote] = useState<string | null>(null);
  /** The job being watched: first the check, then the save that follows it. */
  const [jobId, setJobId] = useState<string | null>(null);
  /** True while a file is being dragged over the box. */
  const [dragging, setDragging] = useState(false);

  const jobQuery = useQuery({
    queryKey: queryKeys.ingestJob(jobId ?? ''),
    queryFn: ({ signal }) => ingestApi.job(jobId as string, { signal }),
    enabled: jobId !== null,
    refetchInterval: (query) => (isWorking(query.state.data) ? 1500 : false),
  });
  const job = jobQuery.data;

  const refreshAfterWrite = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.ingestSources });
    void queryClient.invalidateQueries({ queryKey: ['facets'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };

  // When a job finishes, refresh the runs list; if it saved data, refresh the rest of the app too.
  const finishedId = job && !isWorking(job) ? job.job_id : null;
  const savedData = !!job && !job.dry_run && job.status === 'success';
  useEffect(() => {
    if (!finishedId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.ingestJobs });
    if (savedData) refreshAfterWrite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedId]);

  const check = useMutation({
    mutationFn: () => ingestApi.upload(source, rows as unknown[], true, fileName ?? 'upload.json'),
    onSuccess: (created) => {
      setNote(null);
      setJobId(created.job_id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ingestJobs });
    },
  });

  const save = useMutation({
    mutationFn: (checkedJobId: string) => ingestApi.commit(checkedJobId),
    onSuccess: (created) => {
      setJobId(created.job_id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ingestJobs });
    },
  });

  /** Back to an empty page: no file, no check. Nothing is ever saved by this. */
  const reset = (message: string | null = null) => {
    setFileName(null);
    setRows(null);
    setFileError(null);
    setJobId(null);
    setNote(message);
    check.reset();
    save.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const hadCheck = jobId !== null;
    reset(hadCheck ? 'You chose a different file, so the earlier check no longer counts. Check this one before saving.' : null);
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Split it into files under 25 MB.`);
      return;
    }
    const result = readRows(await file.text());
    if ('error' in result) setFileError(result.error);
    else setRows(result.rows);
  };

  const onSourceChange = (next: IngestSource) => {
    setSource(next);
    // A check belongs to the source it was made for, so a new source throws it away.
    if (jobId) {
      setJobId(null);
      check.reset();
      save.reset();
      setNote('You changed what you are uploading, so the earlier check no longer counts. Check the file again.');
    }
  };

  const busy = check.isPending || save.isPending || isWorking(job);
  const checkFinished = !!job && !isWorking(job) && job.dry_run;
  const canSave = checkFinished && job.status === 'success' && !save.isPending;
  const checkFailed = checkFinished && job.status === 'failed';
  const saveFinished = !!job && !isWorking(job) && !job.dry_run;

  const onDrop = (event: import('react').DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    if (files.length > 1) {
      setFileError('Drop one file at a time.');
      return;
    }
    if (!/\.json$/i.test(files[0].name)) {
      setFileError('Only .json files can be uploaded.');
      return;
    }
    void handleFile(files[0]);
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Upload a JSON file</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3.5">
        <div className="space-y-1.5 sm:max-w-56">
          <span className="text-xs font-medium text-muted-foreground">What are you uploading?</span>
          <Select value={source} onChange={(event) => onSourceChange(event.target.value as IngestSource)} aria-label="Ingest source">
            {sources.map((info) => (
              <option key={info.source} value={info.source}>
                {info.label}
              </option>
            ))}
          </Select>
        </div>

        <FileFormat source={source} />

        {/* Drop a file here, or use the button. Clicking the box itself does nothing. */}
        {!fileName && (
          <div
            onDragEnter={(event) => event.preventDefault()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <FileJson className="size-7 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {dragging ? 'Drop the file to load it' : 'Drag a JSON file here, or choose one. Up to 25 MB.'}
            </p>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload />
              Upload JSON file
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {fileName && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <FileJson className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{fileName}</span>
              {rows && (
                <Badge variant="outline">
                  {formatNumber(rows.length)} {pluralise(rows.length, 'row')}
                </Badge>
              )}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={() => reset()} disabled={busy} aria-label="Remove file">
              <X />
            </Button>
          </div>
        )}

        {fileError && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <XCircle className="size-3.5" />
            {fileError}
          </p>
        )}

        {note && !jobId && <p className="text-xs text-var(--warning)">{note}</p>}

        {rows && !jobId && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => check.mutate()} data-testid="ingest-check">
              {check.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Check file
            </Button>
            <span className="text-[11px] text-muted-foreground">Checking saves nothing.</span>
          </div>
        )}

        {check.isError && <ErrorState error={check.error} onRetry={() => check.reset()} />}

        {jobQuery.isError && <ErrorState error={jobQuery.error} onRetry={() => void jobQuery.refetch()} />}

        {job && (
          <div className="space-y-2" data-testid="ingest-result">
            {isWorking(job) && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {job.dry_run ? 'Checking your file…' : 'Saving…'}
              </p>
            )}
            {!isWorking(job) && <JobResult job={job} />}
          </div>
        )}

        {canSave && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={busy} onClick={() => save.mutate(job.job_id)} data-testid="ingest-commit">
                {save.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                Save {formatNumber(job.counts.received)} {pluralise(job.counts.received, 'row')}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => reset('Cancelled. Nothing was saved.')}>
                Cancel
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Save puts all the rows in. Cancel throws this away and nothing is saved.
            </p>
          </div>
        )}

        {checkFailed && (
          <div className="space-y-1.5">
            <Button size="sm" onClick={() => reset('Nothing was saved. Fix the rows in your file, then upload it again.')}>
              Cancel and upload again
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Nothing is saved. Fix these rows in your file, then upload it again.
            </p>
          </div>
        )}

        {saveFinished && (
          <Button size="sm" variant="outline" onClick={() => reset()}>
            Upload another file
          </Button>
        )}

        {save.isError && <ErrorState error={save.error} onRetry={() => save.reset()} />}
      </CardContent>
    </Card>
  );
}