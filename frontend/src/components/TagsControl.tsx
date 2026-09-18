import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * Tags are search-to-add rather than a dropdown: the vocabulary is open-ended
 * and grows with the data, so a list of every tag is the wrong shape. Applied
 * tags become removable chips; the suggestion list scrolls inside itself.
 */
export function TagsControl({
  vocabulary,
  selected,
  onChange,
}: {
  /** Undefined while the facets endpoint still doesn't return tags — see below. */
  vocabulary: string[] | undefined;
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (vocabulary ?? [])
      .filter((tag) => !selected.includes(tag))
      .filter((tag) => !needle || tag.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [vocabulary, selected, query]);

  return (
    <div className="shrink-0">
      <span className="mb-1 block text-[11px] font-semibold text-rp-muted">Tags</span>

      {/*
        The backend does not return a tag vocabulary yet (CreatorFacets.tags is
        optional for exactly this reason). Saying so beats a search box that
        matches nothing no matter what is typed, which reads as a broken filter.
      */}
      {vocabulary === undefined ? (
        <p className="rounded-lg border border-dashed border-rp-border px-[9px] py-2 text-[11px] text-rp-muted">
          Tags aren't available from the API yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tags"
            aria-label="Search tags"
            className="w-full rounded-lg border border-rp-border bg-rp-surface2 px-[9px] py-[7px] text-xs outline-none focus-visible:border-rp-primary"
          />

          {selected.length > 0 && (
            <span className="flex flex-wrap gap-1">
              {selected.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-[5px] rounded-full bg-rp-primary-soft py-[3px] pr-[5px] pl-2 text-[10.5px] font-semibold text-rp-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => onChange(selected.filter((item) => item !== tag))}
                    title={`Remove ${tag}`}
                    aria-label={`Remove tag ${tag}`}
                    className="flex cursor-pointer"
                  >
                    <X className="size-[11px]" strokeWidth={3} />
                  </button>
                </span>
              ))}
            </span>
          )}

          <div className="rp-scroll flex max-h-[150px] flex-col gap-px overflow-x-hidden overflow-y-auto">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  onChange([...selected, tag]);
                  setQuery('');
                }}
                className="flex w-full cursor-pointer items-center gap-[9px] rounded-lg px-[10px] py-2 text-left text-[12.5px] font-medium text-rp-text transition-colors hover:bg-rp-surface2"
              >
                <Plus className="size-[13px] shrink-0 text-rp-muted" strokeWidth={2.4} />
                <span className="min-w-0 flex-1 truncate">{tag}</span>
              </button>
            ))}
            {suggestions.length === 0 && (
              <p className="px-1 py-2 text-[11.5px] text-rp-muted">
                {vocabulary.length === 0 ? 'No tags in the database yet.' : 'Nothing matches that.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
