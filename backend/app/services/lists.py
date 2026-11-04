"""Lists: building what the screens show, and the changes people make.

Reads are batched: one query per kind of thing (owners, shares, tags, counts ...)
for a whole page of lists, never one set of queries per list.
Access is decided in services/list_access.py; routes call that first.
Every change lands in edit_log as kind "list".
"""

import logging
from collections import Counter, defaultdict
from statistics import median
from typing import Optional, Sequence
from uuid import UUID

from fastapi import HTTPException, status
from datetime import datetime, timezone

from sqlalchemy import Uuid, literal
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlmodel import select, col, func, delete, insert
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import (
    User,
    Team,
    Creator,
    EditLog,
    SavedList,
    ListCreator,
    ListShare,
    ListTag,
)
from app.models.saved_list import LIST_STATUSES, MAX_CREATORS_PER_LIST
from app.schemas import lists as s
from app.services.creator_gaps import FIELDS, any_missing, applies, gap_count
from app.services.list_access import level_for, visible_clause
from app.services.search import latest_costs

log = logging.getLogger(__name__)

_PREVIEW_SIZE = 5


def _refuse(code: str, message: str, http: int) -> HTTPException:
    return HTTPException(status_code=http, detail={"code": code, "message": message})


# ---------- reading ----------


def _health(count: int, gaps: int, not_applicable: int) -> Optional[int]:
    """0-100: the share of checked details that are filled in. None for an empty list.

    Each creator is checked on the nine details in FIELDS; avg_views only applies
    on Instagram and YouTube, so it is not counted for other platforms.
    """
    if count == 0:
        return None
    checks = count * len(FIELDS) - not_applicable
    return max(0, min(100, round(100 * (1 - gaps / checks))))


async def _counts(session: AsyncSession, ids: Sequence[UUID]) -> dict[UUID, tuple]:
    """list id -> (creators, missing details, checks that don't apply)."""
    stmnt = (
        select(
            ListCreator.list_id,
            func.count(),
            func.coalesce(func.sum(gap_count()), 0),
            func.count().filter(~applies("avg_views")),
        )
        .join(Creator, col(Creator.id) == col(ListCreator.creator_id))
        .where(col(ListCreator.list_id).in_(ids))
        .group_by(ListCreator.list_id)
    )
    return {
        lid: (n, int(gaps), int(na)) for lid, n, gaps, na in (await session.exec(stmnt))
    }


async def _previews(session: AsyncSession, ids: Sequence[UUID]):
    """list id -> its most recently added creators, for the card's avatar stack."""
    rank = (
        func.row_number()
        .over(
            partition_by=col(ListCreator.list_id),
            order_by=col(ListCreator.added_at).desc(),
        )
        .label("rank")
    )
    inner = (
        select(
            ListCreator.list_id.label("list_id"),
            Creator.id.label("id"),
            Creator.name.label("name"),
            Creator.platform.label("platform"),
            rank,
        )
        .join(Creator, col(Creator.id) == col(ListCreator.creator_id))
        .where(col(ListCreator.list_id).in_(ids))
        .subquery()
    )
    stmnt = (
        select(inner.c.list_id, inner.c.id, inner.c.name, inner.c.platform)
        .where(inner.c.rank <= _PREVIEW_SIZE)
        .order_by(inner.c.list_id, inner.c.rank)
    )
    out: dict[UUID, list[s.PreviewCreator]] = defaultdict(list)
    for list_id, creator_id, name, platform in await session.exec(stmnt):
        out[list_id].append(
            s.PreviewCreator(id=creator_id, name=name, platform=platform)
        )
    return out


