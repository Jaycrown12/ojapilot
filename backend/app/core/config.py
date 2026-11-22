from pathlib import Path
from typing import List, Union
import json
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve absolute directory paths
CURRENT_FILE = Path(__file__).resolve()
CORE_DIR = CURRENT_FILE.parent
APP_DIR = CORE_DIR.parent
BACKEND_DIR = APP_DIR.parent
ROOT_DIR = BACKEND_DIR.parent

# Env file lookup priority: backend/.env, root/.env, .env
ENV_FILES = [
    BACKEND_DIR / ".env",
    ROOT_DIR / ".env",
    Path(".env"),
]


class Settings(BaseSettings):
    PROJECT_NAME: str = "OJAPILOT API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # CORS origins (supports both comma-separated string or list)
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [item.strip() for item in v.split(",") if item.strip()]
        elif isinstance(v, list):
            return v
        return ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Supabase credentials (populated via environment variables or default to active project)
    SUPABASE_URL: str = "https://gjiulkrjqbkijmsbamze.supabase.co"
    SUPABASE_ANON_KEY: str = "sb_publishable_eyKwVGRfcg87uF3TbkkXIQ_o_vZvCvS"
    SUPABASE_SERVICE_ROLE_KEY: str = "sb_secret_dKaQU-1y0s5E92YN0ErSAA_0b-V6v9I"

    # Google GenAI / Gemini credentials
    GEMINI_API_KEY: str = "AQ.Ab8RN6IwcsM64UiS292yoc-dFAuuTqDIVCC6Tg2XRpqu6f8n7Q"

    model_config = SettingsConfigDict(
        env_file=[str(f) for f in ENV_FILES if f.exists()] or ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
