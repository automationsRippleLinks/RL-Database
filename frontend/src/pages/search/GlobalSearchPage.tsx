import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, FileText, Link2, Link2Off, Megaphone, Search, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/UI/button';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/states';
import { Skeleton } from '@/components/UI/skeleton';
import { SectionTitle } from '@/components/bits';
import { formatNumber, pluralise } from '@/lib/format';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import type { ProfileLinkMatch, SearchGroup, SearchScope } from '@/types/api';
import {
  MIN_GLOBAL_QUERY_LENGTH,
  useGlobalSearch,
} from "@/features/search/queries";
import { creatorColumns } from "@/features/search/creators/columns";
import { brandColumns } from "@/features/search/brands/columns";
import { campaignColumns } from "@/features/search/campaigns/columns";
import { pitchColumns } from "@/features/search/pitches/columns";
import { SEARCH_SHORTCUT } from '@/lib/platform';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

const PREVIEW_LIMIT = 5;

/**
 * Global results are grouped by entity rather than interleaved. Relevance scores
 * aren't comparable across a creator and a campaign, so a single ranked list would
 * be arbitrary; grouping also lets each block hand off to its scoped tab, which is
 * where the filters live.
 */
export function GlobalSearchPage() {
  useDocumentTitle('Search');

  const url = useUrlSearchState();
  const navigate = useNavigate();
  const query = url.getString('q');
  const trimmed = query.trim();

  const { data, isPending, isFetching, isError, error, refetch } = useGlobalSearch(query, PREVIEW_LIMIT);

  if (trimmed.length < MIN_GLOBAL_QUERY_LENGTH) {
    return (
      <EmptyState
        icon={<Search className="size-7" />}
        title="Search the whole database"
        description={
          <>
            Type at least {MIN_GLOBAL_QUERY_LENGTH} characters to search
            creators, brands, campaigns and pitches at once — or pick a tab
            above to search one aspect with full filters. Press{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px] whitespace-nowrap">
              {SEARCH_SHORTCUT}
            </kbd>{" "}
            from anywhere to jump to the search box.
          </>
        } /** ⌘ + K / Ctrl + K from anywhere focuses the box — this is the app's main verb. */
      />
    );
  }

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  if (isPending) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { groups, profile_link: link } = data;
  const totalHits =
    groups.creators.total + groups.brands.total + groups.campaigns.total + groups.pitches.total;

  if (totalHits === 0) {
    // Three different failures, three different fixes. Collapsing them into one
    // "nothing matches" would leave someone re-pasting a link that was never
    // readable in the first place.
    if (link) return <NoLinkMatch link={link} />;
    return (
      <EmptyState
        title={`Nothing matches “${trimmed}”`}
        description="Try a shorter term, or check a specific tab where you can search with filters instead of free text."
      />
    );
  }

  return (
    <div className="space-y-6">
      {link?.username ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5 shrink-0" />
          <span>
            Read that link as the handle{' '}
            <span className="font-medium text-foreground">@{link.username}</span>
            {link.platform ? ` on ${link.platform}` : ''}, and searched creators for it.
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground tnum">
          {formatNumber(totalHits)} {pluralise(totalHits, 'match', 'matches')} across four entities in{' '}
          {data.took_ms} ms
        </p>
      )}

      <ResultGroup
        scope="creators"
        icon={<Users className="size-4" />}
        title="Creators"
        group={groups.creators}
        columns={creatorColumns}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/creators/${row.id}`)}
        query={trimmed}
        isFetching={isFetching}
      />

      <ResultGroup
        scope="brands"
        icon={<Building2 className="size-4" />}
        title="Brands"
        group={groups.brands}
        columns={brandColumns}
        rowKey={(row) => String(row.id)}
        onRowClick={(row) => navigate(`/brands/${row.id}`)}
        query={trimmed}
        isFetching={isFetching}
      />

      <ResultGroup
        scope="campaigns"
        icon={<Megaphone className="size-4" />}
        title="Campaigns"
        group={groups.campaigns}
        columns={campaignColumns}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/campaigns/${row.id}`)}
        query={trimmed}
        isFetching={isFetching}
      />

      <ResultGroup
        scope="pitches"
        icon={<FileText className="size-4" />}
        title="Pitches"
        group={groups.pitches}
        columns={pitchColumns}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/pitches/${row.id}`)}
        query={trimmed}
        isFetching={isFetching}
      />
    </div>
  );
}

/**
 * A pasted link that produced nothing. `username === null` means the URL itself
 * couldn't be read, which is a different problem from a handle nobody has.
 */
function NoLinkMatch({ link }: { link: ProfileLinkMatch }) {
  if (!link.username) {
    return (
      <EmptyState
        icon={<Link2Off className="size-7" />}
        title="That link can't be read"
        description={
          <>
            Profile URLs from Instagram, YouTube, LinkedIn and Facebook work — something like{' '}
            <code className="font-mono">instagram.com/their_handle</code>. A post or video link
            has no handle in it, so there's nothing to look up.
          </>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<Link2Off className="size-7" />}
      title={`No creator with the handle “@${link.username}”`}
      description={
        <>
          The link read fine{link.platform ? ` as a ${link.platform} profile` : ''}, but nobody in
          the database has that handle. They arrive with the pitch and campaign uploads — if this
          creator should be here, that sheet hasn't been ingested yet.
        </>
      }
    />
  );
}

function ResultGroup<Row>({
  scope,
  icon,
  title,
  group,
  columns,
  rowKey,
  onRowClick,
  query,
  isFetching,
}: {
  scope: SearchScope;
  icon: ReactNode;
  title: string;
  group: SearchGroup<Row>;
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  onRowClick: (row: Row) => void;
  query: string;
  isFetching: boolean;
}) {
  // A group with no hits is omitted entirely rather than shown empty — four empty
  // blocks between the useful ones is worse than a shorter page.
  if (group.total === 0) return null;

  const hidden = group.total - group.items.length;

  return (
    <section>
      <SectionTitle
        count={group.total}
        action={
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Link to={`/search/${scope}?q=${encodeURIComponent(query)}`}>
              {hidden > 0 ? `See all ${formatNumber(group.total)}` : 'Open with filters'}
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        }
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}</span>
        {title}
      </SectionTitle>

      <DataTable
        columns={columns}
        rows={group.items}
        rowKey={rowKey}
        onRowClick={onRowClick}
        isFetching={isFetching}
        maxHeightClass="max-h-none"
      />

      {hidden > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground tnum">
          Showing the top {group.items.length} of {formatNumber(group.total)}.
        </p>
      )}
    </section>
  );
}
