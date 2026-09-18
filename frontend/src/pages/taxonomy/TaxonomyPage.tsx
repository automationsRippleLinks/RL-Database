import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/UI/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/UI/card';
import { Input } from '@/components/UI/input';
import { Badge } from '@/components/UI/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/UI/tabs';
import { ErrorState, LoadingState } from '@/components/states';
import { taxonomyApi } from '@/lib/endpoints';
import { queryKeys } from '@/lib/query-client';
import { formatNumber, pluralise } from '@/lib/format';
import { ApiError } from '@/lib/api-client';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import type { TaxonomyKind, TaxonomyTerm } from '@/types/api';

const TABS: { value: TaxonomyKind; label: string }[] = [
  { value: 'categories', label: 'Categories' },
  { value: 'languages', label: 'Languages' },
];

const SINGULAR: Record<TaxonomyKind, string> = {
  categories: 'category',
  languages: 'language',
};

/**
 * Ingest used to create categories and languages on demand, so one typo in one
 * spreadsheet became a permanent facet. It rejects unknown terms now — which is
 * only workable if there's somewhere to add the real ones. This is that place.
 */
export function TaxonomyPage() {
  useDocumentTitle('Taxonomy');
  const [kind, setKind] = useState<TaxonomyKind>('categories');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Taxonomy</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          The categories and languages creator uploads are allowed to use. An upload
          naming anything that isn&rsquo;t listed here is rejected in full — add the term
          first, then re-upload.
        </p>
      </div>

      <Tabs value={kind} onValueChange={(next) => setKind(next as TaxonomyKind)}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Keyed so switching tabs resets the add field and any open rename. */}
      <TermList key={kind} kind={kind} />
    </div>
  );
}

function TermList({ kind }: { kind: TaxonomyKind }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.taxonomy(kind),
    queryFn: ({ signal }) => taxonomyApi.list(kind, { signal }),
  });

  // Facets and search results embed these names, so every write has to drop
  // their caches as well as this list.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.taxonomy(kind) });
    void queryClient.invalidateQueries({ queryKey: ['facets'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const create = useMutation({
    mutationFn: (name: string) => taxonomyApi.create(kind, name),
    onSuccess: () => {
      setDraft('');
      invalidate();
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      taxonomyApi.rename(kind, id, name),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => taxonomyApi.remove(kind, id),
    onSuccess: invalidate,
  });

  if (isPending) return <LoadingState label={`Loading ${kind}…`} />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const terms = data?.terms ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>
          {formatNumber(terms.length)} {pluralise(terms.length, SINGULAR[kind], kind)}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.trim();
            if (name) create.mutate(name);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Add a ${SINGULAR[kind]}…`}
            aria-label={`New ${SINGULAR[kind]}`}
          />
          <Button type="submit" size="sm" disabled={!draft.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Add
          </Button>
        </form>

        <MutationError error={create.error} />
        <MutationError error={rename.error} />
        <MutationError error={remove.error} />

        {terms.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nothing here yet. Every creator upload will be rejected until this list has
            the terms your sheets use.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {terms.map((term) => (
              <TermRow
                key={term.id}
                term={term}
                kind={kind}
                onRename={(name) => rename.mutate({ id: term.id, name })}
                onDelete={() => remove.mutate(term.id)}
                busy={rename.isPending || remove.isPending}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TermRow({
  term,
  kind,
  onRename,
  onDelete,
  busy,
}: {
  term: TaxonomyTerm;
  kind: TaxonomyKind;
  onRename: (name: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(term.name);
  const inUse = term.creator_count > 0;

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-3 py-2">
        <Input
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setValue(term.name);
              setEditing(false);
            }
          }}
          aria-label={`Rename ${term.name}`}
          className="h-8"
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Save"
          disabled={!value.trim() || value.trim() === term.name || busy}
          onClick={() => {
            onRename(value.trim());
            setEditing(false);
          }}
        >
          <Check />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Cancel"
          onClick={() => {
            setValue(term.name);
            setEditing(false);
          }}
        >
          <X />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{term.name}</span>
      {inUse && (
        <Badge variant="outline" className="shrink-0 tnum">
          {formatNumber(term.creator_count)} {pluralise(term.creator_count, 'creator')}
        </Badge>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Rename ${term.name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${term.name}`}
        // Renaming keeps the links; deleting a term in use would strip it from
        // every one of those creators. The backend refuses too — this just
        // saves the round trip and explains why.
        disabled={inUse || busy}
        title={
          inUse
            ? `${term.creator_count} creators use this ${SINGULAR[kind]} — rename it instead`
            : undefined
        }
        onClick={() => onDelete()}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  const detail =
    error instanceof ApiError ? error.detail : (error as Error).message ?? 'Something went wrong.';
  return <p className="text-xs text-destructive">{detail}</p>;
}
