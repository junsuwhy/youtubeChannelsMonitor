from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    youtube_api_key: str = ""
    database_url: str = "sqlite+aiosqlite:///./data/app.db"
    environment: str = "development"
    timezone: str = "Asia/Taipei"  # UTC+8

    # JWT settings
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
