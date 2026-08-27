# Ingest JSON formats

The exact shape of every file the ingest uploader accepts, what each field does, and
the rules that will get a file rejected.

Source of truth for the field lists is
[`backend/app/schemas/apps_script_response.py`](../backend/app/schemas/apps_script_response.py);
for the coercion rules, [`backend/app/services/parser.py`](../backend/app/services/parser.py).
If those change and this doesn't, they win.

---

## How an upload works

`POST /api/v1/ingest/upload` — `multipart/form-data`:

| Part | Value |
| --- | --- |
| `file` | The `.json` file. Max **25 MB**. |
| `source` | `pitch_master` \| `campaign_master` \| `pitch_creator` \| `campaign_creator` |
| `dry_run` | `true` runs everything and rolls it back. `false` commits. |

Two envelopes are accepted, so an Apps Script export works unmodified:

```json
[ { "…": "row" }, { "…": "row" } ]
```

```json
{ "data": [ { "…": "row" }, { "…": "row" } ] }
```

**A dry run is not free.** It does all the real work — inserts, upserts, sequence
bumps — and then rolls back. It will hit the same constraint failures the real run
would, which is the point, but the id sequences it consumes are gone either way.

### Order matters

Rows reference each other by business key, and nothing is created out of thin air:

```
pitch_master  →  campaign_master  →  pitch_creator / campaign_creator
```

A `campaign_creator` row naming a `campaign_code` that isn't in the database yet is
skipped with an error. Upload the masters first.

---

## What gets a file rejected outright

Most bad rows are skipped individually and the rest of the batch proceeds. These
instead reject the **entire** upload, writing nothing — in `dry_run` and a real
ingest alike:

| Rejection | Why |
| --- | --- |
| A `category` value not in the `category` table | Ingest used to create these on demand, so one typo became a permanent facet. Add the term on the **Taxonomy** page first. |
| A `language` value not in the `language` table | Same. |
| A malformed `email` | A half-typed address in a contact database is worse than an empty one — it looks reachable and isn't. Give a real address, or leave the cell empty. |
| A `pitch_creator` row using the **v2** cost columns | The old `cost_with_deliverables` pair is no longer read, so the file would store zero for every cost. Re-export from the current sheet. |
| A `source_file_id` matching **two pitches** | Creator rows are routed to a pitch by its spreadsheet, so two pitches on one sheet cannot be told apart. Fix one pitch's link first. |
| A `pitch_master` row putting two pitches on one spreadsheet | The same ambiguity, refused where it is created. Note the `UNIQUE` constraint on `spreadsheet_link` does not catch it: it compares whole URLs, and `.../edit` vs `.../edit?gid=0` are two strings naming one sheet. |
| A `campaign_creator` record/model field mismatch | A schema drift guard. Means the code needs fixing, not the file. |

Every blocking problem in the file is reported in one response, so you fix them all
in one pass rather than one upload per mistake.

### Rows that are skipped, not rejected

- `profile_link` that yields no platform + handle (creator sources).
- `campaign_code` / `source_file_id` with no matching record in the database.
- A pitch or campaign whose code already exists — skipped as a duplicate. (Campaign
  *creator* links are the exception: re-ingesting **updates** them, because tracker
  numbers keep moving after a campaign goes live.)

### Values that are silently flattened

Unrecognised `org_type`, `requirement`, `platform`, `gender` and similar become
`NA`. Unparseable numbers become `0`, with a warning. The upload screen validates
against the same vocabularies before sending, so you see this before it happens.

---

## Fields the parser computes for you

Three fields are **not** taken from the file even when present:

### `tier` — derived from `followers`

The tier cell is read for one thing only: the word "celeb". Everything else is
computed, because the same creator was arriving as MICRO on one sheet and MID_TIER
on another with an identical follower count.

| Followers | Tier |
| --- | --- |
| missing, or `0` | `NA` |
| `1` – `19,999` | `nano` |
| `20,000` – `99,999` | `micro` |
| `100,000` – `249,999` | `mid-tier` |
| `250,000` – `999,999` | `macro` |
| `1,000,000` + | `mega` |
| tier cell contains "celeb" / "celebrity" | `celeb` — overrides the count |

### `platform` and `username` — derived from `profile_link`

