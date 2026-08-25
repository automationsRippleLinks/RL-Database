import secrets

from pwdlib import PasswordHash
from redis.asyncio import Redis as RedisClient

from app.core.config import (
    settings,
    USER_SESSIONS_PREFIX,
    SESSION_PREFIX,
    EMAIL_VERIFY_PREFIX,
    PASSWORD_RESET_PREFIX,
)

password_hasher = PasswordHash.recommended()


# --- Password Hashing ---


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


# --- Session tokens ---


def new_token() -> str:
    return secrets.token_urlsafe(32)


# --- REDIS auth session CRUD ---


async def create_session(redis: RedisClient, user_id: int) -> str:
    sid = new_token()
    key = f"{USER_SESSIONS_PREFIX}{user_id}"
    await redis.setex(
        f"{SESSION_PREFIX}{sid}", settings.SESSION_TTL_SECONDS, str(user_id)
    )
    await redis.sadd(key, sid)
    await redis.expire(key, settings.SESSION_TTL_SECONDS)
    return sid


async def read_session(redis: RedisClient, sid: str) -> int | None:
    user_id = await redis.get(f"{SESSION_PREFIX}{sid}")
    if user_id is None:
        return None
    pipe = redis.pipeline()
    pipe.expire(f"{SESSION_PREFIX}{sid}", settings.SESSION_TTL_SECONDS)
    pipe.expire(f"{USER_SESSIONS_PREFIX}{user_id}", settings.SESSION_TTL_SECONDS)
    await pipe.execute()
    return int(user_id)


async def destroy_session(redis: RedisClient, sid: str) -> None:
    user_id = await redis.get(f"{SESSION_PREFIX}{sid}")
    await redis.delete(f"{SESSION_PREFIX}{sid}")
    if user_id is not None:
        await redis.srem(f"{USER_SESSIONS_PREFIX}{user_id}", sid)


async def destroy_other_sessions(
    redis: RedisClient, user_id: int, keep_sid: str
) -> None:
    key = f"{USER_SESSIONS_PREFIX}{user_id}"
    sids = await redis.smembers(key)
    for sid in sids:
        if sid == keep_sid:
            continue
        await redis.delete(f"{SESSION_PREFIX}{sid}")
        await redis.srem(key, sid)


# --- CSRF (double-submit) ---


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


# --- Email Verification ---


async def create_email_verification_token(redis: RedisClient, user_id: int) -> str:
    token = new_token()
    await redis.setex(
        f"{EMAIL_VERIFY_PREFIX}{token}", settings.EMAIL_VERIFICATION_TTL, str(user_id)
    )
    return token


async def read_email_verification_token(redis: RedisClient, token: str) -> int | None:
    user_id = await redis.get(f"{EMAIL_VERIFY_PREFIX}{token}")
    return int(user_id) if user_id is not None else None


async def destroy_email_verification_token(redis: RedisClient, token: str) -> None:
    await redis.delete(f"{EMAIL_VERIFY_PREFIX}{token}")


# --- Password Reset ---


async def create_password_reset_token(redis: RedisClient, user_id: int) -> str:
    token = new_token()
    await redis.setex(
        f"{PASSWORD_RESET_PREFIX}{token}", settings.PASSWORD_RESET_TTL, str(user_id)
    )
    return token


async def read_password_reset_token(redis: RedisClient, token: str) -> int | None:
    user_id = await redis.get(f"{PASSWORD_RESET_PREFIX}{token}")
    return int(user_id) if user_id is not None else None


async def destory_password_reset_token(redis: RedisClient, token: str) -> None:
    await redis.delete(f"{PASSWORD_RESET_PREFIX}{token}")