async def summaries(
    session: AsyncSession, user: User, lists: Sequence[SavedList]
) -> list[s.ListSummary]:
    """The lists as cards, as seen by `user` (their access, can_* flags)."""
    if not lists:
        return []
    ids = [lst.id for lst in lists]

    owner_ids = {lst.owner_id for lst in lists}
    owners = {
        u.id: u
        for u in await session.exec(select(User).where(col(User.id).in_(owner_ids)))
    }
    team_ids = {lst.team_id for lst in lists if lst.team_id is not None}
    teams = (
        {
            t.id: t
            for t in await session.exec(select(Team).where(col(Team.id).in_(team_ids)))
        }
        if team_ids
        else {}
    )

    shares: dict[UUID, list[s.ListShareOut]] = defaultdict(list)
    my_level: dict[UUID, str] = {}
    share_rows = await session.exec(
        select(ListShare, User)
        .join(User, col(User.id) == col(ListShare.user_id))
        .where(col(ListShare.list_id).in_(ids))
        .order_by(func.lower(User.name))
    )
    for share, person in share_rows:
        shares[share.list_id].append(
            s.ListShareOut(user=s.UserRef.model_validate(person), level=share.level)
        )
        if person.id == user.id:
            my_level[share.list_id] = share.level

    tags: dict[UUID, list[str]] = defaultdict(list)
    for tag in await session.exec(
        select(ListTag).where(col(ListTag.list_id).in_(ids)).order_by(ListTag.tag)
    ):
        tags[tag.list_id].append(tag.tag)

    counts = await _counts(session, ids)
    previews = await _previews(session, ids)

    out = []
    for lst in lists:
        level = level_for(user, lst, my_level.get(lst.id))
        if level is None:  # callers filter first; this is a safety net
            continue
        n, gaps, not_applicable = counts.get(lst.id, (0, 0, 0))
        team = teams.get(lst.team_id) if lst.team_id is not None else None
        out.append(
            s.ListSummary(
                id=lst.id,
                name=lst.name,
                description=lst.description,
                owner=s.UserRef.model_validate(owners[lst.owner_id]),
                created_at=lst.created_at,
                updated_at=lst.updated_at,
                creator_count=n,
                preview=previews.get(lst.id, []),
                visibility=lst.visibility,
                audience_level=lst.audience_level,
                shares=shares.get(lst.id, []),
                tags=tags.get(lst.id, []),
                access=level,
                health=_health(n, gaps, not_applicable),
                team=s.TeamRef.model_validate(team) if team else None,
                can_delete=level == "manage",
                can_manage=level == "manage",
                can_edit=level in ("edit", "manage"),
            )
        )
    return out


async def index(session: AsyncSession, user: User) -> list[s.ListSummary]:
    """Every list the user can see, most recently changed first."""
    stmnt = (
        select(SavedList)
        .where(visible_clause(user))
        .order_by(col(SavedList.updated_at).desc(), col(SavedList.name))
    )
    return await summaries(session, user, (await session.exec(stmnt)).all())


async def _stats(session: AsyncSession, list_id: UUID) -> s.ListStats:
    """The numbers in a list's header, worked out over its creators."""
    stmnt = (
        select(
            Creator.id,
            Creator.platform,
            Creator.followers,
            Creator.avg_views,
            ListCreator.status,
            any_missing().label("has_gaps"),
        )
        .join(ListCreator, col(ListCreator.creator_id) == col(Creator.id))
        .where(ListCreator.list_id == list_id)
    )
    rows = (await session.exec(stmnt)).all()
    costs = await latest_costs(session, [r.id for r in rows])

    status_counts = {st: 0 for st in LIST_STATUSES}
    platforms: Counter = Counter()
    views, cpvs = [], []
    total_followers = missing_followers = with_gaps = missing_cost = 0
    est_cost = 0
    for r in rows:
        status_counts[r.status] += 1
        platforms[r.platform] += 1
        with_gaps += bool(r.has_gaps)
        if (r.followers or 0) < 1:
            missing_followers += 1
        total_followers += r.followers or 0
        if (r.avg_views or 0) > 0:
            views.append(r.avg_views)
        cost = (costs.get(r.id) or {}).get("latest_cost")
        if cost:
            est_cost += cost
            if (r.avg_views or 0) > 0:
                cpvs.append(round(cost / r.avg_views, 2))
        else:
            missing_cost += 1

    return s.ListStats(
        creator_count=len(rows),
        total_followers=total_followers,
        missing_followers=missing_followers,
        median_views=median(views) if views else None,
        est_cost=est_cost,
        missing_cost=missing_cost,
        median_cpv=median(cpvs) if cpvs else None,
        with_gaps=with_gaps,
        status_counts=status_counts,
        platforms=[
            s.PlatformCount(platform=p, count=n) for p, n in platforms.most_common()
        ],
    )


