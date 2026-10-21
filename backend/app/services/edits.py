"""Editing rows by hand: locks, version checks, validation and history

Every save goes through `save()`, in this order:

    someone else holds the edit lock            ->  423     {"code": "locked", "holder": ...}
    the row doesn't exist                       ->  404
    the row changed since the form loaded it    ->  409     {"code": "stale", "last_edit": ...}
    the merged row fails the model's checks     ->  422     (same shape as the FastAPI's own 422s)
    a unique / foreign key / check constraint   ->  409 duplicate / 422
    otherwise: write, bump the version, add one edit_log row, clear the search caches

Deletes are refused while anything still points at the row (409 "in_use"),
like taxonomy terms. What a row owns -- a pitch's creator rows, a creator's
category, language, tag and brand links -- goes with it.
"""

import logging
from typing import Callable, Optional, Any, Awaitable
from dataclasses import dataclass
import re

from fastapi import HTTPException, status
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from pydantic_core import to_jsonable_python
from sqlmodel import select, col, func, delete
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.exc import IntegrityError
from redis.asyncio import Redis

from app.core.config import settings
from app.core.cache import invalidate
from app.models import (
    User,
    EditLog,
    Creator,
    Category,
    CategoryCreatorLink,
    Language,
    LanguageCreatorLink,
    Brand,
    BrandCreatorLink,
    Tag,
    TagCreatorLink,
    Pitch,
    PitchCreatorLink,
    Campaign,
    CampaignCreatorLink,
    Company,
)
from app.models.enums import TierChoices
from app.services import locks
from app.services.ingest.creators import tier_for
from app.schemas import edits as s

log = logging.getLogger(__name__)

# (model, fk column, (singular, plural)) -- rows that stop a delete
Blocker = tuple[type, str, tuple[str, str]]

# builds the DELETE for something the row owns, given its primary key
Child = Callable[[tuple], Any]


@dataclass(frozen=True)
class Kind:
    """One editable kind of record and its rules; the instances are in KINDS below."""

    name: str  # "creator", "pitch_creator" -- also the lock and history key
    label: str  # for messages: "creator", "creator row"
    model: type
    keys: tuple[str, ...]  # primary key columns, in URL order
    update: type[BaseModel]
    blockers: tuple[Blocker, ...] = ()
    children: tuple[Child, ...] = ()

    # extra fields for the form (a creator's categories, tags, ...)
    extras: Optional[Callable[[AsyncSession, Any], Awaitable[dict]]] = None

    # non-column fields of the PATCH body, applied after the columns
    apply_extras: Optional[Callable[[AsyncSession, Any, dict], Awaitable[dict]]] = None
    hint: str = ""  # added to the "in use" message

    # fields worked out from others (a creator's tier from followers)
    derived: tuple[Callable[[Any, dict, dict], dict], ...] = ()

    def record_id(self, pk: tuple) -> str:
        """The key as one string for locks and history: "12", or "7/<creator id>"."""
        return "/".join(str(v) for v in pk)


# === small helpers ==========================================================


def _json(value: Any) -> Any:
    """Make a value JSON-safe (UUIDs, dates, enums) for edit_log and responses."""
    return to_jsonable_python(value)


def _change(old: Any, new: Any) -> dict:
    """One field's entry in an edit_log row."""
    return {"from": _json(old), "to": _json(new)}


def _http(code: int, error: str, message: str, **extra) -> HTTPException:
    """An error whose detail is {"code", "message", ...extra} for the edit form."""
    return HTTPException(
        status_code=code, detail={"code": error, "message": message, **extra}
    )


def _where(kind: Kind, pk: tuple):
    """WHERE conditions matching one row by its (possibly two-column) key."""
    return [getattr(kind.model, k) == v for k, v in zip(kind.keys, pk)]


async def _load(session: AsyncSession, kind: Kind, pk: tuple, lock_row: bool = False):
    """The row, fresh from the database, or 404. `lock_row` adds FOR UPDATE."""
    stmnt = (
        select(kind.model).where(*_where(kind, pk))
        # overwrite a copy already in the session, so the version is the current one
        .execution_options(populate_existing=True)
    )
    if lock_row:
        stmnt = stmnt.with_for_update()
    row = (await session.exec(stmnt)).first()
    if row is None:
        raise _http(status.HTTP_404_NOT_FOUND, "not_found", f"No such {kind.label}")
    return row


