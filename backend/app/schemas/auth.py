"""Sign-in, sign-up and session shapes. Work emails only, except where noted."""

from typing import Annotated

from pydantic import EmailStr, AfterValidator, BaseModel, Field
from fastapi import HTTPException, status

from app.core.config import settings
from app.models import User


def is_domain_email(email: EmailStr) -> str:
    """Trim and lowercase and email; refuse any domain outside ALLOWED_DOMAINS.

    The refusal is a 403 (X-Error-Code: domain not allowed) raised from inside
    validation, so the client gets that instead of the usual 422.
    """
    email = email.strip().lower()
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""

    if domain not in settings.ALLOWED_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email domain is not allowed",
            headers={"X-Error-Code": "domain_not_allowed"},
        )
    return email


WorkEmail = Annotated[EmailStr, AfterValidator(is_domain_email)]
ValidPassword = Annotated[str, Field(min_length=8, max_length=50)]


class LoginRequest(BaseModel):
    """Password sign-in. A non-work email gets 403 before the password is checked."""

    email: WorkEmail
    password: ValidPassword


class SignUpRequest(BaseModel):
    """A new password account; it can't sign in until its email is verified."""

    name: str
    email: WorkEmail
    password: ValidPassword


class Permissions(BaseModel):
    """What the user may do, with super admin already folded into each flag."""

    can_ingest: bool
    can_edit: bool = False
    is_admin: bool = False
    is_superadmin: bool = False


class SessionUser(BaseModel):
    """The signed-in user as the frontend sees it, from /auth/me and every sign-in."""

    id: int
    name: str
    email: str
    is_verified: bool
    auth_provider: str
    permissions: Permissions

    @classmethod
    def from_user(cls, user: User) -> "SessionUser":
        """Build from a User; a super admin gets every permission flag set."""
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            is_verified=user.is_verified,
            auth_provider=user.auth_provider,
            permissions=Permissions(
                can_ingest=user.can_ingest or user.is_superadmin,
                can_edit=user.can_edit or user.is_superadmin,
                is_admin=user.is_admin or user.is_superadmin,
                is_superadmin=user.is_superadmin,
            ),
        )


class VerifyEmailRequest(BaseModel):
    """The token from the verification email's link."""

    token: str


class EMailRequest(BaseModel):
    """Resend-verification and forgot-password: just an address, any domain."""

    email: Annotated[EmailStr, AfterValidator(lambda e: e.strip().lower())]


class ResetPasswordRequest(BaseModel):
    """The token from the reset email, plus the new password."""

    token: str
    password: ValidPassword
