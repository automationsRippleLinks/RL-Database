import { useEffect, useRef, useState } from 'react';
import { ChevronDown, StickyNote } from 'lucide-react';
import type { Column } from '@/components/DataTable';
import { useToast } from '@/components/Toast';
import { useDismissable } from '@/hooks/useDismissable';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CreatorRow, ListMember, ListStatus } from '@/types/api';
import { STATUS_META, STATUSES, useListActions } from './queries';

/** The two columns a list adds to the normal Creators table: status and note. `readOnly` = you can only view the list. */
export function listColumns(listId: string, members: Map<string, ListMember>, readOnly = false): Column<CreatorRow>[] {
  return [
    {
      id: 'list-status',
      header: 'Status',
      headerClassName: 'text-left w-36 text-[12px]',
      className: 'w-34',
      cell: (row) => {
        const m = members.get(row.id);
        if (!m) return null;
        return readOnly ? <StatusPill status={m.status} /> : <StatusSelect listId={listId} creatorId={row.id} value={m.status} />;
      },
    },
    {
      id: 'list-note',
      header: 'Note',
      headerClassName: 'text-left w-56 text-[12px]',
      className: 'w-56',
      cell: (row) => {
        const m = members.get(row.id);
        if (!m) return null;
        return readOnly ? <span className="line-clamp-2 max-w-52 text-[12px] text-rp-muted">{m.note ?? '—'}</span> : <NoteCell listId={listId} creatorId={row.id} member={m} />;
      },
    },
  ];
}

export function StatusPill({ status, className }: { status: ListStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.25 py-0.75 text-[11.5px] font-semibold whitespace-nowrap', meta.tone, className)}>
      <i className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function StatusSelect({ listId, creatorId, value }: { listId: string; creatorId: string; value: ListStatus }) {
  const [open, setOpen] = useState(false);
  const act = useListActions();
  const { flash } = useToast();
  const tag = `status-${creatorId}`;
  useDismissable(tag, open, () => setOpen(false));
  return (
    <div data-rp-pop={tag} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status: ${STATUS_META[value].label}. Change status`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full"
      >
        <StatusPill status={value} />
        <ChevronDown className="size-3 text-rp-muted" />
      </button>
      {open && (
        <div role="listbox" className="animate-rp-menu absolute top-[calc(100%+4px)] left-0 z-30 w-40 rounded-xl border border-rp-border bg-rp-surface p-1.25 shadow-rp">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === value}
              onClick={async () => {
                setOpen(false);
                if (s === value) return;
                try {
                  await act.updateMember.mutateAsync({ id: listId, creatorId, body: { status: s } });
                } catch {
                  flash('Could not change the status');
                }
              }}
              className={cn('flex w-full cursor-pointer items-center rounded-lg px-2 py-1.5 hover:bg-rp-surface2', s === value && 'bg-rp-surface2')}
            >
              <StatusPill status={s} className="bg-transparent px-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCell({ listId, creatorId, member }: { listId: string; creatorId: string; member: ListMember }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(member.note ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const act = useListActions();
  const { flash } = useToast();
  useEffect(() => setText(member.note ?? ''), [member.note]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const save = async () => {
    setEditing(false);
    if ((member.note ?? '') === text.trim()) return;
    try {
      await act.updateMember.mutateAsync({ id: listId, creatorId, body: { note: text } });
      flash(text.trim() ? 'Note saved' : 'Note removed');
    } catch {
      flash('Could not save the note');
      setText(member.note ?? '');
    }
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={text}
        maxLength={500}
        rows={2}
        aria-label="Note for this creator in this list"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') {
            setText(member.note ?? '');
            setEditing(false);
          }
        }}
        className="w-52 resize-none rounded-lg border border-rp-primary bg-rp-bg px-2 py-1 text-[12px] outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title={member.note ? `Added ${timeAgo(member.added_at)} by ${member.added_by.name}. Click to edit the note.` : `Added ${timeAgo(member.added_at)} by ${member.added_by.name}`}
      className={cn('flex max-w-52 cursor-text items-start gap-1.5 rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-rp-surface2', member.note ? 'text-rp-text' : 'text-rp-muted')}
    >
      <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
      <span className="line-clamp-2">{member.note ?? 'Add a note'}</span>
    </button>
  );
}