async def _check_lock(redis: Redis, user: User, kind: Kind, rid: str) -> None:
    """423 if someone else holds the edit lock. No lock at all is fine."""
    held = await locks.holder(redis, kind.name, rid)
    if held is not None and held.user_id != user.id:
        raise _locked(kind, held)


def _locked(kind: Kind, held: locks.LockHolder) -> HTTPException:
    """the 423 that tells the form who is editing the record."""
    return _http(
        status.HTTP_423_LOCKED,
        "locked",
        f"{held.name} is editing this {kind.label}. Try again when they're done.",
        holder=held.model_dump(mode="json"),
    )


def _entry(row: EditLog) -> s.HistoryEntry:
    """An edit_log row as the history API returns it."""
    return s.HistoryEntry.model_validate(row, from_attributes=True)


async def _last_edit(
    session: AsyncSession, kind: Kind, rid: str
) -> Optional[s.HistoryEntry]:
    """The record's latest edit_log entry, to say who changed it under a stale form."""
    row = (
        await session.exec(
            select(EditLog)
            .where(EditLog.kind == kind.name, EditLog.record_id == rid)
            .order_by(col(EditLog.id).desc())
            .limit(1)
        )
    ).first()
    return _entry(row) if row else None


def _validated(model: type, values: dict):
    """Run the table model's own validators over the merged row; 422 on failure."""
    try:
        return model.model_validate(values)
    except ValidationError as e:
        print(e)
        raise RequestValidationError(
            [
                {**err, "loc": ("body", *err["loc"])}
                for err in e.errors(include_url=False)
            ]
        )


_KEY = re.compile(r"Key \((?P<cols>[^)]*)\)=\((?P<vals>.*)\)")


def _constraint_error(kind: Kind, e: IntegrityError) -> HTTPException:
    """Turn a database constraint error into a message the form can show.

    unique          409 "duplicate", naming the column and value
    foreign key     422 "unknown_reference"
    anything else   422 "invalid", naming the constraint

    Column and value come from Postgres' "key (col)=(val)" detail text.
    """
    cause = getattr(e.orig, "__cause__", None)
    state = getattr(cause, "sqlstate", None) or getattr(e.orig, "sqlstate", None)
    m = _KEY.search(getattr(cause, "detail", None) or "")
    column, value = (m["cols"], m["vals"]) if m else ("value", "")
    if state == "23505":  # unique
        return _http(
            status.HTTP_409_CONFLICT,
            "duplicate",
            f"Another {kind.label} already has {column} {value!r}",
            field=column,
        )
    if state == "23503":  # foreign key
        return _http(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "unknown_reference",
            f"{column} {value} doesn't exist",
            field=column,
        )
    constraint = getattr(cause, "constraint_name", None) or "a database rule"
    return _http(
        status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid", f"Rejected by {constraint}"
    )


async def _invalidate(redis: Redis) -> None:
    """Drop cached search results, facets and suggestions so the edit shows up."""
    await invalidate(
        redis,
        settings.SEARCH_CACHE_PREFIX,
        settings.FACETS_CACHE_PREFIX,
        settings.SUGGEST_CACHE_PREFIX,
    )


def _log(user: User, kind: Kind, rid: str, action: str, changes: dict) -> EditLog:
    """A new edit_log row; the user's name is copied so history survives renames."""
    return EditLog(
        kind=kind.name,
        record_id=rid,
        action=action,
        changes=changes,
        user_id=user.id,
        user_name=user.name,
    )


async def _commit(session: AsyncSession, kind: Kind) -> None:
    """Commit; on a constraint error roll back and raise it as a 409 / 422."""
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise _constraint_error(kind, e)


# === reading ==================================================================================


async def record(session: AsyncSession, kind: Kind, row) -> s.EditRecord:
    """The row as the edit form gets it: its columns plus the kind's extras.
    
    The version is sent separately, for the form to send back on save.
    """
    data = row.model_dump(exclude={"version"})
    if kind.extras:
        data |= await kind.extras(session, row)
    pk = tuple(getattr(row, k) for k in kind.keys)
    return s.EditRecord(
        kind=kind.name, id=kind.record_id(pk), version=row.version, data=_json(data)
    )