Parsed out of the URL and lowercased. `(platform, username)` is the creator's
identity and is unique, so this is what decides whether a row creates a new creator
or attaches to an existing one. Instagram, YouTube, LinkedIn and Facebook profile
URLs are understood; a post or video URL has no handle in it and the row is skipped.

---

## Multi-value cells

`category`, `language` and `poc_name` split on `+ , / & | ;` — but deliberately
**not** on the word "and" (`Food and Beverage` is one category) and **not** on `-`
(`Cricket Fan- Mumbai Indians` is one too).

`NA`, `N/A`, `none`, `nil`, `-`, `--`, `null` and `tbd` all mean "empty".

An `email` cell holding several addresses keeps the first and warns about the rest.
If any one of them is malformed, the batch is rejected.

---

## `pitch_master`

One row per pitch. 10 fields, 9 required.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `pitch_code` | string | ✔ | Uppercased. A `-YYYY` suffix is appended from `year` if absent. |
| `year` | number | | Used only for the code suffix. Defaults to the current year. |
| `org_type` | string | ✔ | See vocabulary below. |
| `brand_name` | string | ✔ | Lowercased into the brand key; the original casing becomes the display name. Brands are created on demand. |
| `campaign_name` | string | ✔ | |
| `requirement` | string | ✔ | See vocabulary below. |
| `platform` | string | ✔ | May name two, e.g. `insta + yt`. |
| `sales_lead` | string | ✔ | |
| `list_lead` | string | ✔ | |
| `spreadsheet_link` | string | ✔ | Must be a URL. The Drive file id in it is what `pitch_creator` rows are matched against — so this has to be the real sheet link. |

**`org_type`** — `brand - core`, `brand - other`, `agency`, `retainer account`
**`requirement`** — `list`, `plan`, `list and plan`, `content buckets`, `media plan`, `production`, `content buckets and list`, `demographics/data`
**`platform`** — `instagram`, `yt`, `linkedin`, `facebook`, `others`, `insta + yt`, `insta + others`, `yt & linkedin`, `ig & linkedin`

```json
[
  {
    "pitch_code": "ACME-Q1",
    "year": 2026,
    "org_type": "brand - core",
    "brand_name": "Acme Foods",
    "campaign_name": "Monsoon Launch",
    "requirement": "list and plan",
    "platform": "insta + yt",
    "sales_lead": "Neha Raut",
    "list_lead": "Karan Bhatia",
    "spreadsheet_link": "https://docs.google.com/spreadsheets/d/1AbCdEf_GhIjKlMnOpQrStUvWxYz/edit"
  }
]
```

---

## `campaign_master`

One row per campaign. 16 fields, 12 required.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `campaign_code` | string | ✔ | Uppercased. The key `campaign_creator` rows join on. |
| `month_name` | string | ✔ | Lowercase English month. Unknown values **raise**, they don't flatten. |
| `year` | number | ✔ | |
| `brand_name` | string | ✔ | Created on demand, same as pitch_master. |
| `campaign_name` | string | ✔ | |
| `manager` | string | ✔ | |
| `member_names` | string[] | | Must be an array of strings, not a joined string. |
| `spreadsheet_link` | string | ✔ | URL. |
| `report_link` | string | ✔ | URL. |
| `status` | string | ✔ | `wip`, `completed`, `on hold`, `scrapped`. Blank defaults to `wip`. |
| `expected_end_date` | date | ✔ | |
| `start_date` | date | ✔ | |
| `end_date` | date | | |
| `report_status` | string | | Defaults to `wip`, or to `scrapped` when the campaign is. |
| `report_completion_date` | date | | |
| `pitch_code` | string | ✔ | Links to the pitch. An unmatched code inserts the campaign **unlinked**, with a warning. |

Dates accept `DD-MM-YYYY`, `YYYY-MM-DD`, `DD/MM/YYYY`, `YYYY/MM/DD`, `DD.MM.YYYY`
or full ISO. **The upload screen's pre-flight check is stricter** and asks for
`YYYY-MM-DD`.

