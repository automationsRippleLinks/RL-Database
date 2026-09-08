# Ripple Pulse redesign — Creators

What the frontend now expects from the API, and what it does in the meantime.

The redesign is scoped to **Creators**. Brands, Campaigns and Pitches keep the
search they already had, rendered inside the new shell (see `PLACEHOLDER_SCOPES`
in `frontend/src/router.tsx` if they should be hidden instead).

## What changed on the frontend

| Before | Now |
|---|---|
| Header nav + omnibox + scope tabs | Fixed header (logo, one search box, feedback, account) over `App rail \| Data rail \| results` |
| Filters in a sidebar of loose controls | Five collapsible filter groups in the data rail, each holding multi-select dropdowns that open **inline, inside the rail's width** |
| Full-page `/creators/:id` profile | A right-hand drawer over the results, addressed by `?creator=<id>`. `/creators/:id` redirects to it, so existing links keep working |
| Light/dark toggle | Light / Dark / System, in the account menu |
| 25–500 per page | 50 / 100 / 150 / 200 / 250 |

Filters, search, sort and paging compose: changing any filter resets to page 1,
and page size never changes the result set.

## Backend work this depends on

Each item degrades gracefully today — the UI omits the section, shows an
em-dash, or renders an explanatory empty state rather than asserting something
false. None of them blocks the rest of the screen.

| What | Where | Without it |
|---|---|---|
| `brand_ids: list[int]` on `CreatorSearchRequest` — creators who ran a campaign for these brands (`Creator → CampaignCreatorLink → Campaign.brand_id`) | `app/schemas/search.py`, `app/services/search.py` | The rail's **Brand** group looks applied but returns unfiltered rows. This is the one gap that is silently wrong rather than visibly absent, because Pydantic ignores unknown request fields |
| `tags: list[str]` on `CreatorSearchRequest`, and `tags` on `CreatorFacets` | same, plus `/search/facets/creators` | The **Tags** control says "Tags aren't available from the API yet" |
| `campaign_count` on `CreatorRow` — campaigns that ran, excluding dropped links | `app/schemas/search.py` | The **Worked with us** column shows `—` for every row |
| `campaigns_desc` as a `sort` value | `app/services/search.py` | "Most campaigns with us" falls back to whatever unknown sorts do today |
| The `PitchCreatorLink` cost columns on `CreatorPitchSummary` (`reel_cost`, `reel_story_cost`, `video_story_cost`, `static_carousel_cost`, `short_form_videos_cost`, `reshare_short_form_videos_cost`, `dedicated_video_cost`, `integrated_video_cost`, `package_cost`) — they are already on `PitchCreatorRow` | `app/schemas/detail.py` | The drawer omits **Commercial package** entirely |
| `POST /feedback` | new | The feedback modal hands the report to the reporter's mail client instead, and says so |

Two more things in the design have no backend at all yet, and the UI says so
plainly rather than pretending: **"Add to a pitch list"** in the drawer footer,
and the **Ingest / Tags** app-rail entries (which point at the existing pages).

## Region and State have no column

`Creator.city` is the only place field in the schema, and the facets return
cities alone. The Location group's Region → State → City chain is therefore
derived on the client, in `frontend/src/lib/geo.ts`: a city → state → region
table narrows the options, and a Region or State selection is expanded into the
cities it covers before the request goes out. The backend still only ever sees
`cities`, so nothing is required of it.

Consequences worth knowing:

- A city the table doesn't recognise still appears under **City**, but is in no
  Region and no State — it is excluded once either upper level is set, which is
  the honest answer rather than a guessed region.
- Adding a real `state` column later means changing `citiesIn`/`resolveCityFilter`
  and nothing else.

## Sorting lost "relevance"

The handoff specifies exactly five orderings and none of them is relevance, so
a text search is now ordered by follower count rather than by match quality.
The backend still accepts `relevance`; adding a sixth row to `CREATOR_SORTS`
(`frontend/src/features/search/request-state.ts`) and defaulting to it while a
query is present is the whole fix if that turns out to be missed.

## Contact masking

The table shows `mailto:`/`tel:` glyphs rather than the addresses, so no
personal data is on screen in a shared window — a step further than the old
masked columns. The values themselves appear in the drawer, with a copy button
and a cycler for creators who have several.