async def _members(session: AsyncSession, list_id: UUID) -> list[s.ListMember]:
    stmnt = (
        select(ListCreator, User)
        .join(User, col(User.id) == col(ListCreator.added_by_id))
        .where(ListCreator.list_id == list_id)
        .order_by(col(ListCreator.added_at).desc(), col(ListCreator.creator_id))
    )
    return [
        s.ListMember(
            creator_id=m.creator_id,
            status=m.status,
            note=m.note,
            added_at=m.added_at,
            added_by=s.UserRef.model_validate(who),
        )
        for m, who in await session.exec(stmnt)
    ]


async def detail(session: AsyncSession, user: User, lst: SavedList) -> s.ListDetail:
    """One list opened: its card, header numbers and members."""
    (card,) = await summaries(session, user, [lst])
    return s.ListDetail(
        **card.model_dump(),
        stats=await _stats(session, lst.id),
        members=await _members(session, lst.id),
    )


# ---------- changing ----------


async def _name_taken(
    session: AsyncSession, owner_id: int, name: str, except_id: Optional[UUID] = None
) -> bool:
    """Does this owner already have a list with this name (ignoring capitals)?"""
    stmnt = select(SavedList.id).where(
        SavedList.owner_id == owner_id, func.lower(col(SavedList.name)) == name.lower()
    )
    if except_id is not None:
        stmnt = stmnt.where(SavedList.id != except_id)
    return (await session.exec(stmnt)).first() is not None


def _duplicate(name: str) -> HTTPException:
    return _refuse("duplicate", f"You already have a list called “{name}”", 409)


async def create(
    session: AsyncSession, user: User, body: s.ListCreateRequest
) -> SavedList:
    """A new list owned by `user`, optionally with creators already in it.

    Sharing starts as "team" (or "everyone" when the user has no team); creator ids
    that don't exist are ignored.
    """
    visibility = body.visibility or ("team" if user.team_id is not None else "everyone")
    if visibility == "team" and user.team_id is None:
        raise _refuse("no_team", "You are not in a team yet", 422)
    if await _name_taken(session, user.id, body.name):
        raise _duplicate(body.name)

    lst = SavedList(
        name=body.name,
        description=body.description or None,
        owner_id=user.id,
        visibility=visibility,
        audience_level="view",
        team_id=user.team_id,
    )
    session.add(lst)
    await session.flush()

    session.add_all(ListTag(list_id=lst.id, tag=t) for t in body.tags)
    wanted = list(dict.fromkeys(body.creator_ids))
    found = (
        (await session.exec(select(Creator.id).where(col(Creator.id).in_(wanted))))
        .all()
        if wanted
        else []
    )
    session.add_all(
        ListCreator(list_id=lst.id, creator_id=cid, added_by_id=user.id)
        for cid in found
    )
    session.add(
        EditLog(
            kind="list",
            record_id=str(lst.id),
            action="create",
            changes={
                "name": {"from": None, "to": lst.name},
                "creators": {"from": 0, "to": len(found)},
            },
            user_id=user.id,
            user_name=user.name,
        )
    )
    try:
        await session.commit()
    except IntegrityError:  # two requests with the same name at the same moment
        await session.rollback()
        raise _duplicate(body.name)
    log.info("list %s created by user %s", lst.id, user.id)
    return lst




