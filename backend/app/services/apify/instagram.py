from typing import Optional
from datetime import datetime, UTC

from redis.asyncio import Redis
from sqlmodel import select, col

from app.core.db import SessionFactory
from app.models.creator import Creator
from app.models.link_models import CategoryCreatorLink
from app.models.enums import PlatformChoices, TierChoices
from app.schemas.ingest import RowError
from app.services.ingest import cells
from app.services.ingest.common import load_taxonomy, link_taxonomy
from app.services.ingest.creators import taxonomy_list, tier_for
from app.services.ai import AISpec, judge

BIO_AI = AISpec(
    name="bio",
    instructions="""Each row is an Instagram creator's bio and the business \
        category Instagram shows for them.
        - city / state: only when the bio clearly says where they are based (a city \
            name, a pin emoji with a place). Standard English spelling ("Bengaluru").
        - categories: the allowed categories that describe what the creator posts \
        about, judging from the bio and business category. Empty when unclear.""",
    covers={},
    fields=lambda tax: {
        "city": (Optional[str], ...),
        "state": (Optional[str], ...),
        "categories": (taxonomy_list(tax.categories), ...),
    },
)


def _avg_views(item: dict) -> Optional[int]:
    views = [
        p.get("videoPlayCount") or p.get("videoViewCount")
        for p in item.get("latestPosts") or []
        if p.get("type") == "Video"
    ]
    views = [v for v in views if v]
    return round(sum(views) / len(views)) if views else None


async def handle(
    sf: SessionFactory, redis: Redis, items: list[dict]
) -> tuple[int, list[RowError], str]:
    errors: list[RowError] = []
    scraped: dict[str, dict] = {}
    for i, item in enumerate(items, start=1):
        username = (item.get("username") or "").lower()
        if item.get("error") or not username:
            errors.append(
                RowError(
                    row=i,
                    field=username or item.get("url"),
                    message=item.get("errorDescription")
                    or item.get("error")
                    or "no username in result",
                )
            )
            continue
        scraped[username] = item

    now = datetime.now(UTC)
    async with sf() as session:
        creators: list[Creator] = []
        names = sorted(scraped)
        for i in range(0, len(names), 1000):
            creators += (
                await session.exec(
                    select(Creator).where(
                        Creator.platform == PlatformChoices.INSTAGRAM,
                        col(Creator.username).in_(names[i : i + 1000]),
                    )
                )
            ).all()
        for missing in sorted(set(scraped) - {c.username for c in creators}):
            errors.append(
                RowError(
                    field=missing, message="scraped, but not in the database; skipped"
                )
            )

        for c in creators:
            item = scraped[c.username]
            if item.get("followersCount") is not None:
                c.followers = item["followersCount"]
                if c.tier != TierChoices.CELEB:
                    c.tier = tier_for(c.followers)
            c.avg_views = _avg_views(item) or c.avg_views
            c.bio = item.get("biography") or c.bio
            c.stats_refreshed_at = now
            bio = " ".join(
                filter(
                    None,
                    [
                        item.get("biography"),
                        item.get("businessEmail"),
                        item.get("businessPhoneNumber"),
                    ],
                )
            )
            c.emails = c.emails + [e for e in cells.emails(bio, strict=False) if e not in c.emails]
            c.phones = c.phones + [e for e in cells.phones(bio, strict=False) if e not in c.phones]

        ids = [c.id for c in creators]
        has_category = set(
            (
                await session.exec(
                    select(CategoryCreatorLink.creator_id).where(
                        col(CategoryCreatorLink.creator_id).in_(ids)
                    )
                )
            ).all()
        ) if ids else set()
        gaps = {c.username: c for c in creators if c.bio and (not c.city or c.id not in has_category)}
        filled = 0
        if gaps:
            taxonomy = await load_taxonomy(session)
            order = sorted(gaps)
            inputs = {
                n: {"bio": gaps[u].bio, "business_category": scraped[u].get("businessCategoryName") or ""}
                for n, u in enumerate(order, start=1)
            }
            result = await judge(BIO_AI, inputs, taxonomy, redis)
            errors += result.errors
            pairs = []
            for n, u in enumerate(order, start=1):
                out, c = result.outputs.get(n), gaps[u]
                if not out:
                    continue
                if not c.city and out["city"]:
                    c.city, c.state, filled = out["city"], out["state"] or c.state, filled + 1
                if c.id not in has_category:
                    pairs += [(c.id, taxonomy.categories[name]) for name in out["categories"]]
            filled += await link_taxonomy(session, CategoryCreatorLink, "category_id", pairs)
        await session.commit()
    return len(creators), errors, (
        f"{len(creators)} creators refreshed from {len(items)} results; "
        f"{filled} gaps filled from bios; {len(errors)} problems."
    )