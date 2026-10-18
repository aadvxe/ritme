"""Settings from environment (names documented in .env.example). No secrets in code."""

from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    role: str = "api"  # api | worker
    environment: str = "local"
    log_level: str = "info"

    # GCP / LLM (read by the AI engine; kept here so the backend can report them in /privacy)
    gcp_project_id: str = ""
    gcp_region: str = "asia-southeast2"
    vertex_location: str = "us-central1"
    llm_provider: str = "fake"
    llm_model_fast: str = "gemini-3.1-flash-lite"
    llm_model_plan: str = "gemini-3.1-flash-lite"
    llm_timeout_ms: int = 30_000
    agent_max_steps: int = 8

    # Database
    database_url: str = "postgresql+psycopg://ritme:ritme_local_only@localhost:5433/ritme"
    instance_connection_name: str = ""
    db_name: str = ""
    db_user: str = ""
    db_password: str = ""  # from Secret Manager in production

    # Auth
    firebase_project_id: str = "demo-ritme"
    firebase_auth_emulator_host: str = ""
    extension_token_secret: str = ""
    extension_access_ttl_seconds: int = 900
    extension_refresh_ttl_days: int = 30

    # Web / CORS
    allowed_origins: str = "http://localhost:5173"
    extension_id: str = ""
    public_web_url: str = "http://localhost:5173"

    # Limits
    max_capture_chars: int = 20_000
    max_body_bytes: int = 300_000
    rate_limit_per_minute: int = 60

    # Async runs
    run_queue: str = "local"  # local | cloudtasks
    cloud_tasks_queue: str = ""
    worker_url: str = "http://localhost:8081"
    worker_audience: str = ""

    @property
    def resolved_database_url(self) -> str:
        if self.instance_connection_name and self.db_name and self.db_user:
            # Cloud Run built-in Cloud SQL connection (unix socket); no public IP, no key files.
            pw = quote_plus(self.db_password)
            return (
                f"postgresql+psycopg://{self.db_user}:{pw}@/{self.db_name}"
                f"?host=/cloudsql/{self.instance_connection_name}"
            )
        return self.database_url

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        if self.extension_id:
            origins.append(f"chrome-extension://{self.extension_id}")
        return origins

    @property
    def token_secret(self) -> str:
        if self.extension_token_secret:
            return self.extension_token_secret
        if self.environment != "local":
            raise RuntimeError("EXTENSION_TOKEN_SECRET must be set outside local development")
        return "local-dev-only-secret-change-me-0123456789"


@lru_cache
def get_settings() -> Settings:
    return Settings()


_ = Field  # re-exported for convenience in tests
