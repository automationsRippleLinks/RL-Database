from typing import Any, Annotated, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from pydantic import computed_field, PostgresDsn, RedisDsn, HttpUrl, field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env", env_ignore_empty=True, extra="ignore"
    )
    # general settings
    ENVIRONMENT: Literal["dev", "prod"] = "dev"
    RL_LOGO_CDN_URL: HttpUrl

    # AUTH Settings
    ALLOWED_DOMAINS: Annotated[list[str], NoDecode] = ["ripplelinks.com"]
    SESSION_TTL_SECONDS: int = 12 * 60 * 60  # 12 hours
    OAUTH_STATE_TTL: int = (
        5 * 60
    )  # 5 minutes, user needs to complete google login in this timeframe
    EMAIL_VERIFICATION_TTL: int = 24 * 60 * 60  # 24 hrs
    PASSWORD_RESET_TTL: int = (
        10 * 60
    )  # 10 minutes, user needs to reset password in this timeframe

    # SMTP settings
    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SMTP_FROM: str = "automations@ripplelinks.com"

    # CORS settings
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("ALLOWED_DOMAINS", "BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def domain_parser(cls, v: Any) -> Any:
        if v is None or v == "":
            return list()
        if isinstance(v, str):
            return [d.strip().lower() for d in v.split(",") if d.strip()]
        return v

    # Frontend settings
    FRONTEND_URL: HttpUrl = "http://localhost:5173"

    # google apps script settings, won't start without these
    APPS_SCRIPT_API_SECRET: str
    APPS_SCRIPT_API_URL: HttpUrl
    APPS_SCRIPT_API_CALL_TIMEOUT: int = 300

    # google OAuth settings
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    GOOGLE_AUTH_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL: str = "https://oauth2.googleapis.com/token"

    # DB settings
    DB_TYPE: str = "postgresql"
    DB_DRIVER: str = "asyncpg"
    DB_DRIVER_MIGRATION: str = "psycopg2"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USERNAME: str = ""
    DB_PASSWORD: str = ""
    DB_NAME: str = ""
    DB_ECHO: bool = False

    @computed_field
    @property
    def DB_URL(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme=f"{self.DB_TYPE}+{self.DB_DRIVER}",
            host=self.DB_HOST,
            port=self.DB_PORT,
            username=self.DB_USERNAME,
            password=self.DB_PASSWORD,
            path=self.DB_NAME,
        )

    # connection pooling
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_PRE_PING: bool = True

    @computed_field
    @property
    def DB_URL_MIGRATION(self) -> PostgresDsn:
        return PostgresDsn.build(
            scheme=f"{self.DB_TYPE}+{self.DB_DRIVER_MIGRATION}",
            host=self.DB_HOST,
            port=self.DB_PORT,
            username=self.DB_USERNAME,
            password=self.DB_PASSWORD,
            path=self.DB_NAME,
        )

    # Redis specific settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PATH: str = "0"
    REDIS_MAX_CONNECTIONS: int = 40

    @computed_field
    @property
    def REDIS_URL(self) -> RedisDsn:
        return RedisDsn.build(
            scheme="redis",
            host=self.REDIS_HOST,
            port=self.REDIS_PORT,
            path=self.REDIS_PATH,
        )


settings = Settings()

# CACHE PREFIXES
CACHE_VERSION = "v1"
FACETS_PREFIX = "facets:"
SEARCH_PREFIX = "search:"
SUGGEST_PREFIX = "suggest:"
RATE_LIMIT_PREFIX = "ratelimit:"
SESSION_PREFIX = "auth_session:"
OAUTH_STATE_PREFIX = "oauth_state:"
USER_SESSIONS_PREFIX = "user_sessions:"
EMAIL_VERIFY_PREFIX = "email_verify:"
PASSWORD_RESET_PREFIX = "password_reset:"

CACHE_REFRESH_PREFIX_LIST = [
    FACETS_PREFIX,
    SEARCH_PREFIX,
    SUGGEST_PREFIX,
    RATE_LIMIT_PREFIX,
]

# CACHE TTLS
FACETS_TTL = 24 * 60 * 60
SUGGEST_TTL = 5 * 60
SEARCH_TTL = 60

# Miscellaneous
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_PAGE_SIZE = 100
MAX_STORED_ERRORS = 500
PG_MAX_PARAMS = 32767
BRAND_DETAIL_LIMIT = 100
TOP_CREATORS_LIMIT = 10
GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
