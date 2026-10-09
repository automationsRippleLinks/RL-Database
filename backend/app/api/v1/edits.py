"""Editing routes. The rules live in services/edits.py; this file only maps URLs.

For each of creators, brands, companies, pitches, campaigns:

    POST    /{things}/{id}/lock         open the edit form: claim the lock, get the record
    DELETE  /{things}/{id}/lock         close the form (?force=true lets an admin clear anyone's)
    PATCH   /{things}/{id}              save; send back the `version` the record came with
    DELETE  /{things}/{id}              delete; refused while something still uses it
    GET     /{things}/{id}/history      who changed what, newest first

Creator rows on a pitch or campaign get the same five under
/{pitches|campaigns}/{id}/creators/{creator_id}, plues POST /{...}/{id}/creators to add one.

The form renews its lock by calling POST .../lock again every minute.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Query
from sqlmodel import select, func, col

from app.api.deps import (
    CSRFProtected,
    SessionDep,
    RedisDep,
    EditUser,
    CurrentUser,
    AdminUser,
)
from app.models import User, Pitch, Campaign, Brand, Company
from app.services import edits
from app.services.edits import Kind, KINDS
from app.schemas.edits import (
    EditSession,
    EditRecord,
    HistoryEntry,
    PitchCreatorAdd,
    CampaignCreatorAdd,
    CompanyRow,
)

router = APIRouter()


def _force_ok(user: User, force: bool) -> None:
    if force and not (user.is_admin or user.is_superadmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an admin can clear someone else's lock",
        )


def _record_routes(kind: Kind, plural: str, key_type: type) -> None:
    path = f"/{plural}/{{record_id}}"
    label = kind.label

    @router.post(
        f"{path}/lock",
        response_model=EditSession,
        dependencies=[CSRFProtected],
        summary=f"Open a {label} for editing",
    )
    async def open_form(
        record_id: key_type, session: SessionDep, redis: RedisDep, user: EditUser
    ):
        return await edits.open_form(session, redis, user, kind, (record_id,))

    @router.delete(
        f"{path}/lock",
        status_code=status.HTTP_204_NO_CONTENT,
        dependencies=[CSRFProtected],
        summary=f"Close a {label}'s edit form",
    )
    async def close_form(
        record_id: key_type, redis: RedisDep, user: EditUser, force: bool = False
    ):
        _force_ok(user, force)
        await edits.close_form(redis, user, kind, (record_id,), force)

    @router.patch(
        path,
        response_model=EditRecord,
        dependencies=[CSRFProtected],
        summary=f"Save changes to a {label}",
    )
    async def save(
        record_id: key_type,
        body: kind.update,
        session: SessionDep,
        redis: RedisDep,
        user: EditUser,
    ):
        return await edits.save(session, redis, user, kind, (record_id,), body)

    @router.delete(
        path,
        status_code=status.HTTP_204_NO_CONTENT,
        dependencies=[CSRFProtected],
        summary=f"Delete a {label}",
    )
    async def remove(
        record_id: key_type, session: SessionDep, redis: RedisDep, user: EditUser
    ):
        await edits.remove(session, redis, user, kind, (record_id,))

    @router.get(
        f"{path}/history",
        response_model=list[HistoryEntry],
        summary=f"A {label}'s edit history",
    )
    async def history(
        record_id: key_type,
        session: SessionDep,
        user: CurrentUser,
        before: Optional[int] = None,
        limit: int = Query(50, ge=1, le=200),
    ):
        return await edits.history(
            session, kind.name, str(record_id), before=before, limit=limit
        )


def _link_routes(kind: Kind, parent_plural: str, parent: type, add_body: type) -> None:
    base = f"/{parent_plural}/{{parent_id}}/creators"
    path = f"{base}/{{creator_id}}"

    @router.post(
        base,
        response_model=EditRecord,
        status_code=status.HTTP_201_CREATED,
        dependencies=[CSRFProtected],
        summary=f"Add a creator to a {parent.__name__.lower()}",
    )
    async def add(
        parent_id: UUID,
        body: add_body,
        session: SessionDep,
        redis: RedisDep,
        user: EditUser,
    ):
        return await edits.add_link(session, redis, user, kind, parent, parent_id, body)

    @router.post(
        f"{path}/lock",
        response_model=EditSession,
        dependencies=[CSRFProtected],
        summary="Open a creator row for editing",
    )
    async def open_form(
        parent_id: UUID,
        creator_id: UUID,
        session: SessionDep,
        redis: RedisDep,
        user: EditUser,
    ):
        return await edits.open_form(
            session, redis, user, kind, (parent_id, creator_id)
        )

    @router.delete(
        f"{path}/lock",
        status_code=status.HTTP_204_NO_CONTENT,
        dependencies=[CSRFProtected],
        summary="Close a creator row's edit form",
    )
    async def close_form(
        parent_id: UUID,
        creator_id: UUID,
        redis: RedisDep,
        user: EditUser,
        force: bool = False,
    ):
        _force_ok(user, force)
        await edits.close_form(redis, user, kind, (parent_id, creator_id), force)

    @router.patch(
        path,
        response_model=EditRecord,
        dependencies=[CSRFProtected],
        summary="Save changes to a creator row",
    )
    async def save(
        parent_id: UUID,
        creator_id: UUID,
        body: kind.update,
        session: SessionDep,
        redis: RedisDep,
        user: EditUser,
    ):
        return await edits.save(session, redis, user, kind, (parent_id, creator_id), body)

    @router.delete(
        path,
        status_code=status.HTTP_204_NO_CONTENT,
        dependencies=[CSRFProtected],
        summary=f"Remove a creator from a {parent.__name__.lower()}",
    )
    async def remove(
        parent_id: UUID,
        creator_id: UUID,
        session: SessionDep,
        redis: RedisDep,
        user: EditUser,
    ):
        await edits.remove(session, redis, user, kind, (parent_id, creator_id))

    @router.get(
        f"{path}/history",
        response_model=list[HistoryEntry],
        summary="A creator row's edit history",
    )
    async def history(
        parent_id: UUID,
        creator_id: UUID,
        session: SessionDep,
        user: CurrentUser,
        before: Optional[int] = None,
        limit: int = Query(50, ge=1, le=200),
    ):
        return await edits.history(
            session, kind.name, f"{parent_id}/{creator_id}", before=before, limit=limit
        )


_record_routes(KINDS["creator"], "creators", UUID)
_record_routes(KINDS["brand"], "brands", int)
_record_routes(KINDS["company"], "companies", int)
_record_routes(KINDS["pitch"], "pitches", UUID)
_record_routes(KINDS["campaign"], "campaigns", UUID)
_link_routes(KINDS["pitch_creator"], "pitches", Pitch, PitchCreatorAdd)
_link_routes(KINDS["campaign_creator"], "campaigns", Campaign, CampaignCreatorAdd)


@router.get(
    "/companies",
    response_model=list[CompanyRow],
    summary="All companies, for the brand form's picker",
)
async def list_companies(session: SessionDep, user: CurrentUser):
    brands = func.count(col(Brand.id)).label("brand_count")
    rows = await session.exec(
        select(Company.id, Company.name, Company.gstin, brands)
        .join(Brand, col(Brand.company_id) == Company.id, isouter=True)
        .group_by(Company.id)
        .order_by(Company.name)
    )
    return [
        CompanyRow(id=i, name=n, gstin=g, brand_count=c) for i, n, g, c in rows.all()
    ]


@router.get(
    "/edits",
    response_model=list[HistoryEntry],
    summary="Recent edits across everything (admins)",
)
async def recent_edits(
    session: SessionDep,
    user: AdminUser,
    kind: Optional[str] = Query(
        None, description="creator, brand, campaign_creator, user, ..."
    ),
    user_id: Optional[int] = None,
    before: Optional[int] = None,
    limit: int = Query(50, ge=1, le=200),
):
    return await edits.history(
        session, kind, user_id=user_id, before=before, limit=limit
    )
