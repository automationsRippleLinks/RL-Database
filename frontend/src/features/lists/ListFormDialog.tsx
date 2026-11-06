import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ApiError } from '@/lib/api-client';
import type { ListVisibility } from '@/types/api';
import { VisibilityPicker } from './Visibility';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  initial?: { name: string; description: string | null; tags?: string[] };
  /** Show the Private / Team / Everyone choice (new lists only — existing ones use Share…). */
  visibility?: { initial: ListVisibility; teamName: string | null; disabledReason?: string | null };
  onSubmit: (values: { name: string; description: string | null; tags: string[]; visibility?: ListVisibility }) => Promise<unknown>;
}

/** "#glow-brief, beauty" → ["glow-brief", "beauty"]. The backend cleans them again. */
const parseTags = (text: string) =>
  Array.from(new Set(text.split(/[,\s]+/).map((t) => t.replace(/^#+/, '').trim().toLowerCase()).filter(Boolean))).slice(0, 8);

/** Name, short description and tags, for "New list" and "Rename / edit". */
export function ListFormDialog({ open, onOpenChange, title, description, submitLabel, initial, visibility, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).map((t) => `#${t}`).join(' '));
  const [vis, setVis] = useState<ListVisibility>(visibility?.initial ?? 'everyone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDesc(initial?.description ?? '');
      setTags((initial?.tags ?? []).map((t) => `#${t}`).join(' '));
      setVis(visibility?.initial ?? 'everyone');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tags compared by text, not by array identity
  }, [open, initial?.name, initial?.description, initial?.tags?.join(), visibility?.initial]);

  const submit = async () => {
    if (!name.trim()) {
      setError('Give the list a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: desc.trim() || null,
        tags: parseTags(tags),
        // Only sent when it can be changed, so a teammate renaming never trips the owner-only rule.
        ...(visibility && !visibility.disabledReason ? { visibility: vis } : {}),
      });
      setBusy(false);
      onOpenChange(false);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.fields.name ?? e.detail : 'Could not save. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-110 rounded-2xl border-rp-border bg-rp-surface p-5 shadow-rp">
        <DialogTitle className="text-[16px] font-bold">{title}</DialogTitle>
        {description && <DialogDescription className="mt-1 text-[12.5px] text-rp-muted">{description}</DialogDescription>}
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold">Name</span>
            <input
              autoFocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali beauty shortlist"
              aria-invalid={!!error}
              className="rounded-lg border border-rp-border bg-rp-bg px-3 py-2 text-[13px] outline-none focus:border-rp-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold">
              Description <span className="font-normal text-rp-muted">(optional)</span>
            </span>
            <textarea
              value={desc}
              maxLength={240}
              rows={3}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What is this list for? Which brand or campaign?"
              className="resize-none rounded-lg border border-rp-border bg-rp-bg px-3 py-2 text-[13px] outline-none focus:border-rp-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold">
              Tags <span className="font-normal text-rp-muted">(optional, separate with spaces or commas)</span>
            </span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#glow-brief #diwali"
              className="rounded-lg border border-rp-border bg-rp-bg px-3 py-2 text-[13px] outline-none focus:border-rp-primary"
            />
          </label>
          {visibility && <VisibilityPicker value={vis} onChange={setVis} teamName={visibility.teamName} disabledReason={visibility.disabledReason} />}
          {error && <p role="alert" className="text-[12.5px] text-rp-danger">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => onOpenChange(false)} className="cursor-pointer rounded-lg border border-rp-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-rp-primary px-4 py-2 text-xs font-bold text-rp-primary-fg disabled:opacity-60">
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
