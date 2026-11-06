import { Link, useLocation } from 'react-router-dom';
import { backState, pageLabel } from '@/lib/navigation';
import { ChevronRight, ListPlus } from 'lucide-react';
import { listPath } from '@/pages/lists/ListsPage';
import { cn } from '@/lib/utils';
import { AddToListMenu } from './AddToListMenu';
import { STATUS_META, useCreatorLists } from './queries';

/** The drawer's "In lists": which lists this creator is saved in, each a link, plus Add to a list. */
export function CreatorListsSection({ creatorId }: { creatorId: string }) {
  const q = useCreatorLists(creatorId);
  const lists = q.data?.lists ?? [];
  const location = useLocation();
  const back = backState(location, pageLabel(location));
  return (
    <section aria-label="In lists" className="shrink-0 border-t border-rp-border px-4.5 py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-bold tracking-[0.06em] text-rp-muted uppercase">
          {q.isPending ? 'In lists' : lists.length ? `In ${lists.length} ${lists.length === 1 ? 'list' : 'lists'}` : 'Not in any list'}
        </span>
        <AddToListMenu
          creatorIds={[creatorId]}
          surface="drawer"
          trigger={
            <button type="button" className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold text-rp-primary hover:bg-rp-primary-soft">
              <ListPlus className="size-3.5" /> Add to a list
            </button>
          }
        />
      </div>
      {lists.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {lists.map((l) => (
            <Link
              key={l.id}
              to={listPath(l.id)}
              state={back}
              title={`${STATUS_META[l.status].label} in ${l.name}. Open the list.`}
              className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-rp-border bg-rp-surface2 py-1 pr-1.5 pl-2.5 text-[12px] font-semibold hover:border-rp-primary"
            >
              <i className={cn('size-1.5 shrink-0 rounded-full', STATUS_META[l.status].dot)} aria-hidden="true" />
              <span className="truncate">{l.name}</span>
              <ChevronRight className="size-3 shrink-0 text-rp-muted group-hover:text-rp-primary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