# ---------- sharing ----------


async def people(session: AsyncSession, user: User) -> list[s.PersonRef]:
    """Colleagues who can be picked in the Share dialog: signed-in, switched on, not you."""
    stmnt = (
        select(User, Team)
        .join(Team, col(Team.id) == col(User.team_id), isouter=True)
        .where(
            col(User.is_verified).is_(True),
            col(User.is_currently_employed).is_(True),
            User.id != user.id,
        )
        .order_by(func.lower(User.name))
    )
    return [
        s.PersonRef(
            id=person.id,
            name=person.name,
            email=person.email,
            team=s.TeamRef.model_validate(team) if team else None,
        )
        for person, team in await session.exec(stmnt)
    ]


async def share(
    session: AsyncSession, user: User, lst: SavedList, body: s.ListSharingUpdate
) -> None:
    """Replace who can open the list: visibility, the audience's level, picked people.

    Only the owner or an admin gets here (the route asks for "manage"). Only the owner
    may make a list private, because an admin could no longer see it afterwards.
    Picked people are ignored (and removed) while the list is private.
    """
    if body.visibility == "private" and lst.owner_id != user.id:
        raise _refuse("forbidden", "Only the owner can make a list private", 403)

    team_id = lst.team_id
    if body.visibility == "team" and team_id is None:
        owner = await session.get(User, lst.owner_id)
        team_id = owner.team_id if owner else None
        if team_id is None:
            raise _refuse("no_team", "The owner is not in a team yet", 422)

    wanted = (
        {}
        if body.visibility == "private"
        else {e.user_id: e.level for e in body.shares if e.user_id != lst.owner_id}
    )
    if wanted:
        valid = set(
            (
                await session.exec(
                    select(User.id).where(
                        col(User.id).in_(list(wanted)),
                        col(User.is_verified).is_(True),
                        col(User.is_currently_employed).is_(True),
                    )
                )
            ).all()
        )
        if valid != set(wanted):
            raise _refuse("unknown_person", "One of those people can't be found", 422)

    current = {
        sh.user_id: sh.level
        for sh in await session.exec(
            select(ListShare).where(ListShare.list_id == lst.id)
        )
    }

    changes: dict = {}
    for field, new in (
        ("visibility", body.visibility),
        ("audience_level", body.audience_level),
    ):
        if getattr(lst, field) != new:
            changes[field] = {"from": getattr(lst, field), "to": new}
    if current != wanted:
        changes["shares"] = {"from": current, "to": wanted}
    if not changes:
        return

    lst.visibility = body.visibility
    lst.audience_level = body.audience_level
    lst.team_id = team_id
    lst.updated_at = datetime.now(timezone.utc)
    session.add(lst)
    await session.exec(delete(ListShare).where(col(ListShare.list_id) == lst.id))
    session.add_all(
        ListShare(list_id=lst.id, user_id=uid, level=level)
        for uid, level in wanted.items()
    )
    session.add(
        EditLog(
            kind="list",
            record_id=str(lst.id),
            action="update",
            changes={k: v for k, v in changes.items()},
            user_id=user.id,
            user_name=user.name,
        )
    )
    await session.commit()
    log.info("list %s sharing changed by user %s: %s", lst.id, user.id, ", ".join(changes))


