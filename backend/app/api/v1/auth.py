from urllib.parse import urlencode
import httpx
import logging

from fastapi import APIRouter, Request, Response, HTTPException, status, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlmodel import select
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.core.config import settings
from app.core.security import (
    hash_password,
    new_token,
    new_csrf_token,
    verify_password,
    create_session,
    destroy_session,
    destroy_other_sessions,
    create_email_verification_token,
    read_email_verification_token,
    destroy_email_verification_token,
    create_password_reset_token,
    read_password_reset_token,
    destroy_password_reset_token,
)
from app.core.rate_limit import check_rate_limit
from app.core.email import (
    verification_email_body,
    password_reset_email_body,
    send_email,
)
from app.api.deps import SessionDep, RedisDep, CurrentUser, CSRFProtected
from app.schemas.auth import (
    SessionUser,
    LoginRequest,
    SignUpRequest,
    VerifyEmailRequest,
    EMailRequest,
    ResetPasswordRequest,
)
from app.models import User

log = logging.getLogger(__name__)

router = APIRouter()

_DUMMY_HASH = hash_password(new_csrf_token())
IS_PROD = settings.ENVIRONMENT == "PROD"


def _set_session_cookies(response: Response, sid: str, csrf_token: str) -> None:
    response.set_cookie(
        "rl_session",
        sid,
        httponly=True,
        secure=IS_PROD,
        samesite="lax",
        path="/",
        max_age=settings.SESSION_CACHE_TTL,
    )
    response.set_cookie(
        "csrf_token",
        csrf_token,
        httponly=False,
        secure=IS_PROD,
        samesite="lax",
        path="/",
        max_age=settings.SESSION_CACHE_TTL,
    )


async def _start_session(response: Response, redis, user_id: int) -> str:
    """New session + CSRF token, both as cookies. Returns the session id."""
    sid = await create_session(redis, user_id)
    _set_session_cookies(response, sid, new_csrf_token())
    return sid


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _send_verification(
    background_tasks: BackgroundTasks, redis, user: User
) -> None:
    token = await create_email_verification_token(redis, user.id)
    text, html = verification_email_body(
        user.name, f"{settings.FRONTEND_URL}verify-email?token={token}"
    )
    background_tasks.add_task(
        send_email, user.email, "Verify your RippleLinks email", html, text
    )


def _validate_next(next_path: str | None) -> str:
    """Only allow same-origin relative paths. Reject anything that could
    be used as an open redirect (absolute URLs, protocol-relative //, etc)."""
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/"
    return next_path


def _error_redirect(code: str) -> RedirectResponse:
    return RedirectResponse(
        f"{settings.FRONTEND_URL}login?auth_error={code}",
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )


@router.get("/me", response_model=SessionUser)
async def me(user: CurrentUser) -> SessionUser:
    return SessionUser.from_user(user)


@router.post(
    "/login",
    response_model=SessionUser,
    responses={403: {"description": "Domain not allowed"}},
)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    redis: RedisDep,
) -> SessionUser:
    email = body.email

    await check_rate_limit(redis, "login:email", email, limit=5, window=15 * 60)
    await check_rate_limit(
        redis,
        "login:ip",
        _client_ip(request),
        limit=15,
        window=60,
    )

    user = (await session.exec(select(User).where(User.email == email))).first()

    hash_to_check = (
        user.hashed_password if (user and user.hashed_password) else _DUMMY_HASH
    )
    password_ok = verify_password(body.password, hash_to_check)

    if user is None or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"X-Error-Code": "invalid_credentials"},
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not verified",
            headers={"X-Error-Code": "not_verified"},
        )

    await _start_session(response, redis, user.id)
    return SessionUser.from_user(user)


