"""Password hashing, and the auth tokens kept in Redis.

auth_session:<sid>       -> user id  (SESSION_CACHE_TTL, renewed on each read)
user_sessions:<user id>  -> set of the user's sids, for signing out elsewhere
email_verify:<token>     -> user id  (EMAIL_VERIFICATION_CACHE_TTL)
password_reset:<token>   -> user id  (PASSWORD_RESET_CACHE_TTL)
"""

import secrets

from pwdlib import PasswordHash
from redis.asyncio import Redis as RedisClient

from app.core.config import settings

password_hasher = PasswordHash.recommended()


# --- Password Hashing ---


def hash_password(password: str) -> str:
    """Hash with pwdlib's recommended algorithm (Argon2), salt included."""
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """True if `password` matches the stored hash."""
    return password_hasher.verify(password, password_hash)


# --- Session tokens ---


def new_token() -> str:
    """Random URL-safe token (32 bytes) for session ids and emailed links."""
    return secrets.token_urlsafe(32)


# --- REDIS auth session CRUD ---


async def create_session(redis: RedisClient, user_id: int) -> str:
    """Start a session for the user and return its id (the session cookie value)."""
    sid = new_token()
    key = f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}"
    await redis.setex(
        f"{settings.SESSION_CACHE_PREFIX}{sid}",
        settings.SESSION_CACHE_TTL,
        str(user_id),
    )
    await redis.sadd(key, sid)
    await redis.expire(key, settings.SESSION_CACHE_TTL)
    return sid


async def read_session(redis: RedisClient, sid: str) -> int | None:
    """User id for a live session, or None. Each read pushes the expiry back."""
    user_id = await redis.get(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    if user_id is None:
        return None
    pipe = redis.pipeline()
    pipe.expire(f"{settings.SESSION_CACHE_PREFIX}{sid}", settings.SESSION_CACHE_TTL)
    pipe.expire(
        f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}", settings.SESSION_CACHE_TTL
    )
    await pipe.execute()
    return int(user_id)


async def destroy_session(redis: RedisClient, sid: str) -> None:
    """Log out one session and drop it from the user's set of sessions."""
    user_id = await redis.get(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    await redis.delete(f"{settings.SESSION_CACHE_PREFIX}{sid}")
    if user_id is not None:
        await redis.srem(f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}", sid)


async def destroy_other_sessions(
    redis: RedisClient, user_id: int, keep_sid: str
) -> None:
    """End every session of the user except `keep_sid`; keep_sid="" ends them all."""
    key = f"{settings.USER_SESSIONS_CACHE_PREFIX}{user_id}"
    sids = await redis.smembers(key)
    for sid in sids:
        if sid == keep_sid:
            continue
        await redis.delete(f"{settings.SESSION_CACHE_PREFIX}{sid}")
        await redis.srem(key, sid)


# --- CSRF (double-submit) ---


def new_csrf_token() -> str:
    """Token set as a readable cookie; the client echoes it in X-CSRF-Token."""
    return secrets.token_urlsafe(32)


# --- Email Verification ---


async def create_email_verification_token(redis: RedisClient, user_id: int) -> str:
    """Token for the verify-email link, valid for EMAIL_VERIFICATION_CACHE_TTL."""
    token = new_token()
    await redis.setex(
        f"{settings.EMAIL_VERIFY_CACHE_PREFIX}{token}",
        settings.EMAIL_VERIFICATION_CACHE_TTL,
        str(user_id),
    )
    return token


async def read_email_verification_token(redis: RedisClient, token: str) -> int | None:
    """Used id the token was issued for, or None if unknown or expired."""
    user_id = await redis.get(f"{settings.EMAIL_VERIFY_CACHE_PREFIX}{token}")
    return int(user_id) if user_id is not None else None


async def destroy_email_verification_token(redis: RedisClient, token: str) -> None:
    """Delete the token after use; reading it leaves it in place."""
    await redis.delete(f"{settings.EMAIL_VERIFY_CACHE_PREFIX}{token}")


# --- Password Reset ---


async def create_password_reset_token(redis: RedisClient, user_id: int) -> str:
    """Token for the reset-password link, valid for PASSWORD_RESET_CACHE_TTL."""
    token = new_token()
    await redis.setex(
        f"{settings.PASSWORD_RESET_CACHE_PREFIX}{token}",
        settings.PASSWORD_RESET_CACHE_TTL,
        str(user_id),
    )
    return token


async def read_password_reset_token(redis: RedisClient, token: str) -> int | None:
    """User id the token was issued for, or None if unknown or expired."""
    user_id = await redis.get(f"{settings.PASSWORD_RESET_CACHE_PREFIX}{token}")
    return int(user_id) if user_id is not None else None


async def destroy_password_reset_token(redis: RedisClient, token: str) -> None:
    """Delete the token after use; reading it leaves it in place."""
    await redis.delete(f"{settings.PASSWORD_RESET_CACHE_PREFIX}{token}")
