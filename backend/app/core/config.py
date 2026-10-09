from typing import Any, Annotated, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode
from pydantic import computed_field, PostgresDsn, RedisDsn, HttpUrl, field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="./.env", env_ignore_empty=True, extra="ignore"
    )

    # === FastApi settings ==================================================================================================================
    ENVIRONMENT: Literal["DEV", "PROD"] = "DEV"
    API_VERSION: str = "0.1.0"
    API_ROOT_PATH: str = "/api/v1"
    BACKEND_CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    ALLOWED_DOMAINS: Annotated[list[str], NoDecode] = ["ripplelinks.com"]
    FRONTEND_URL: HttpUrl = "http://localhost:5173"
    PUBLIC_API_URL: HttpUrl

    # === Worker settings=====================================================================================================================
    WORKER_QUEUE_NAME: str = "rl_pulse"
    STALE_QUEUE_MINUTES: int = 5
    STALE_RUNNING_MINUTES: int = 30

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
    DB_MAX_OVERFLOW: int = 20           # no. of overflow connections during extra load
    DB_POOL_TIMEOUT: int = 30           # no. of seconds after which connection times out
    DB_POOL_RECYCLE: int = 1800         # no. of seconds after which connections in the db pool get refreshed
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

    OAUTH_STATE_CACHE_PREFIX: str = "oauth_state:"
    OAUTH_STATE_CACHE_TTL: int = 5 * 60

    SESSION_CACHE_PREFIX: str = "auth_session:"
    SESSION_CACHE_TTL: int = 12 * 60 * 60

    USER_SESSIONS_CACHE_PREFIX: str = "user_sessions:"

    EMAIL_VERIFY_CACHE_PREFIX: str = "email_verify:"
    EMAIL_VERIFICATION_CACHE_TTL: int = 24 * 60 * 60

    PASSWORD_RESET_CACHE_PREFIX: str = "password_reset:"
    PASSWORD_RESET_CACHE_TTL: int = 10 * 60

    FACETS_CACHE_PREFIX: str = "facets:"
    FACETS_CACHE_TTL: int = 24 * 60 * 60

    SUGGEST_CACHE_PREFIX: str = "suggest:"
    SUGGEST_CACHE_TTL: int = 5 * 60

    SEARCH_CACHE_PREFIX: str = "search:"
    SEARCH_CACHE_TTL: int = 60

    AI_CACHE_PREFIX: str = "ai:"
    AI_CACHE_TTL: int = 30 * 24 * 60 * 60

    RATE_LIMIT_PREFIX: str = "ratelimit:"

    # an open edit form holds its record for this long; the form renews it every minute
    EDIT_LOCK_CACHE_PREFIX: str = "edit_lock:"
    EDIT_LOCK_CACHE_TTL: int = 2 * 60

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

    # === Apify settings ============================================================================================
    APIFY_API_TOKEN: str
    APIFY_WEBHOOK_SECRET: str
    APIFY_IG_PROFILE_ACTOR: str = "apify/instagram-profile-scraper"
    APIFY_REFRESH_AFTER_DAYS: int = 30
    APIFY_REFRESH_BATCH: int = 500
    APIFY_RECONCILE_AFTER_MINUTES: int = 10

    # === AI Parser settings ============================================================================================
    AI_API_KEY: str
    AI_MODEL: str = "claude-haiku-4-5"
    AI_BATCH_SIZE: int = 25
    AI_CONCURRENCY: int = 4
    AI_TIMEOUT: int = 90
    AI_MAX_ATTEMPTS: int = 2

    # === Observability: Opentelemetry -> Grafana ============================================================================================
    LOG_LEVEL: str= "INFO"
    OTEL_ENABLED: bool= False
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4318"
    OTEL_EXPORTER_OTLP_HEADERS: str = "" # "Authorization=Basic <base64 of instanceId:token>", from grafana cloud
    OTEL_METRIC_INTERVAL_SECONDS: int = 60

    # === Alerts: `python -m app.oversability.alerts` pushes these to Grafana ================================================================
    GRAFANA_URL: str = "http://localhost:3000"
    GRAFANA_TOKEN: str = "" # service account token; empty = admin/admin (local otel-lgtm only)
    GRAFANA_PROMETHEUS_UID: str = ""
    ALERT_EMAILS: Annotated[list[str], NoDecode]= ["automations@ripplelinks.com"]
    ALERT_APIFY_OVERDUE_MINUTES: int = 60
    ALERT_WORKER_SILENT_MINUTES: int = 15

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

    @field_validator("ALLOWED_DOMAINS", "BACKEND_CORS_ORIGINS", "ALERT_EMAILS", mode="before")
    @classmethod
    def domain_parser(cls, v: Any) -> Any:
        if v is None or v == "":
            return list()
        if isinstance(v, str):
            return [d.strip().lower() for d in v.split(",") if d.strip()]
        return v


settings = Settings()
