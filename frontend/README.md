# RL Database — React frontend

Internal search tool for the Ripple Links creator / brand / campaign / pitch database.
Replaces `frontend/streamlit_app.py`, which is kept for reference until this is live.

## Quick start

```bash
cd frontend-react
npm install
cp .env.example .env.local
npm run dev          # http://localhost:5173
```

It runs on fixture data out of the box (`VITE_USE_MOCKS=true`), because **most of the API
endpoints this app needs do not exist in the backend yet**. The contract to build against is
[`src/types/api.ts`](src/types/api.ts) for the shapes, [`src/lib/endpoints.ts`](src/lib/endpoints.ts)
for the routes, and [`src/lib/mocks/handlers.ts`](src/lib/mocks/handlers.ts) for the filtering /
sorting / pagination semantics the UI was built against. Once the endpoints exist, flip
`VITE_USE_MOCKS=false` to point at the real thing.

In mock mode, any `@ripplelinks.com` address with a 4+ character password signs in.

### Mock triggers

Fixed values that steer the mock backend down each branch of the real contract, so every
state is reachable without a running server:

| Value | Effect |
|---|---|
| `?token=expired` on `/verify-email` or `/reset-password` | 400 + `invalid_token` — the expired-link state |
| any other token | verifies / resets successfully and signs you in |
| `unverified@ripplelinks.com` | login returns 403 `not_verified`, showing the inline resend form |
| `ratelimited@ripplelinks.com` | 429 + `Retry-After: 45` — the live cooldown countdown |
| `taken@ripplelinks.com` | signup returns 409 |

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server, proxying `/api` → `http://localhost:8000` |
| `npm run build` | Typecheck (`tsc -b`) then production build to `dist/` |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the built `dist/` |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | API root. Keep relative in dev so requests stay same-origin. |
| `VITE_PROXY_TARGET` | `http://localhost:8000` | Where the dev server forwards `/api`. |
| `VITE_USE_MOCKS` | `true` | Serve `src/lib/mocks` fixtures instead of calling the backend. |

### Why the dev proxy matters

The session is an **httpOnly cookie**. If the SPA were served from `:5173` and the API from
`:8000`, those are cross-origin and the cookie would be subject to `SameSite` / third-party
cookie rules. `vite.config.ts` proxies `/api` to the backend so everything is same-origin,
which is also how it should be deployed — SPA and API behind one hostname. If you must split
hostnames, the backend needs `SameSite=None; Secure` plus CORS `allow_credentials` with an
explicit origin list.

## Layout

```
src/
├── types/api.ts          # the whole API contract — the source of truth for both sides
├── lib/
│   ├── api-client.ts     # fetch wrapper: credentials, CSRF header, abort, ApiError, 401 hook
│   ├── endpoints.ts      # one function per endpoint; routes to real API or mocks
│   ├── enums.ts          # mirror of backend/app/models/enums.py + parser.py raw vocabularies
│   ├── format.ts         # number/date/duration formatting, profile_url derivation
│   ├── query-client.ts   # TanStack defaults + query keys
│   └── mocks/            # fixture data and an in-memory implementation of the contract
├── hooks/                # useDebouncedValue, useUrlSearchState, useTheme
├── features/
│   ├── auth/             # provider, login, Google redirect, guards,
│   │                     # signup / verify-email / forgot- + reset-password
│   ├── search/           # omnibox, scope tabs, global view, and one folder per entity
│   └── ingest/           # Apps Script trigger, JSON upload + validator, job history
└── components/           # DataTable, Pagination, facet controls, states, ui/ primitives
```

Each of the four scoped searches is the same pattern: a filter panel, a column config, and a
call to its `use*Search` hook. Only the filters and columns differ — the table, pagination and
URL-state plumbing are shared.

## How live search works

- **The URL is the state.** `q`, `page`, `size`, `sort` and every filter live in search params,
  so a result set is shareable by copying the address bar and back/forward works.
- **Typing is instant, fetching is debounced.** The input holds local state; a 250 ms debounce
  pushes the value into the URL with `replace` so one query doesn't create fifty history entries.
- **Requests cancel.** TanStack's `signal` is passed into `fetch`, so a superseded keystroke's
  request aborts rather than racing the current one.
- **No flicker.** `placeholderData: keepPreviousData` keeps previous rows visible (dimmed) while
  the next page or query resolves.
- Each scope's results are cached under their own query key, so switching tabs is instant.

## Auth routes

`/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` and `/auth/callback`
are all **public** — outside `<RequireAuth>`. Anyone arriving from a link in their inbox has no
session yet, so guarding these would bounce them to login and break the flow the email exists to
start.

Two of them sign you in as a side effect: `/auth/verify-email` and `/auth/reset-password` set the
session cookies and return the `SessionUser`, so those pages seed the auth cache directly and
redirect into the app rather than asking for credentials the user just proved they hold.

`/forgot-password` and the resend-verification form always render the same confirmation whether or
not the account exists, matching the backend's unconditional 204 — that identical output is the
feature, not laziness. On `429` the shared `useCooldown` hook turns `Retry-After` into a live
countdown and disables the button until it clears.

## Notes on the data

A few schema details the UI has to work around, all documented at the call site:

- `Brand` is a real table, and `Campaign.brand_name` / `Pitch.company_name` /
  `Pitch.billing_company_id` no longer exist. Rows carry `brand: BrandRef | null` and brands are
  filtered and routed by numeric id. **`brand_id` is nullable and nothing populates it yet**, so
  "not linked" is the common case — every brand cell renders it explicitly rather than blank.
- A pitch reaches its billing company *through* its brand (`Company 1─N Brand 1─N Pitch`), so the
  company appears on the brand and pitch detail pages, not on the pitch search row.
- `Brand.name` casing is unpredictable. The model has a lowercasing validator, but SQLModel skips
  validation on `table=True` classes, so it never runs — names arrive however they were written
  (`boat`, `boAt`, `BOAT`). The UI renders whatever the API returns; title-casing client-side would
  mangle `CRED` and `boAt` differently, so display casing is a backend decision.
- `Creator` has no `profile_url` column — `lib/format.ts` derives it from `platform` + `username`,
  and also accepts a server-computed one.
- `TierChoices.NA` is the empty string, which can't be a select value or URL param. The UI uses a
  `__na__` sentinel and converts at the API boundary.
- The tier value is `mid-tier` (hyphen). Every label map is keyed on the real DB value; the
  Streamlit app used `mid_tier` and rendered that tier as a raw string.
- `CampaignCreatorLink` only has `ig_*` and `yt_*` tracker columns, so LinkedIn / Facebook /
  "others" deliverables have nowhere of their own to store metrics.
- Creator emails and phones are masked until explicitly revealed.
- Creator search legitimately returns nothing today: the `pitch_creator` / `campaign_creator`
  ingest sources are declared in the backend but unimplemented, so `creator` has no data source.