async def history(
    session: AsyncSession,
    kind: Optional[str] = None,
    record_id: Optional[str] = None,
    user_id: Optional[int] = None,
    before: Optional[int] = None,
    limit: int = 50,
) -> list[s.HistoryEntry]:
    """Newest first. Page back with `before` = the last id you got."""
    stmnt = select(EditLog).order_by(col(EditLog.id).desc()).limit(limit)
    if kind:
        stmnt = stmnt.where(EditLog.kind == kind)
    if record_id:
        stmnt = stmnt.where(EditLog.record_id == record_id)
    if user_id:
        stmnt = stmnt.where(EditLog.user_id == user_id)
    if before:
        stmnt = stmnt.where(col(EditLog.id) < before)
    return [_entry(r) for r in (await session.exec(stmnt)).all()]


# === the edit form's lifecycle =========================================================================


async def open_form(
    session: AsyncSession, redis: Redis, user: User, kind: Kind, pk: tuple
) -> s.EditSession:
    """Claim (or renew) the lock and return the row to fill the form with."""
    row = await _load(session, kind, pk)
    rid = kind.record_id(pk)
    ok, held = await locks.acquire(redis, kind.name, rid, user.id, user.name)
    if not ok:
        raise _locked(kind, held)
    return s.EditSession(lock=held, record=await record(session, kind, row))


async def close_form(
    redis: Redis, user: User, kind: Kind, pk: tuple, force: bool = False
) -> None:
    """Release the edit lock; 403 if it is someonw else's and `force` isn't set.
    
    The route only lets admins pass `force`.
    """
    if not await locks.release(
        redis, kind.name, kind.record_id(pk), user.id, force=force
    ):
        raise _http(
            status.HTTP_403_FORBIDDEN,
            "not_yours",
            "Someone else holds this lock; only an admin can clear it",
        )


async def save(
    session: AsyncSession,
    redis: Redis,
    user: User,
    kind: Kind,
    pk: tuple,
    body: BaseModel,
) -> s.EditRecord:
    """Apply a PATCH, checked in the order listed at the top of this file.
    
    Only fields present in the body change; a missing `version` skips the stale
    check. A save that changes nothing writes no version and no history. Returns
    the record as saved.
    """
    rid = kind.record_id(pk)
    await _check_lock(redis, user, kind, rid)
    row = await _load(session, kind, pk, lock_row=True)  # held until commit
    print(row)

    if body.version is not None and body.version != row.version:
        last = await _last_edit(session, kind, rid)
        who = f" by {last.user_name}" if last else ""
        raise _http(
            status.HTTP_409_CONFLICT,
            "stale",
            f"This {kind.label} was changed{who} after you opened it. Reload to see the changes, then redo yours.",
            current_version=row.version,
            last_edit=last.model_dump(mode="json") if last else None,
        )

    # top-level fields that were sent; nested models keep their defaults
    sent = {
        k: v
        for k, v in body.model_dump(exclude={"version"}).items()
        if k in body.model_fields_set
    }
    columns = {k: v for k, v in sent.items() if k in kind.model.model_fields}
    extras = {k: v for k, v in sent.items() if k not in columns}

    before = row.model_dump()
    merged = _validated(kind.model, before | columns)

    # Set the next version up front: the link queries below can flush
    # the row early, and the version listener must see it already bumped.
    row.version = before["version"] + 1
    changes = {}
    for f in columns:
        new = getattr(merged, f)
        if new != before[f]:
            setattr(row, f, new)
            changes[f] = _change(before[f], new)
    for derive in kind.derived:
        changes |= derive(row, before, columns)
    if extras and kind.apply_extras:
        changes |= await kind.apply_extras(session, row, extras)

    if not changes:  # nothing actually different: no new version, no history line
        await session.rollback()
        return await record(session, kind, await _load(session, kind, pk))

    session.add(row)
    session.add(_log(user, kind, rid, "update", changes))
    await _commit(session, kind)
    await _invalidate(redis)
    log.info("%s %s edited by user %s: %s", kind.name, rid, user.id, ", ".join(changes))
    return await record(session, kind, await _load(session, kind, pk))


