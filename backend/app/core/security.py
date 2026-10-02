import secrets

from pwdlib import PasswordHash
from redis.asyncio import Redis as RedisClient

from app.core.config import settings

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
    key = f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}"
    await redis.setex(
        f"{settings.SESSION_CACHE_PREFIX}{sid}", settings.SESSION_CACHE_TTL, str(user_id)
    )
    await redis.sadd(key, sid)
    await redis.expire(key, settings.SESSION_CACHE_TTL)
    return sid


async def read_session(redis: RedisClient, sid: str) -> int | None:
    user_id = await redis.get(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    if user_id is None:
        return None
    pipe = redis.pipeline()
    pipe.expire(f"{settings.SESSION_CACHE_PREFIX}{sid}", settings.SESSION_CACHE_TTL)
    pipe.expire(f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}", settings.SESSION_CACHE_TTL)
    await pipe.execute()
    return int(user_id)


async def destroy_session(redis: RedisClient, sid: str) -> None:
    user_id = await redis.get(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    await redis.delete(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    if user_id is not None:
        await redis.srem(f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}", sid)


async def destroy_other_sessions(
    redis: RedisClient, user_id: int, keep_sid: str
) -> None:
    key = f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}"
    sids = await redis.smembers(key)
    for sid in sids:
        if sid == keep_sid:
            continue
        await redis.delete(f"{settings.SESSION_CACHE_PREFIX}{sid}")
        await redis.srem(key, sid)


# --- CSRF (double-submit) ---


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


# --- Email Verification ---


async def create_email_verification_token(redis: RedisClient, user_id: int) -> str:
    token = new_token()
    await redis.setex(
        f"{settings.EMAIL_VERIFY_CACHE_PREFIX}{token}",
        settings.EMAIL_VERIFICATION_CACHE_TTL,
        str(user_id),
    )
    return token


async def read_email_verification_token(redis: RedisClient, token: str) -> int | None:
    user_id = await redis.get(f"{settings.EMAIL_VERIFY_CACHE_PREFIX}{token}")
    return int(user_id) if user_id is not None else None


async def destroy_email_verification_token(redis: RedisClient, token: str) -> None:
    await redis.delete(f"{settings.EMAIL_VERIFY_CACHE_PREFIX}{token}")


# --- Password Reset ---


async def create_password_reset_token(redis: RedisClient, user_id: int) -> str:
    token = new_token()
    await redis.setex(
        f"{settings.PASSWORD_RESET_CACHE_PREFIX}{token}",
        settings.PASSWORD_RESET_CACHE_TTL,
        str(user_id),
    )
    return token


async def read_password_reset_token(redis: RedisClient, token: str) -> int | None:
    user_id = await redis.get(f"{settings.PASSWORD_RESET_CACHE_PREFIX}{token}")
    return int(user_id) if user_id is not None else None


async def destroy_password_reset_token(redis: RedisClient, token: str) -> None:
    await redis.delete(f"{settings.PASSWORD_RESET_CACHE_PREFIX}{token}")
