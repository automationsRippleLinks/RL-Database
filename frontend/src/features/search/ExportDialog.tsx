import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/UI/dialog';

// ── EXPORT OPTIONS ─────────────────────────────────────────────

export type ExportScope = 'selected' | 'current' | 'all';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  currentCount: number;
  matchingCount: number;
  onExport: (scope: ExportScope) => Promise<void> | void;
}

// ── EXPORT DIALOG ──────────────────────────────────────────────

export function ExportDialog({
  open,
  onOpenChange,
  selectedCount,
  currentCount,
  matchingCount,
  onExport,
}: ExportDialogProps) {
  const [scope, setScope] = useState<ExportScope>(
    selectedCount > 0 ? 'selected' : 'current',
  );
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = [
    {
      value: 'selected',
      label: `Selected rows (${selectedCount})`,
      description: 'Include selections saved from other pages.',
      disabled: selectedCount === 0,
    },
    {
      value: 'current',
      label: `Current page (${currentCount})`,
      description: 'Export every row displayed on this page.',
      disabled: currentCount === 0,
    },
    {
      value: 'all',
      label: `All matching results (${matchingCount})`,
      description: 'Export all pages using your current search and filters.',
      disabled: matchingCount === 0,
    },
  ] as const;

  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      await onExport(scope);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Export failed. Please try again.',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!exporting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-110 rounded-2xl border-rp-border bg-rp-surface p-5 shadow-rp">
        <DialogTitle className="text-[16px] font-bold">
          Export data
        </DialogTitle>

        <DialogDescription className="mt-1 text-[12.5px] text-rp-muted">
          Choose which records to include in your CSV.
        </DialogDescription>

        {/* ── EXPORT SCOPE ────────────────────────────────────── */}
        <div className="mt-5 flex flex-col gap-2">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-rp-border p-3 has-checked-border-rp-primary has-checked:bg-rp-primary-soft has-disabled:cursor-not-allowed has-disabled:opacity-50"
            >
              <input
                type="radio"
                name="export-scope"
                value={option.value}
                checked={scope === option.value}
                disabled={option.disabled || exporting}
                onChange={() => setScope(option.value)}
                className="mt-0.5 accent-rp-primary"
              />

              <span className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold">
                  {option.label}
                </span>

                <span className="text-[12px] text-rp-muted">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>

        {/* ── EXPORT ERROR ────────────────────────────────────── */}
        {error && (
          <p role="alert" className="mt-3 text-xs text-rp-danger">
            {error}
          </p>
        )}

        {/* ── DIALOG ACTIONS ──────────────────────────────────── */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-rp-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="rounded-lg bg-rp-primary px-4 py-2 text-xs font-bold text-rp-primary-fg disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}