async def remove(
    session: AsyncSession, redis: Redis, user: User, kind: Kind, pk: tuple
) -> None:
    """Delete the row and what it owns; 409 "in_use" while anything points at it.
    
    History keeps a full snapshot of the deleted row, and any edit lock is cleared.
    """
    rid = kind.record_id(pk)
    await _check_lock(redis, user, kind, rid)
    row = await _load(session, kind, pk, lock_row=True)

    in_use = []
    for model, fk, label in kind.blockers:
        n = (
            await session.exec(
                select(func.count())
                .select_from(model)
                .where(getattr(model, fk) == pk[0])
            )
        ).one()
        if n:
            in_use.append(f"{n} {label[n != 1]}") # True picks the plural.

    if in_use:
        raise _http(
            status.HTTP_409_CONFLICT,
            "in_use",
            f"This {kind.label} is still used by {' and '.join(in_use)}. Remove it from those first{kind.hint}.",
        )

    snapshot = {k: _change(v, None) for k, v in row.model_dump().items()}
    for child in kind.children:
        await session.exec(child(pk))

    # plain DELETE: the ORM would try to load every relationship first to null it out
    await session.exec(delete(kind.model).where(*_where(kind, pk)))
    session.add(_log(user, kind, rid, "delete", snapshot))
    await _commit(session, kind)
    await locks.release(redis, kind.name, rid, user.id, force=True)
    await _invalidate(redis)
    log.info("%s %s deleted by user %s", kind.name, rid, user.id)


async def add_link(
    session: AsyncSession,
    redis: Redis,
    user: User,
    kind: Kind,
    parent: type,
    parent_id: Any,
    body: BaseModel,
) -> s.EditRecord:
    """Put an existing creator on a pitch or campaign."""
    parent_key, creator_key = kind.keys
    if await session.get(parent, parent_id) is None:
        raise _http(
            status.HTTP_404_NOT_FOUND, "not_found", f"No such {parent.__name__.lower()}"
        )
    if await session.get(Creator, body.creator_id) is None:
        raise _http(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "unknown_reference",
            "No such creator",
        )
    pk = (parent_id, body.creator_id)
    if (
        await session.exec(select(kind.model).where(*_where(kind, pk)))
    ).first() is not None:
        raise _http(
            status.HTTP_409_CONFLICT,
            "duplicate",
            f"This creator is already on this {parent.__name__.lower()}",
        )

    values = body.model_dump(exclude={"version", "creator_id"})
    row = _validated(
        kind.model, values | {parent_key: parent_id, creator_key: body.creator_id}
    )
    session.add(row)
    sent = body.model_dump(exclude_unset=True, exclude={"version", "creator_id"})
    session.add(
        _log(
            user,
            kind,
            kind.record_id(pk),
            "create",
            {k: _change(None, v) for k, v in sent.items()},
        )
    )
    await _commit(session, kind)
    await _invalidate(redis)
    return await record(session, kind, await _load(session, kind, pk))


# === creator specifics ====================================================================================


def _retier(row: Creator, before: dict, sent: dict) -> dict:
    """A new follower count moves the tier, unless the tier was set by hand or is celeb."""
    if "followers" in sent and "tier" not in sent and row.tier != TierChoices.CELEB:
        tier = tier_for(row.followers or 0)
        if tier != row.tier:
            row.tier = tier
            return {"tier": _change(before["tier"], tier)}
    return {}


# field -> (term model, link model, link fk, display column)
_TERMS = {
    "categories": (Category, CategoryCreatorLink, "category_id", "name"),
    "languages": (Language, LanguageCreatorLink, "language_id", "name"),
    "brands": (Brand, BrandCreatorLink, "brand_id", "display_name"),
    "tags": (Tag, TagCreatorLink, "tag_id", "name"),
}

async def _linked(session: AsyncSession, field: str, creator_id) -> dict[int, str]:
    """The creator's current terms for `field` (a _TERMS key), as {id: name}."""
    term, link, fk, label = _TERMS[field]
    rows = await session.exec(
        select(term.id, getattr(term, label))
        .join(link, getattr(link, fk) == term.id)
        .where(link.creator_id == creator_id)
    )
    return dict(rows.all())


async def _creator_extras(session: AsyncSession, c: Creator) -> dict:
    """A creator's form extras: category, language and brand ids and  tag names.
    
    Tags go by name because a save may create new ones; the rest are picked by id.
    """
    out = {}
    for field in ("categories", "languages", "brands"):
        out[field] = sorted(await _linked(session, field, c.id))
    out["tags"] = sorted((await _linked(session, "tags", c.id)).values(), key=str.lower)
    return out


async def _tag_ids(session: AsyncSession, names: list[str]) -> dict[int, str]:
    """Tag names -> {id: name}, creating any tag that doesn't exist yet.
    
    Whitespace is collapsed and names match case-insensitively, so "Food Blog"
    finds an existing "food blog" and keeps that spelling.
    """
    wanted = {}
    for n in names:
        n = " ".join(n.split())
        if n:
            wanted.setdefault(n.lower(), n)
    if not wanted:
        return {}
    found = {
        name.lower(): (i, name)
        for i, name in (
            await session.exec(
                select(Tag.id, Tag.name).where(
                    func.lower(col(Tag.name)).in_(list(wanted))
                )
            )
        ).all()
    }
    for key, name in wanted.items():
        if key not in found:
            tag = Tag(name=name)
            session.add(tag)
            await session.flush() # to get its id
            found[key] = (tag.id, name)
    return {i: name for i, name in found.values()}


