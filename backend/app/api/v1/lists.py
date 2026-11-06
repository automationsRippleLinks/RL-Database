"""Lists: named groups of creators that people save, track and share.

Who may see or change a list is decided in services/list_access.py; the work is
in services/lists.py. A list you can't see answers 404, never 403.
"""

from uuid import UUID

from fastapi import APIRouter, status

from app.api.deps import SessionDep, CurrentUser, CSRFProtected
from app.schemas.lists import (
    ListIndex,
    ListDetail,
    ListCreateRequest,
    ListSharingUpdate,
    PeopleIndex,
    ListUpdateRequest,
    CreatorIds,
    ListAddResult,
    ListRemoveResult,
    ListMember,
    ListMemberUpdate,
    CreatorListsIndex,
)
from app.services import lists
from app.services.list_access import get_list

router = APIRouter()
# GET /people sits outside /lists, so it has its own router (mounted in api/v1/__init__.py)
people_router = APIRouter()
# GET /creators/{id}/lists too: it is a creator's page asking which lists it is on
creator_lists_router = APIRouter()


@router.get("", response_model=ListIndex)
async def list_lists(session: SessionDep, user: CurrentUser):
    """Every list you can see, most recently changed first."""

    return ListIndex(lists=await lists.index(session, user))


@router.post("", response_model=ListDetail, dependencies=[CSRFProtected])
async def create_list(body: ListCreateRequest, session: SessionDep, user: CurrentUser):
    """Make a list, optionally with creators already in it.

    Sharing starts as "team" (or "everyone" if you have no team).
    """

    lst = await lists.create(session, user, body)
    return await lists.detail(session, user, lst)


@router.get("/{list_id}", response_model=ListDetail)
async def get_one_list(list_id: UUID, session: SessionDep, user: CurrentUser):
    """One list with its header numbers and members, or 404."""

    lst, _ = await get_list(session, user, list_id, need="view")
    return await lists.detail(session, user, lst)


@router.patch("/{list_id}", response_model=ListDetail, dependencies=[CSRFProtected])
async def update_list(
    list_id: UUID, body: ListUpdateRequest, session: SessionDep, user: CurrentUser
):
    """Rename a list, change its description or tags. Only what is sent changes."""

    lst, _ = await get_list(session, user, list_id, need="edit")
    await lists.update(session, user, lst, body)
    return await lists.detail(session, user, lst)


@router.delete(
    "/{list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[CSRFProtected],
)
async def delete_list(list_id: UUID, session: SessionDep, user: CurrentUser):
    """Delete a list and everything on it. Owner or admin only."""

    lst, _ = await get_list(session, user, list_id, need="manage")
    await lists.delete_list(session, user, lst)


@router.post(
    "/{list_id}/creators", response_model=ListAddResult, dependencies=[CSRFProtected]
)
async def add_creators(
    list_id: UUID, body: CreatorIds, session: SessionDep, user: CurrentUser
):
    """Add creators. Ones already on the list are skipped and counted, not an error."""

    lst, _ = await get_list(session, user, list_id, need="edit")
    return await lists.add_creators(session, user, lst, body.creator_ids)


@router.post(
    "/{list_id}/creators/remove",
    response_model=ListRemoveResult,
    dependencies=[CSRFProtected],
)
async def remove_creators(
    list_id: UUID, body: CreatorIds, session: SessionDep, user: CurrentUser
):
    """Take creators off the list."""

    lst, _ = await get_list(session, user, list_id, need="edit")
    return ListRemoveResult(
        removed=await lists.remove_creators(session, user, lst, body.creator_ids)
    )


@router.patch(
    "/{list_id}/creators/{creator_id}",
    response_model=ListMember,
    dependencies=[CSRFProtected],
)
async def update_member(
    list_id: UUID,
    creator_id: UUID,
    body: ListMemberUpdate,
    session: SessionDep,
    user: CurrentUser,
):
    """Change one creator's status or note on this list."""

    lst, _ = await get_list(session, user, list_id, need="edit")
    return await lists.update_member(session, user, lst, creator_id, body)


@router.put(
    "/{list_id}/sharing", response_model=ListDetail, dependencies=[CSRFProtected]
)
async def share_list(
    list_id: UUID, body: ListSharingUpdate, session: SessionDep, user: CurrentUser
):
    """Replace who can open the list and at what level. Owner or admin only."""

    lst, _ = await get_list(session, user, list_id, need="manage")
    await lists.share(session, user, lst, body)
    return await lists.detail(session, user, lst)


@router.post(
    "/{list_id}/duplicate", response_model=ListDetail, dependencies=[CSRFProtected]
)
async def duplicate_list(list_id: UUID, session: SessionDep, user: CurrentUser):
    """A private copy for you, with the same creators, statuses, notes and tags."""

    source, _ = await get_list(session, user, list_id, need="view")
    copy = await lists.duplicate(session, user, source)
    return await lists.detail(session, user, copy)


@people_router.get("", response_model=PeopleIndex)
async def list_people(session: SessionDep, user: CurrentUser):
    """Colleagues you can share a list with (signed in, switched on, not you)."""

    return PeopleIndex(people=await lists.people(session, user))


@creator_lists_router.get("/{creator_id}/lists", response_model=CreatorListsIndex)
async def lists_of_creator(creator_id: UUID, session: SessionDep, user: CurrentUser):
    """The lists this creator is on (only lists you can see), for the drawer."""

    return CreatorListsIndex(lists=await lists.creator_lists(session, user, creator_id))