```json
[
  {
    "campaign_code": "ACMEQ1LAUNCH",
    "month_name": "july",
    "year": 2026,
    "brand_name": "Acme Foods",
    "campaign_name": "Monsoon Launch",
    "manager": "Tanvi Shah",
    "member_names": ["Rohit Menon", "Sana Qureshi"],
    "spreadsheet_link": "https://docs.google.com/spreadsheets/d/1ZyXwVu_TsRqPoNmLkJiHg/edit",
    "report_link": "https://docs.google.com/spreadsheets/d/1ReportSheetIdHere/edit",
    "status": "completed",
    "expected_end_date": "2026-07-31",
    "start_date": "2026-07-01",
    "end_date": "2026-07-28",
    "report_status": "completed",
    "report_completion_date": "2026-08-05",
    "pitch_code": "ACME-Q1-2026"
  }
]
```

---

## `pitch_creator`

One row per creator per pitch. 32 fields, 4 required — everything else is coerced,
so a missing cost is `0` rather than an error.

Creates the creator if `(platform, username)` is new, links their categories and
languages, and writes the `PitchCreatorLink`. An existing `(creator, pitch)` pair is
skipped, never updated.

### Routing and identity

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `source_file_id` | string | ✔ | Drive file id of the pitch sheet. Matched against `pitch_master.spreadsheet_link`. No match ⇒ the row is skipped. |
| `sheet` | string | ✔ | Tab name. Falls back to deciding the platform when the URL doesn't. |
| `sheet_row` | any | | Row number, used in error messages. |
| `name` | string | ✔ | |
| `profile_link` | string | | No usable link ⇒ the row is skipped. Effectively required. |
| `platform` | string | ✔ | Only a fallback — the link decides. |

### Creator attributes

`followers`, `avg_views`, `city`, `gender`, `email`, `phone`, `category`,
`language`, `tier`.

