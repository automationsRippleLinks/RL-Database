import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronRight,
  FileText,
  Loader2,
  Megaphone,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useDismissable } from '@/hooks/useDismissable';
import { useUrlSearchState } from '@/hooks/useUrlSearchState';
import { SEARCH_SHORTCUT } from '@/lib/platform';
import { cn } from '@/lib/utils';
import type { SearchScope } from '@/types/api';
import { MIN_GLOBAL_QUERY_LENGTH, detailPath, useSuggestions } from '@/features/search/queries';

const SCOPE_ICON: Record<SearchScope, LucideIcon> = {
  creators: Users,
  brands: Building2,
  campaigns: Megaphone,
  pitches: FileText,
};

const PLACEHOLDERS: Record<string, string> = {
  '/search/creators': 'Search creators — name, handle, city or topic',
  '/search/brands': 'Search brands — name or the company that pays',
  '/search/campaigns': 'Search campaigns — name, code, brand or owner',
  '/search/pitches': 'Search pitches — brand, idea or who sold it',
};

/**
 * Names the section a query looks like, before any request goes out.
 *
 * The shapes it recognises are unambiguous — a pasted profile URL, an @handle, a
 * CMP-/PIT- code — so it can answer instantly and correctly. Anything else falls
 * through to what the suggestion endpoint actually matched, and to Creators when
 * even that is empty, because Creators is what people search for.
 */
function guessScope(query: string, firstHitScope: SearchScope | undefined): SearchScope {
  const text = query.trim().toLowerCase();
  if (/^https?:|instagram\.com|youtube\.com|linkedin\.com|facebook\.com|^@/.test(text)) {
    return 'creators';
  }
  if (/^cmp/.test(text)) return 'campaigns';
  if (/^pit/.test(text)) return 'pitches';
  return firstHitScope ?? 'creators';
}

function reasonFor(query: string, scope: SearchScope, matched: boolean): string {
  const text = query.trim().toLowerCase();
  if (/^https?:|instagram\.com|youtube\.com|linkedin\.com|facebook\.com|^@/.test(text)) {
    return 'That looks like a profile link';
  }
  if (/^cmp/.test(text)) return 'CMP- codes belong to campaigns';
  if (/^pit/.test(text)) return 'PIT- codes belong to pitches';
  if (matched) {
    return {
      creators: 'Matches a creator we have on file',
      brands: 'Matches a brand we work with',
      campaigns: 'Matches a campaign name',
      pitches: 'Matches a pitch we sent',
    }[scope];
  }
  return 'Looks like a person, place or topic';
}

const SCOPE_TITLE: Record<SearchScope, string> = {
  creators: 'Creators',
  brands: 'Brands',
  campaigns: 'Campaigns',
  pitches: 'Pitches',
};

/**
 * The one search box, in the header, shared by every section.
 *
 * Typing writes to local state immediately so the field never lags; a 250ms
 * debounce pushes the value into the URL with `replace`, so a long query leaves
 * one history entry rather than one per character.
 */
export function PulseSearch() {
  const url = useUrlSearchState();
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const urlQuery = url.getString('q');
  const [text, setText] = useState(urlQuery);
  const debounced = useDebouncedValue(text, 250);
  const [focused, setFocused] = useState(false);

  // Keep in step when the URL changes from elsewhere (back button, a cleared
  // filter, a link into a pre-filtered search) without stomping on active typing.
  useEffect(() => {
    setText((current) => (current === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  useEffect(() => {
    if (debounced === urlQuery) return;
    url.setParams({ q: debounced || null }, { replace: true, resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const suggestQuery = useSuggestions(debounced, focused);
  // Memoised so the fallback [] doesn't change identity on every render and
  // re-run the guess below with it.
  const suggestions = useMemo(
    () => suggestQuery.data?.suggestions ?? [],
    [suggestQuery.data],
  );

  const trimmed = debounced.trim();
  const scope = useMemo(() => guessScope(trimmed, suggestions[0]?.type), [trimmed, suggestions]);
  const open = focused && trimmed.length >= MIN_GLOBAL_QUERY_LENGTH;

  const close = useCallback(() => setFocused(false), []);
  useDismissable('search', open, close);

  /** ⌘K / Ctrl-K from anywhere focuses the box — this is the app's main verb. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const goToScope = () => {
    setFocused(false);
    navigate(`/search/${scope}?q=${encodeURIComponent(text.trim())}`);
  };

  const ScopeIcon = SCOPE_ICON[scope];
  const placeholder =
    PLACEHOLDERS[location.pathname] ?? 'Search creators, brands, campaigns and pitches';

  return (
    <div data-rp-pop="search" className="relative max-w-[760px] flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-[15px] size-[18px] -translate-y-1/2 text-rp-muted" />

      <input
        ref={inputRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setFocused(true);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && trimmed.length >= MIN_GLOBAL_QUERY_LENGTH) goToScope();
        }}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls="pulse-suggestions"
        aria-autocomplete="list"
        className={cn(
          'w-full rounded-full border bg-rp-surface2 py-[11px] pr-[42px] pl-11 text-[13.5px] outline-none',
          focused ? 'border-rp-primary' : 'border-transparent',
        )}
      />

      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1.5">
        {suggestQuery.isFetching && <Loader2 className="size-3.5 animate-spin text-rp-muted" />}
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText('');
              url.setParams({ q: null }, { replace: true, resetPage: true });
              inputRef.current?.focus();
            }}
            title="Clear"
            aria-label="Clear search"
            className="flex cursor-pointer rounded-full p-1 text-rp-muted hover:bg-rp-surface2 hover:text-rp-text"
          >
            <X className="size-[15px]" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-rp-border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-rp-muted select-none sm:inline-block">
            {SEARCH_SHORTCUT}
          </kbd>
        )}
      </div>

      {open && (
        <div
          id="pulse-suggestions"
          className="animate-rp-menu absolute top-[calc(100%+6px)] right-0 left-0 z-[55] overflow-hidden rounded-xl border border-rp-border bg-rp-surface shadow-rp"
        >
          <button
            type="button"
            onClick={goToScope}
            className="flex w-full cursor-pointer items-center gap-[11px] bg-rp-primary-soft px-[15px] py-3 text-left"
          >
            <ScopeIcon className="size-[17px] shrink-0 text-rp-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold">
                Search {SCOPE_TITLE[scope]} for “{trimmed}”
              </span>
              <span className="block text-[11.5px] text-rp-muted">
                {reasonFor(trimmed, scope, suggestions.length > 0)}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-rp-primary" />
          </button>

          {suggestions.slice(0, 3).map((hit) => {
            const HitIcon = SCOPE_ICON[hit.type];
            return (
              <button
                key={`${hit.type}-${hit.id}`}
                type="button"
                onClick={() => {
                  setFocused(false);
                  navigate(detailPath(hit.type, hit.id));
                }}
                className="flex w-full cursor-pointer items-center gap-[11px] border-t border-rp-border px-[15px] py-2.5 text-left hover:bg-rp-surface2"
              >
                <HitIcon className="size-4 shrink-0 text-rp-muted" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{hit.label}</span>
                {hit.sublabel && (
                  <span className="shrink-0 text-[11.5px] text-rp-muted">{hit.sublabel}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
