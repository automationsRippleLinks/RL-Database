import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Loader2,
  Upload,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/states';
import { ingestApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { formatNumber, pluralise } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IngestJob, IngestSource, IngestSourceInfo } from '@/types/api';
import { SOURCE_FIELDS, parseAndValidate, type ValidationReport } from './validate';
import { JobResult } from './JobResult';

/** Guard against someone dropping a 400MB export and freezing the tab. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function JsonUploadPanel({ sources }: { sources: IngestSourceInfo[] }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadable = sources.filter((source) => source.upload_supported);
  const [source, setSource] = useState<IngestSource>(uploadable[0]?.source ?? 'pitch_master');
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = useMutation({
    mutationFn: ({ rows, dryRun }: { rows: unknown[]; dryRun: boolean }) =>
      ingestApi.upload(source, rows, dryRun, fileName ?? 'upload.json'),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ingestJobs });
      if (!job.dry_run) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ingestSources, });
        void queryClient.invalidateQueries({ queryKey: ['facets'] });
        void queryClient.invalidateQueries({ queryKey: ['search'] });
      }
    },
  });

  const reset = () => {
    setFileName(null);
    setReport(null);
    setFileError(null);
    upload.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    setReport(null);
    upload.reset();

    if (file.size > MAX_FILE_BYTES) {
      setFileName(file.name);
      setFileError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Split it into chunks under 25 MB.`,
      );
      return;
    }

    setFileName(file.name);
    // Parse and validate in the browser first: a malformed export is caught here
    // rather than after a round-trip, and the warnings about values the backend
    // parser would flatten to NA are only visible before it runs.
    const text = await file.text();
    setReport(parseAndValidate(source, text));
  };

  const onSourceChange = (next: IngestSource) => {
    setSource(next);
    // Field expectations differ per source, so any existing report is now stale.
    if (report) reset();
  };

  const fieldSpec = SOURCE_FIELDS[source];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Upload a JSON export</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Source
            </span>
            <Select
              value={source}
              onChange={(event) =>
                onSourceChange(event.target.value as IngestSource)
              }
              aria-label="Ingest source"
            >
              {sources.map((info) => (
                <option
                  key={info.source}
                  value={info.source}
                  disabled={!info.upload_supported}
                >
                  {info.label}
                  {info.upload_supported ? "" : " — not supported"}
                </option>
              ))}
            </Select>
          </div>

          {fieldSpec && (
            <p className="text-[11px] text-muted-foreground">
              Expecting an array of{" "}
              <span className="font-medium">
                {fieldSpec.filter((field) => field.required).length} required
              </span>{" "}
              fields per row:{" "}
              <code className="font-mono">
                {fieldSpec.map((f) => f.name).join(", ")}
              </code>
              . An object with a <code className="font-mono">data</code> array
              is accepted too.
            </p>
          )}
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <UploadCloud
            className={cn(
              "size-6",
              dragging ? "text-primary" : "text-muted-foreground",
            )}
          />
          <p className="text-xs text-muted-foreground">
            Drop a <code className="font-mono">.json</code> file here, or
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file
          </Button>
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
        </div>

        {fileName && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <FileJson className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{fileName}</span>
              {report && (
                <Badge variant="outline">
                  {formatNumber(report.rowCount)}{" "}
                  {pluralise(report.rowCount, "row")}
                </Badge>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={reset}
              aria-label="Remove file"
            >
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

        {report && <ValidationSummary report={report} />}

        {report?.ok && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => {
                upload.mutate({ rows: report.rows, dryRun: true });
              }}
            >
              {upload.isPending && upload.variables?.dryRun ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Dry run
            </Button>

            <Button
              size="sm"
              disabled={upload.isPending}
              onClick={() => {
                upload.mutate({ rows: report.rows, dryRun: false });
              }}
            >
              {upload.isPending && upload.variables?.dryRun === false ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              Ingest {formatNumber(report.rowCount)}{" "}
              {pluralise(report.rowCount, "row")}
            </Button>

            <span className="text-[11px] text-muted-foreground">
              Dry run reports what would change without writing anything.
            </span>
          </div>
        )}

        {upload.isError && (
          <ErrorState error={upload.error} onRetry={() => upload.reset()} />
        )}
        {upload.isSuccess && upload.data && <UploadOutcome job={upload.data} />}
      </CardContent>
    </Card>
  );
}

/** A dry run that found rows to insert gets an explicit "now do it" nudge. */
function UploadOutcome({ job }: { job: IngestJob }) {
  return (
    <div className="space-y-2">
      <JobResult
        job={job}
        title={job.dry_run ? 'Dry run complete — nothing was written' : 'Ingest complete'}
      />
      {job.dry_run && job.counts.inserted > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {formatNumber(job.counts.inserted)} {pluralise(job.counts.inserted, 'row')} would be inserted.
          Use <span className="font-medium">Ingest</span> above to commit.
        </p>
      )}
    </div>
  );
}

function ValidationSummary({ report }: { report: ValidationReport }) {
  const { errors, warnings, unknownFields, ok, rowCount } = report;

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <Badge variant="success">
            <CheckCircle2 className="size-3" />
            Valid
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="size-3" />
            {formatNumber(errors.length)} {pluralise(errors.length, 'error')}
          </Badge>
        )}
        {warnings.length > 0 && (
          <Badge variant="warning">
            <AlertTriangle className="size-3" />
            {formatNumber(warnings.length)} {pluralise(warnings.length, 'warning')}
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground tnum">
          {formatNumber(rowCount)} {pluralise(rowCount, 'row')} parsed
        </span>
      </div>

      {unknownFields.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Ignored by the backend schema:{' '}
          <code className="font-mono">{unknownFields.join(', ')}</code>
        </p>
      )}

      {errors.length > 0 && <IssueList title="Errors — fix these before uploading" issues={errors} />}
      {warnings.length > 0 && (
        <IssueList
          title="Warnings — these will be stored as NA or skipped"
          issues={warnings}
        />
      )}
    </div>
  );
}

function IssueList({
  title,
  issues,
}: {
  title: string;
  issues: ValidationReport['errors'];
}) {
  // Long files can produce thousands of issues; showing the first 50 is enough to
  // fix the pattern, and rendering all of them would stall the page.
  const shown = issues.slice(0, 50);
  const hidden = issues.length - shown.length;

  return (
    <div>
      <p className="mb-1 text-xs font-medium">{title}</p>
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 scrollbar-thin">
        {shown.map((issue, index) => (
          <li key={index} className="flex gap-2 text-[11px]">
            <span className="shrink-0 font-mono text-muted-foreground">
              {issue.row >= 0 ? `row ${issue.row + 1}` : 'file'}
              {issue.field ? `·${issue.field}` : ''}
            </span>
            <span className={issue.severity === 'error' ? 'text-destructive' : 'text-[var(--warning)]'}>
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          …and {formatNumber(hidden)} more.
        </p>
      )}
    </div>
  );
}