- `tier` is **advisory** — see [computed fields](#fields-the-parser-computes-for-you).
- `category` / `language` must already exist in their tables, or the batch is rejected.
- `email` must be a valid address or empty, or the batch is rejected.
- `phone` is parsed as an Indian number and stored E.164.

### Deliverable counts

`reel_count`, `reel_story_count`, `video_story_count`, `static_carousel_count`,
`event_store_visit`, `short_form_videos_count`, `reshare_short_form_videos_count`,
`dedicated_video_count`, `integrated_video_count`.

`event_store_visit` is a yes/no cell — `yes`, `true`, `1`, `y` are true.

### Rights

`usage_rights`, `ad_promo_rights`, `boosting`, `payment_terms`.

### Costs

Split per deliverable, and **stored exactly as given**.

| Instagram | YouTube | Common |
| --- | --- | --- |
| `reel_cost` | `short_form_videos_cost` | `rights_cost` |
| `reel_story_cost` | `reshare_short_form_videos_cost` | `boosting_cost` |
| `video_story_cost` | `dedicated_video_cost` | `package_cost` |
| `static_carousel_cost` | `integrated_video_cost` | `final_cost`, `brand_cost` |

Nothing is cross-checked against anything else. `package_cost` and `final_cost` are
negotiated figures and legitimately differ from the sum of the deliverables — in the
example below the parts total ₹57,000 while the package is ₹1,00,000 and the final
₹1,80,000. All three are stored as-is.

> **Old exports are refused.** Earlier sheets sent two totals,
> `cost_with_deliverables` and `cost_with_deliverables_usage`, from which
> `package_cost` and `rights_cost` were derived. Those columns are no longer read.
> A file carrying them, with none of the split costs filled in, is rejected rather
> than silently written with zero in every cost column. A row where *both* old
> totals are blank is indistinguishable from a current row with no costs entered,
> so it passes — every cost is zero either way.

A creator listed twice in the same pitch keeps the row with the higher `final_cost`.

### Fields accepted and discarded

`source_url`, `template_version`, `extra`, `shortlisted`, `rl_poc`, `send_to_brand`,
`rl_remarks`, `additional_requirement` and `sheet_timestamp` are accepted without
complaint but not stored — `PitchCreatorLink` has no column for them. The upload
screen lists them under "ignored by the backend schema" so this is visible rather
than silent.

An Instagram row and a YouTube row, as the v3.5 sheet exports them. The keys each
platform doesn't use are simply absent, and default to `0`.

```json
[
  {
    "source_url": "https://docs.google.com/spreadsheets/d/1SFARPdjipGwPN2qTK51dlHeFohrlHR1rjr-qEHjKbCg/edit",
    "source_file_id": "1SFARPdjipGwPN2qTK51dlHeFohrlHR1rjr-qEHjKbCg",
    "template_version": "v3.5",
    "sheet": "Instagram",
    "platform": "instagram",
    "sheet_row": 3,
    "shortlisted": true,
    "name": "Reehal Baig",
    "profile_link": "https://www.instagram.com/reehalbaigofficial/",
    "followers": 97000,
    "category": "Lifestyle",
    "tier": "Macro",
    "language": "Kannada, Hindi, English",
    "gender": "Male",
    "avg_views": 200000,
    "city": "Bangalore",
    "email": "reehal.baig@gmail.com",
    "phone": 9880564598,
    "rl_poc": "Archi",

    "reel_count": 2,
    "reel_story_count": 1,
    "video_story_count": 8,
    "static_carousel_count": 1,

    "event_store_visit": "NO",
    "usage_rights": "30 days all content on insta",
    "ad_promo_rights": "3 Months",
    "boosting": "2 Days",
    "payment_terms": "Under 60 Days",

    "reel_cost": 45000,
    "reel_story_cost": 4500,
    "video_story_cost": 4500,
    "static_carousel_cost": 3000,
    "rights_cost": 10000,
    "boosting_cost": 2000,
    "package_cost": 100000,
    "final_cost": 180000,

    "send_to_brand": "YES",
    "brand_cost": 0,
    "rl_remarks": "Millennial",
    "additional_requirement": "",
    "sheet_timestamp": "2026-07-17T03:57:14.248Z"
  },
  {
    "source_url": "https://docs.google.com/spreadsheets/d/1PlSKsKkMiCdQzJgIzlxRdTLXJGDLuwpvwTpX99DL3GI/edit",
    "source_file_id": "1PlSKsKkMiCdQzJgIzlxRdTLXJGDLuwpvwTpX99DL3GI",
    "template_version": "v3.5",
    "sheet": "Youtube",
    "platform": "youtube",
    "sheet_row": 3,
    "shortlisted": false,
    "name": "Daljeet Kaur",
    "profile_link": "https://www.youtube.com/@glamocracy9333/featured",
    "followers": 1002,
    "category": "Beauty & Makeup",
    "tier": "Nano",
    "language": "English",
    "gender": "Female",
    "avg_views": 2000,
    "city": "Mumbai",
    "email": "daljeet.kaur@gmail.com",
    "phone": 9820491615,
    "rl_poc": "Shaista",

    "short_form_videos_count": 1,
    "reshare_short_form_videos_count": 0,
    "dedicated_video_count": 1,
    "integrated_video_count": 0,

    "usage_rights": "1 month",
    "ad_promo_rights": "15 days",
    "boosting": "3 Days",
    "payment_terms": "Under 15 Days",

    "short_form_videos_cost": 5000,
    "dedicated_video_cost": 15000,
    "integrated_video_cost": 8000,
    "rights_cost": 5000,
    "boosting_cost": 2000,
    "package_cost": 5000,
    "final_cost": 5000,

    "send_to_brand": "YES",
    "brand_cost": 0,
    "rl_remarks": "",
    "additional_requirement": "",
    "sheet_timestamp": "2026-07-10T14:18:26.002Z"
  }
]
```

Note `tier` reads `"Macro"` on the first row while the follower count puts it in
`micro`. The sheet value is ignored — see [computed fields](#fields-the-parser-computes-for-you).

---

## `campaign_creator`

One row per creator per campaign. 66 fields, 1 required. Carries both the campaign
status data and the post-live tracker numbers.

**Re-ingesting a campaign updates its existing links** rather than skipping them,
because tracker numbers keep moving after a campaign goes live and the newest export
is the truth. Creator rows themselves are left alone once they exist — a
hand-corrected city won't be overwritten by a campaign sheet.

### Routing and identity

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `campaign_code` | string | ✔ | Must already exist. No match ⇒ the row is skipped. |
| `profile_link` | string | | No usable link ⇒ the row is skipped. Effectively required. |
| `name` | string | | |
| `source_file_id`, `sheet`, `sheet_row` | any | | Present on Apps Script exports, absent on hand-made uploads. |

### Creator attributes

`followers`, `tier`, `category`, `language`, `city`, `gender`, `email`, `phone` —
same rules as `pitch_creator`. Campaign sheets carry no `avg_views`.

### Status and commercials

`is_dropped`, `expected_views`, `poc_name`, `deliverables_raw`, `payment_terms`,
`initial_cost`, `final_cost`, `brand_cost`, `agency_fee`, `product_cost`,
`shipping_cost`, `promotion_cost`, `reimbursement_cost`, `additional_cost`,
`product_status`, `product_ordered_by`, `script_links`, `shoot_date`,
`content_status`, `live_date`, `live_links`.

`is_dropped` accepts a boolean, a yes/no cell, or the literal word `dropped`. A
non-dropped row with no `live_date` gets a warning.

### Instagram tracker

`ig_reel_views`, `ig_reel_likes`, `ig_reel_comments`, `ig_reel_shares`,
`ig_reel_saves`, `ig_story_views`, `ig_reel_reach`, `ig_story_reach`,
`ig_reels_ir_perc`, `ig_reels_er_perc`, `cpv`, `ig_avg_watch_time`,
`ig_total_watch_time`, `ig_skip_rate_content`, `ig_followers_view_perc`,
`ig_non_followers_view_perc`, `ig_male_perc`, `ig_female_perc`,
`ig_age_13_17_perc`, `ig_age_18_24_perc`, `ig_age_25_34_perc`,
`ig_age_35_44_perc`, `ig_age_45_54_perc`, `ig_age_55_64_perc`,
`ig_age_over_65_perc`.

### YouTube tracker

`yt_views`, `yt_likes`, `yt_comments`, `yt_er_perc`, `yt_total_impressions`,
`yt_total_watch_time`.

### Tracker value formats

- **`*_perc`** — a number, with or without a `%`. Stored to 2dp. Anything over 100
  is stored as given but warns, because it usually means a broken sheet formula.
- **`*_watch_time`** — `HH:MM:SS`, `MM:SS`, or a bare number of **seconds**.
- **Money** — a plain number. `₹` and thousands separators are stripped.

A creator listed twice in the same campaign keeps the row with the higher
`final_cost` — that's the one Accounts paid against.

```json
[
  {
    "campaign_code": "ACMEQ1LAUNCH",
    "sheet_row": 4,
    "name": "Sneha Pillai",
    "profile_link": "https://www.instagram.com/snehapillai/",
    "followers": 148000,
    "category": "Food, Lifestyle",
    "language": "Hindi & English",
    "city": "Mumbai",
    "gender": "female",
    "email": "sneha@example.com",
    "phone": "9876543210",
    "poc_name": "Rohit Menon",
    "is_dropped": false,
    "deliverables_raw": "2 Reels + 1 Story",
    "payment_terms": "50-50",
    "expected_views": 60000,
    "initial_cost": 120000,
    "final_cost": 145000,
    "brand_cost": 175000,
    "agency_fee": 30000,
    "product_status": "delivered",
    "product_ordered_by": "Acme",
    "product_cost": 2500,
    "shipping_cost": 300,
    "shoot_date": "2026-07-08",
    "content_status": "approved",
    "live_date": "2026-07-14",
    "live_links": "https://www.instagram.com/reel/AbCdEfGhIjK/",
    "ig_reel_views": 214000,
    "ig_reel_likes": 18400,
    "ig_reel_comments": 640,
    "ig_reel_shares": 2100,
    "ig_reel_saves": 3300,
    "ig_reel_reach": 189000,
    "ig_story_views": 41000,
    "ig_avg_watch_time": "00:11",
    "ig_total_watch_time": "652:20:00",
    "ig_reels_er_perc": 10.5,
    "ig_male_perc": 38.2,
    "ig_female_perc": 61.8,
    "cpv": 0.68
  }
]
```

---

## Checking a file before you upload

The upload screen validates client-side first — required fields, types, unknown
keys, email format, and any value the parser would flatten to `NA`. Nothing is sent
until that passes.

For a command-line check of the two master formats:

```bash
python backend/scripts/check_ingest_json.py path/to/export.json pitch
```
