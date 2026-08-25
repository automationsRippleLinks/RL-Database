import asyncio, os, sys

os.environ.setdefault("DB_URL", "postgresql+asyncpg://rl@127.0.0.1:5433/rltest")
sys.path.insert(0, "/home/claude/repo/backend")
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models import (
    Creator,
    Category,
    Language,
    CategoryCreatorLink,
    LanguageCreatorLink,
)
from app.models.enums import PlatformChoices, TierChoices
from app.schemas.search import CreatorSearchRequest
import types, importlib.util

_pkg = types.ModuleType("app.api.v1")
_pkg.__path__ = ["/home/claude/repo/backend/app/api/v1"]
sys.modules["app.api.v1"] = _pkg
_spec = importlib.util.spec_from_file_location(
    "app.api.v1.search", "/home/claude/repo/backend/app/api/v1/search.py"
)
S = importlib.util.module_from_spec(_spec)
sys.modules["app.api.v1.search"] = S
_spec.loader.exec_module(S)
DB = "postgresql+asyncpg://rl@127.0.0.1:5433/rltest"

CREATORS = [
    # (username, name, city, cats, langs, raw_cats)
    ("autoguy", "Auto Guy", "Patna", ["auto"], ["hindi"], "Auto"),
    ("bikerguy", "Biker Guy", "Patna", ["biker"], ["hindi"], "Biker"),
    ("mobilegal", "Mobile Gal", "Mumbai", ["automobile"], ["english"], "Automobile"),
    (
        "cricketmi",
        "Cricket MI",
        "Mumbai",
        ["cricket fan"],
        ["hindi", "english"],
        "Cricket Fan- Mumbai Indians",
    ),
    ("fanboy", "Fan Boy", "Delhi", ["fashion"], ["english"], "Fashion"),
    (
        "multi",
        "Multi Tag",
        "Pune",
        ["auto", "biker", "cricket fan"],
        ["hindi"],
        "Auto, Biker, Cricket Fan",
    ),
    ("notags", "No Tags", "Kochi", [], [], "Auto, Biker"),  # raw only
]


async def run(F, **kw):
    async with F() as s:
        return await S.search_creators(CreatorSearchRequest(**kw), s, None)


async def main():
    engine = create_async_engine(DB)
    async with engine.begin() as c:
        await c.run_sync(SQLModel.metadata.drop_all)
        await c.run_sync(SQLModel.metadata.create_all)
    F = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with F() as s:
        cmap, lmap = {}, {}
        for u, n, city, cats, langs, raw in CREATORS:
            for c in cats:
                if c not in cmap:
                    o = Category(name=c)
                    s.add(o)
                    await s.flush()
                    cmap[c] = o.id
            for l in langs:
                if l not in lmap:
                    o = Language(name=l)
                    s.add(o)
                    await s.flush()
                    lmap[l] = o.id
        for u, n, city, cats, langs, raw in CREATORS:
            cr = Creator(
                platform=PlatformChoices.INSTAGRAM,
                username=u,
                name=n,
                city=city,
                tier=TierChoices.MICRO,
                followers=10000,
                categories_raw=raw,
                gender="Male",
                languages_raw=", ".join(x.title() for x in langs),
            )
            s.add(cr)
            await s.flush()
            for c in cats:
                s.add(CategoryCreatorLink(creator_id=cr.id, category_id=cmap[c]))
            for l in langs:
                s.add(LanguageCreatorLink(creator_id=cr.id, language_id=lmap[l]))
        await s.commit()

    def names(r):
        return sorted(x.username for x in r.rows)

    print("=== filter categories=['auto'] ===")
    r = await run(F, categories=["auto"])
    print(f"  total={r.total} -> {names(r)}")
    print(
        "  OLD behaviour would also return: mobilegal (Automobile), notags (raw 'Auto, Biker')"
    )

    print("\n=== filter categories=['auto','biker']  (OR within facet) ===")
    r = await run(F, categories=["auto", "biker"])
    print(f"  total={r.total} -> {names(r)}")

    print("\n=== filter categories=['cricket fan'] ===")
    r = await run(F, categories=["cricket fan"])
    print(f"  total={r.total} -> {names(r)}")

    print("\n=== filter categories + languages (AND across facets) ===")
    r = await run(F, categories=["cricket fan"], languages=["english"])
    print(f"  total={r.total} -> {names(r)}")

    print("\n=== case-insensitive: categories=['AUTO'] ===")
    r = await run(F, categories=["AUTO"])
    print(f"  total={r.total} -> {names(r)}")

    print("\n=== multi-tag creator counted ONCE (no join fanout) ===")
    r = await run(F, categories=["auto", "biker", "cricket fan"])
    print(f"  total={r.total} -> {names(r)}  (multi appears once)")

    print("\n=== free text 'biker' -> matches via tag, not raw ===")
    r = await run(F, text="biker")
    print(f"  total={r.total} -> {names(r)}")

    print("\n=== free text 'auto patna' (AND across tokens) ===")
    r = await run(F, text="auto patna")
    print(f"  total={r.total} -> {names(r)}")

    print("\n=== rows carry resolved tags ===")
    r = await run(F, categories=["auto"])
    for row in r.rows:
        print(
            f"  {row.username}: categories={row.categories} languages={row.languages} "
            f"raw={row.categories_raw!r}"
        )

    print("\n=== facets (frequency ordered) ===")
    async with F() as s:

        async def produce_capture():
            return await S.facets_creators.__wrapped__(s, None, None) if False else None

    # call the inner producer directly by re-implementing the cached call
    from app.core.cache import cache_key

    async with F() as s:

        class FakeRedis:
            async def get(self, *a, **k):
                return None

            async def set(self, *a, **k):
                return None

            async def setex(self, *a, **k):
                return None

        res = await S.facets_creators(s, FakeRedis(), None)
        print("  categories:", res["categories"])
        print("  languages:", res["languages"])
        print("  total_creators:", res["total_creators"])
    await engine.dispose()


asyncio.run(main())
