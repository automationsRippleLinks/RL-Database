from typing import Annotated

from pydantic import EmailStr, AfterValidator, BaseModel, Field
from fastapi import HTTPException, status

from app.core.config import settings
from app.models import User


def is_domain_email(email: EmailStr) -> str:
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
    email: WorkEmail
    password: ValidPassword


class SignUpRequest(BaseModel):
    name: str
    email: WorkEmail
    password: ValidPassword


class Permissions(BaseModel):
    can_ingest: bool
    can_edit: bool = False
    is_admin: bool = False
    is_superadmin: bool = False


class SessionUser(BaseModel):
    id: int
    name: str
    email: str
    is_verified: bool
    auth_provider: str
    permissions: Permissions

    @classmethod
    def from_user(cls, user: User) -> "SessionUser":
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            is_verified=user.is_verified,
            auth_provider=user.auth_provider,
            permissions=Permissions(
                can_ingest=user.can_ingest,
                can_edit=user.can_edit,
                is_admin=user.is_admin or user.is_superadmin,
                is_superadmin=user.is_superadmin,
            ),
        )


class VerifyEmailRequest(BaseModel):
    token: str


class EMailRequest(BaseModel):
    """Resend-verification and forgot-password: just an address, any domain."""

    email: Annotated[EmailStr, AfterValidator(lambda e: e.strip().lower())]


class ResetPasswordRequest(BaseModel):
    token: str
    password: ValidPassword