async def _apply_creator_extras(
    session: AsyncSession, c: Creator, extras: dict
) -> dict:
    """Apply a creator's PATCHed extras; returns the history changes.
    
    Each term list sent replaces the creator's links (unknown ids are 422).
    """
    changes = {}
    for field in ("categories", "languages", "brands", "tags"):
        if field not in extras:
            continue
        term, link, fk, label = _TERMS[field]
        now = await _linked(session, field, c.id)
        if field == "tags":
            want = await _tag_ids(session, extras[field])
        else:
            ids = sorted(set(extras[field]))
            want = (
                dict(
                    (
                        await session.exec(
                            select(term.id, getattr(term, label)).where(
                                col(term.id).in_(ids)
                            )
                        )
                    ).all()
                )
                if ids
                else {}
            )
            missing = [i for i in ids if i not in want]
            if missing:
                raise RequestValidationError(
                    [
                        {
                            "loc": ("body", field),
                            "msg": f"No {field} with id {missing}",
                            "type": "unknown_reference",
                        }
                    ]
                )
        if set(want) == set(now):
            continue
        gone, new = set(now) - set(want), set(want) - set(now)
        if gone:
            await session.exec(
                delete(link).where(
                    link.creator_id == c.id, col(getattr(link, fk)).in_(gone)
                )
            )
        for term_id in new:
            session.add(link(creator_id=c.id, **{fk: term_id}))
        changes[field] = _change(sorted(now.values()), sorted(want.values()))

    return changes


# === the registry ================================================================================

CREATOR = Kind(
    "creator",
    "creator",
    Creator,
    ("id",),
    s.CreatorUpdate,
    blockers=(
        (PitchCreatorLink, "creator_id", ("pitch", "pitches")),
        (CampaignCreatorLink, "creator_id", ("campaign", "campaigns")),
    ),
    children=(
        *(
            (lambda link: lambda pk: delete(link).where(link.creator_id == pk[0]))(link)
            for link in (
                CategoryCreatorLink,
                LanguageCreatorLink,
                TagCreatorLink,
                BrandCreatorLink,
            )
        ),
    ),
    extras=_creator_extras,
    apply_extras=_apply_creator_extras,
    derived=(_retier,),
    hint=", or mark the creator inactive instead",
)

BRAND = Kind(
    "brand",
    "brand",
    Brand,
    ("id",),
    s.BrandUpdate,
    blockers=(
        (Pitch, "brand_id", ("pitch", "pitches")),
        (Campaign, "brand_id", ("campaign", "campaigns")),
        (BrandCreatorLink, "brand_id", ("creator", "creators")),
    ),
)

COMPANY = Kind(
    "company",
    "company",
    Company,
    ("id",),
    s.CompanyUpdate,
    blockers=((Brand, "company_id", ("brand", "brands")),),
)

PITCH = Kind(
    "pitch",
    "pitch",
    Pitch,
    ("id",),
    s.PitchUpdate,
    blockers=((Campaign, "pitch_id", ("campaign", "campaigns")),),
    children=(
        lambda pk: delete(PitchCreatorLink).where(PitchCreatorLink.pitch_id == pk[0]),
    ),
)

CAMPAIGN = Kind(
    "campaign",
    "campaign",
    Campaign,
    ("id",),
    s.CampaignUpdate,
    children=(
        lambda pk: delete(CampaignCreatorLink).where(
            CampaignCreatorLink.campaign_id == pk[0]
        ),
    ),
)

PITCH_CREATOR = Kind(
    "pitch_creator",
    "creator row",
    PitchCreatorLink,
    ("pitch_id", "creator_id"),
    s.PitchCreatorUpdate,
)

CAMPAIGN_CREATOR = Kind(
    "campaign_creator",
    "creator row",
    CampaignCreatorLink,
    ("campaign_id", "creator_id"),
    s.CampaignCreatorUpdate,
)

KINDS = {
    k.name: k
    for k in (CREATOR, BRAND, COMPANY, PITCH, CAMPAIGN, PITCH_CREATOR, CAMPAIGN_CREATOR)
}
