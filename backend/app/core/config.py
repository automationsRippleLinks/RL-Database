from typing import Any, Annotated, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from pydantic import computed_field, PostgresDsn, RedisDsn, HttpUrl, field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env", env_ignore_empty=True, extra="ignore"
    )

    # === FastApi settings ==================================================================================================================
    ENVIRONMENT: Literal["DEV", "PROD"] = "DEV"
    API_VERSION: str = "0.1.0"
    API_ROOT_PATH: str = "/api/v1"
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    ALLOWED_DOMAINS: Annotated[list[str], NoDecode] = ["ripplelinks.com"]
    FRONTEND_URL: HttpUrl = "http://localhost:5173"

    # === DB settings ========================================================================================================================
    DB_TYPE: str = "postgresql"
    DB_DRIVER: str = "asyncpg"
    DB_DRIVER_MIGRATION: str = "psycopg2"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USERNAME: str = ""
    DB_PASSWORD: str = ""
    DB_NAME: str = "RL_DB_DEV"
    DB_ECHO: bool = False
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

    # === REDIS settings =====================================================================================================================
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

    REDIS_CACHE_VERSION: str = "v1"

    OAUTH_STATE_PREFIX: str = "oauth_state:"
    OAUTH_STATE_TTL: int = 5 * 60

    SESSION_PREFIX: str = "auth_session:"
    SESSION_TTL: int = 12 * 60 * 60

    USER_SESSIONS_PREFIX: str = "user_sessions:"

    EMAIL_VERIFY_PREFIX: str = "email_verify:"
    EMAIL_VERIFICATION_TTL: int = 24 * 60 * 60

    PASSWORD_RESET_PREFIX: str = "password_reset:"
    PASSWORD_RESET_TTL: int = 10 * 60

    FACETS_PREFIX: str = "facets:"
    FACETS_TTL: int = 24 * 60 * 60

    SUGGEST_PREFIX: str = "suggest:"
    SUGGEST_TTL: int = 5 * 60

    SEARCH_PREFIX: str = "search:"
    SEARCH_TTL: int = 60

    RATE_LIMIT_PREFIX: str = "ratelimit:"

    # === Google OAuth settings ==============================================================================================================
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    GOOGLE_AUTH_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_TOKEN_URL: str = "https://oauth2.googleapis.com/token"

    # === MAIL settings =====================================================================================================================
    RL_LOGO_CDN_URL: HttpUrl
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "automations@ripplelinks.com"
    SMTP_PASSWORD: str
    SMTP_FROM: str = "Automation RL <automations@ripplelinks.com>"

    @field_validator("ALLOWED_DOMAINS", "BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def domain_parser(cls, v: Any) -> Any:
        if v is None or v == "":
            return list()
        if isinstance(v, str):
            return [d.strip().lower() for d in v.split(",") if d.strip()]
        return v

    # === Apps Script endpoint settings ======================================================================================================
    APPS_SCRIPT_API_SECRET: str
    APPS_SCRIPT_API_URL: HttpUrl
    APPS_SCRIPT_API_CALL_TIMEOUT: int = 300

    # === Ingestion pipeline settings =========================================================================================================
    MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024
    MAX_STORED_ERRORS: int = 500
    PG_MAX_PARAMS: int = 32767
    GSTIN_REGEX: str = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"

    # === Search related settings =============================================================================================================
    MAX_PAGE_SIZE: int = 500
    BRAND_DETAIL_LIMIT: int = 100
    TOP_CREATORS_LIMIT: int = 10


settings = Settings()
