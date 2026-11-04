import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backState, pageLabel } from '@/lib/navigation';
import { ListPlus } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { listPath } from '@/pages/lists/ListsPage';
import { cn } from '@/lib/utils';
import { ListFormDialog } from './ListFormDialog';
import { useListActions } from './queries';
import { useAuth } from '@/features/auth/useAuth';

/**
 * "Save these as a list": turns whatever is on screen (a chart bar, a missing-info
 * filter, a graph's creators) into a list in one step, then offers to open it.
 */
export function SaveAsListButton({
  count,
  suggestedName,
  fetchIds,
  className,
  label = 'Save as list',
}: {
  count: number;
  suggestedName: string;
  fetchIds: () => Promise<string[]>;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const act = useListActions();
  const { flash } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  return (
    <>
      <button
        type="button"
        disabled={!count}
        onClick={() => setOpen(true)}
        title={count ? `Save these ${count} creators as a new list` : 'Nothing to save'}
        className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-rp-border bg-rp-surface px-3 py-1.75 text-[12.5px] font-semibold text-rp-text hover:bg-rp-surface2 disabled:cursor-not-allowed disabled:opacity-50', className)}
      >
        <ListPlus className="size-3.75" /> {label}
      </button>
      <ListFormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Save ${count} creators as a list`}
        description="Choose who can see it. You can change this later from the list."
        submitLabel="Save list"
        initial={{ name: suggestedName, description: null }}
        visibility={{ initial: user?.team ? 'team' : 'everyone', teamName: user?.team?.name ?? null }}
        onSubmit={async (v) => {
          const ids = await fetchIds();
          const l = await act.create.mutateAsync({ ...v, creator_ids: ids });
          flash(`Saved ${l.creator_count} creators to ${l.name}`);
          navigate(listPath(l.id), { state: backState(location, pageLabel(location)) });
        }}
      />
    </>
  );
}
