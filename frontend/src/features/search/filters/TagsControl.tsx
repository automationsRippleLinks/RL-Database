import { useMemo, useState } from 'react';
import { ChevronDown, Hash, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';


/**
 * Tags are search-to-add rather than a dropdown: the vocabulary is open-ended
 * and grows with the data, so a list of every tag is the wrong shape. Applied
 * tags become removable chips; the suggestion list scrolls inside itself.
 */
export function TagsControl({
  vocabulary,
  selected,
  onChange,
  open,
  onToggle,
}: {
  /** Undefined while the facets endpoint still doesn't return tags — see below. */
  vocabulary: string[] | undefined;
  selected: string[];
  onChange: (tags: string[]) => void;
  open: boolean;
  onToggle: () => void;
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
      <button
        type="button"
        onClick={() => {
          setQuery('');
          onToggle();
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-[12px] font-semibold text-rp-text transition-colors",
          open
            ? "border-rp-primary bg-rp-surface2"
            : "border-rp-border bg-rp-surface hover:bg-rp-surface2"
        )}
      >
        <span className="flex items-center gap-2">
          <Hash className="size-4 text-rp-muted" />
          <span>Tags</span>
        </span>

        <ChevronDown
          className={cn(
            'size-3.5 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="mt-1 rounded-[10px] border border-rp-border bg-rp-surface p-1.5">
          {vocabulary === undefined ? (
            <p className="rounded-lg border border-dashed border-rp-border px-2.25 py-2 text-[11px] text-rp-muted">
              Tags aren't available from the API yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tags"
                aria-label="Search tags"
                className="w-full rounded-lg border border-rp-border bg-rp-surface2 px-2.25 py-1.75 text-xs outline-none focus-visible:border-rp-primary"
              />

              {selected.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {selected.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.25 rounded-full bg-rp-primary-soft py-0.75 pr-1.75 pl-2 text-[10.5px] font-semibold text-rp-primary"
                    >
                      {tag}

                      <button
                        type="button"
                        onClick={() =>
                          onChange(selected.filter((item) => item !== tag))
                        }
                        className="flex cursor-pointer"
                      >
                        <X className="size-2.75" strokeWidth={3} />
                      </button>
                    </span>
                  ))}
                </span>
              )}

              <div className="rp-scroll flex max-h-37.5 flex-col gap-px overflow-x-hidden overflow-y-auto">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      onChange([...selected, tag]);
                      setQuery('');
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.25 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-rp-text transition-colors hover:bg-rp-surface2"
                  >
                    <Plus
                      className="size-3.25 shrink-0 text-rp-muted"
                      strokeWidth={2.4}
                    />

                    <span className="min-w-0 flex-1 truncate">
                      {tag}
                    </span>
                  </button>
                ))}

                {suggestions.length === 0 && (
                  <p className="px-1 py-2 text-[11.5px] text-rp-muted">
                    {vocabulary.length === 0
                      ? 'No tags in the database yet.'
                      : 'Nothing matches that.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}