@router.get("/google/login")
async def google_login(request: Request, redis: RedisDep, next: str | None = None):
    safe_next = _validate_next(next)

    state = new_token()
    await redis.setex(
        f"{settings.OAUTH_STATE_CACHE_PREFIX}{state}",
        settings.OAUTH_STATE_CACHE_TTL,
        safe_next,
    )

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "hd": "ripplelinks.com",
        "prompt": "select_account",
    }
    return RedirectResponse(
        f"{settings.GOOGLE_AUTH_URL}?{urlencode(params)}",
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    # user declined conset on Google's screen - no code, no state to check.
    if error:
        return _error_redirect("google_denied")

    if not code or not state:
        return _error_redirect("unknown")

    # State must match what we stored, and is single-use.
    state_key = f"{settings.OAUTH_STATE_CACHE_PREFIX}{state}"
    safe_next = await redis.get(state_key)
    if safe_next is None:
        return _error_redirect("state_mismatch")
    await redis.delete(state_key)

    # Exchange the code for tokens. This call carries the client secret
    # and happens server-to-server -- the browser never sees it.
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            settings.GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            },
        )

    if token_resp.status_code != status.HTTP_200_OK:
        return _error_redirect("unknown")

    tokens = token_resp.json()
    raw_id_token = tokens.get("id_token")
    if not raw_id_token:
        return _error_redirect("unknown")

    # Verifies signature, issuer, audience, and expiry against Google's keys.
    try:
        claims = google_id_token.verify_oauth2_token(
            raw_id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,  # 10 second tolerance to account for system clock and google clock time difference
        )
    except ValueError as e:
        log.warning("google id_token verification failed: %s", e)
        return _error_redirect("unknown")

    email: str = claims.get("email")
    if not email:
        return _error_redirect("google_no_email")

    email = email.strip().lower()
    domain = email.rsplit("@", 1)[-1]

    # Check the email claim's domain, not 'hd' -- hd is absent for
    # non-Workspace accounts, so relying on it alone lets those through
    if not claims.get("email_verified") or domain not in settings.ALLOWED_DOMAINS:
        return _error_redirect("domain_not_allowed")

    user = (await session.exec(select(User).where(User.email == email))).first()

    if user is None:
        # First-time Google login: auto-create.
        user = User(
            name=claims.get("name", email),
            email=email,
            auth_provider="google",
            hashed_password=None,
            is_verified=True,
            is_currently_employed=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    if not user.is_verified:
        return _error_redirect("not_verified")

    response = RedirectResponse(
        f"{settings.FRONTEND_URL}auth/callback?next={safe_next}",
        status_code=status.HTTP_302_FOUND,
    )
    await _start_session(response, redis, user.id)
    return response


@router.post(
    "/logout", dependencies=[CSRFProtected], status_code=status.HTTP_204_NO_CONTENT
)
async def logout(request: Request, response: Response, redis: RedisDep) -> None:
    sid = request.cookies.get("rl_session")
    if sid:
        await destroy_session(redis, sid)
    response.delete_cookie("rl_session", path="/")
    response.delete_cookie("csrf_token", path="/")


@router.post(
    "/signup",
    status_code=status.HTTP_201_CREATED,
    response_model=SessionUser,
    responses={403: {"description": "Domain not allowed"}},
)
async def signup(
    body: SignUpRequest,
    session: SessionDep,
    redis: RedisDep,
    background_tasks: BackgroundTasks,
) -> SessionUser:
    existing_user = (
        await session.exec(select(User).where(User.email == body.email))
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
            headers={"X-Error-Code": "email_exists"},
        )

    new_user = User(
        name=body.name,
        email=body.email,
        auth_provider="password",
        hashed_password=hash_password(body.password),
    )

    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    await _send_verification(background_tasks, redis, new_user)
    return SessionUser.from_user(new_user)


@router.post("/verify-email", response_model=SessionUser)
async def verify_email(
    body: VerifyEmailRequest, response: Response, session: SessionDep, redis: RedisDep
) -> SessionUser:
    user_id = await read_email_verification_token(redis, body.token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
            headers={"X-Error-Code": "invalid_token"},
        )
    await destroy_email_verification_token(redis, body.token)

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    if not user.is_verified:
        user.is_verified = True
        user.is_currently_employed = True
        session.add(user)
        await session.commit()
        await session.refresh(user)

    await _start_session(response, redis, user.id)
    return SessionUser.from_user(user)


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
async def resend_verification(
    body: EMailRequest,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    background_tasks: BackgroundTasks,
) -> None:
    await check_rate_limit(
        redis, "resend_verification:email", body.email, limit=3, window=15 * 60
    )
    await check_rate_limit(
        redis,
        "resend_verification:ip",
        _client_ip(request),
        limit=5,
        window=60,
    )

    # Same 204 whether or not the account exists: no address enumeration.
    user = (await session.exec(select(User).where(User.email == body.email))).first()
    if user is not None and not user.is_verified and user.auth_provider == "password":
        await _send_verification(background_tasks, redis, user)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    body: EMailRequest,
    request: Request,
    session: SessionDep,
    redis: RedisDep,
    background_tasks: BackgroundTasks,
) -> None:
    await check_rate_limit(
        redis, "forgot_password:email", body.email, limit=3, window=15 * 60
    )
    await check_rate_limit(
        redis,
        "forgot_password:ip",
        _client_ip(request),
        limit=5,
        window=60,
    )

    user = (await session.exec(select(User).where(User.email == body.email))).first()

    if user is not None and user.auth_provider == "password":
        token = await create_password_reset_token(redis, user.id)
        reset_url = f"{settings.FRONTEND_URL}reset-password?token={token}"
        text, html = password_reset_email_body(user.name, reset_url)
        background_tasks.add_task(
            send_email,
            user.email,
            "Reset password of your RippleLinks database account",
            html,
            text,
        )


@router.post("/reset-password", response_model=SessionUser)
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    redis: RedisDep,
) -> SessionUser:
    await check_rate_limit(
        redis,
        "reset_password:ip",
        _client_ip(request),
        limit=10,
        window=60,
    )

    user_id = await read_password_reset_token(redis, body.token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link",
            headers={"X-Error-Code": "invalid_token"},
        )
    await destroy_password_reset_token(redis, body.token)

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link",
        )

    if user.auth_provider != "password":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link",
            headers={"X-Error-Code": "invalid_token"},
        )

    user.hashed_password = hash_password(body.password)
    session.add(user)
    await session.commit()
    await session.refresh(user)

    sid = await _start_session(response, redis, user.id)
    await destroy_other_sessions(
        redis, user.id, sid
    )  # a reset signs out everywhere else
    return SessionUser.from_user(user)