async def duplicate(session: AsyncSession, user: User, source: SavedList) -> SavedList:
    """A private copy for `user`: same creators, statuses, notes and tags.

    Named "<name> copy", then "<name> copy 2" ... until the name is free for them.
    """
    base = source.name[:90]
    name, n = f"{base} copy", 1
    while await _name_taken(session, user.id, name):
        n += 1
        name = f"{base} copy {n}"

    lst = SavedList(
        name=name,
        description=source.description,
        owner_id=user.id,
        visibility="private",
        audience_level="view",
        team_id=user.team_id,
    )
    session.add(lst)
    await session.flush()

    for tag in await session.exec(
        select(ListTag.tag).where(ListTag.list_id == source.id)
    ):
        session.add(ListTag(list_id=lst.id, tag=tag))
    await session.exec(
        insert(ListCreator).from_select(
            ["list_id", "creator_id", "status", "note", "added_by_id"],
            select(
                literal(lst.id, type_=Uuid()),
                col(ListCreator.creator_id),
                col(ListCreator.status),
                col(ListCreator.note),
                literal(user.id),
            ).where(ListCreator.list_id == source.id),
        )
    )
    copied = (
        await session.exec(
            select(func.count()).where(ListCreator.list_id == lst.id)
        )
    ).one()
    session.add(
        EditLog(
            kind="list",
            record_id=str(lst.id),
            action="create",
            changes={
                "name": {"from": None, "to": name},
                "creators": {"from": 0, "to": copied},
                "copied_from": {"from": None, "to": str(source.id)},
            },
            user_id=user.id,
            user_name=user.name,
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise _duplicate(name)
    return lst




# ---------- editing a list and its creators ----------


def _touch(lst: SavedList) -> None:
    lst.updated_at = datetime.now(timezone.utc)


def _log(session, user, lst_id, action, changes, record_id=None) -> None:
    session.add(
        EditLog(
            kind="list",
            record_id=record_id or str(lst_id),
            action=action,
            changes=changes,
            user_id=user.id,
            user_name=user.name,
        )
    )


async def update(
    session: AsyncSession, user: User, lst: SavedList, body: s.ListUpdateRequest
) -> None:
    """Rename, change the description or replace the tags. Only what is sent changes."""
    sent = body.model_fields_set
    changes: dict = {}

    if "name" in sent and body.name is not None and body.name != lst.name:
        if await _name_taken(session, lst.owner_id, body.name, except_id=lst.id):
            raise _duplicate(body.name)
        changes["name"] = {"from": lst.name, "to": body.name}
        lst.name = body.name
    if "description" in sent:
        new = body.description or None
        if new != lst.description:
            changes["description"] = {"from": lst.description, "to": new}
            lst.description = new
    if "tags" in sent and body.tags is not None:
        old = sorted(
            await session.exec(select(ListTag.tag).where(ListTag.list_id == lst.id))
        )
        if old != sorted(body.tags):
            changes["tags"] = {"from": old, "to": body.tags}
            await session.exec(delete(ListTag).where(col(ListTag.list_id) == lst.id))
            session.add_all(ListTag(list_id=lst.id, tag=t) for t in body.tags)

    if not changes:
        return
    _touch(lst)
    session.add(lst)
    _log(session, user, lst.id, "update", changes)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise _duplicate(body.name or lst.name)


async def delete_list(session: AsyncSession, user: User, lst: SavedList) -> None:
    """Delete the list; its creators, shares and tags go with it (database cascade).

    The edit history keeps what the list was, so nothing is lost for good.
    """
    count = (
        await session.exec(
            select(func.count()).where(ListCreator.list_id == lst.id)
        )
    ).one()
    _log(
        session,
        user,
        lst.id,
        "delete",
        {
            "name": {"from": lst.name, "to": None},
            "description": {"from": lst.description, "to": None},
            "visibility": {"from": lst.visibility, "to": None},
            "creators": {"from": count, "to": None},
        },
    )
    await session.delete(lst)
    await session.commit()
    log.info("list %s deleted by user %s", lst.id, user.id)


async def add_creators(
    session: AsyncSession, user: User, lst: SavedList, creator_ids: Sequence[UUID]
) -> s.ListAddResult:
    """Put creators on the list. Ones already there are skipped, not an error.

    Ids that match no creator are ignored. A list holds at most 2,000 creators.
    """
    wanted = list(dict.fromkeys(creator_ids))
    real = set(
        (await session.exec(select(Creator.id).where(col(Creator.id).in_(wanted))))
        .all()
    )
    on_list = set(
        (
            await session.exec(
                select(ListCreator.creator_id).where(
                    ListCreator.list_id == lst.id,
                    col(ListCreator.creator_id).in_(list(real)),
                )
            )
        ).all()
    )
    new = real - on_list
    before = (
        await session.exec(
            select(func.count()).where(ListCreator.list_id == lst.id)
        )
    ).one()
    if before + len(new) > MAX_CREATORS_PER_LIST:
        raise _refuse(
            "list_full",
            f"A list holds at most {MAX_CREATORS_PER_LIST:,} creators "
            f"({before:,} here already)",
            422,
        )
    added = 0
    if new:
        done = await session.exec(
            pg_insert(ListCreator)
            .values(
                [
                    {"list_id": lst.id, "creator_id": cid, "added_by_id": user.id}
                    for cid in new
                ]
            )
            .on_conflict_do_nothing()  # two people adding the same creator at once
            .returning(ListCreator.creator_id)
        )
        added = len(done.all())
    if added:
        _touch(lst)
        session.add(lst)
        _log(session, user, lst.id, "update", {"creators": {"from": before, "to": before + added}})
        await session.commit()
    return s.ListAddResult(added=added, skipped=len(on_list))


async def remove_creators(
    session: AsyncSession, user: User, lst: SavedList, creator_ids: Sequence[UUID]
) -> int:
    """Take creators off the list; returns how many were on it."""
    done = await session.exec(
        delete(ListCreator)
        .where(
            col(ListCreator.list_id) == lst.id,
            col(ListCreator.creator_id).in_(list(creator_ids)),
        )
        .returning(ListCreator.creator_id)
    )
    removed = len(done.all())
    if removed:
        after = (
            await session.exec(
                select(func.count()).where(ListCreator.list_id == lst.id)
            )
        ).one()
        _touch(lst)
        session.add(lst)
        _log(session, user, lst.id, "update", {"creators": {"from": after + removed, "to": after}})
        await session.commit()
    return removed


async def update_member(
    session: AsyncSession,
    user: User,
    lst: SavedList,
    creator_id: UUID,
    body: s.ListMemberUpdate,
) -> s.ListMember:
    """Change one creator's status or note on this list. Only what is sent changes."""
    member = await session.get(ListCreator, (lst.id, creator_id))
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not on this list")

    sent = body.model_fields_set
    changes: dict = {}
    if "status" in sent and body.status is not None and body.status != member.status:
        changes["status"] = {"from": member.status, "to": body.status}
        member.status = body.status
    if "note" in sent:
        new = (body.note or "").strip() or None
        if new != member.note:
            changes["note"] = {"from": member.note, "to": new}
            member.note = new

    if changes:
        session.add(member)
        _touch(lst)
        session.add(lst)
        _log(session, user, lst.id, "update", changes, record_id=f"{lst.id}/{creator_id}")
        await session.commit()

    who = await session.get(User, member.added_by_id)
    return s.ListMember(
        creator_id=member.creator_id,
        status=member.status,
        note=member.note,
        added_at=member.added_at,
        added_by=s.UserRef.model_validate(who),
    )
    
    

# ---------- a creator's lists ----------


async def creator_lists(
    session: AsyncSession, user: User, creator_id: UUID
) -> list[s.CreatorListRef]:
    """The lists this creator is on that `user` can see, with their status on each."""
    stmnt = (
        select(SavedList.id, SavedList.name, ListCreator.status)
        .join(ListCreator, col(ListCreator.list_id) == col(SavedList.id))
        .where(col(ListCreator.creator_id) == creator_id, visible_clause(user))
        .order_by(func.lower(SavedList.name))
    )
    return [
        s.CreatorListRef(id=lid, name=name, status=st)
        for lid, name, st in await session.exec(stmnt)
    ]