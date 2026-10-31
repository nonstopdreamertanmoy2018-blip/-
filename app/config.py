from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present in local development
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

APP_NAME: str = os.getenv("APP_NAME", "NEXTGEN TECHNIX LIMITED ERP")
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./erp_dev.db")
JWT_SECRET: str = os.getenv("JWT_SECRET", "development-only-change-this-secret-32bytes-minimum")
JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))
BOOTSTRAP_ADMIN_USERNAME: str = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin")
BOOTSTRAP_ADMIN_PASSWORD: str = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "ChangeThis-Immediately-123!")
SEED_DEMO_DATA: bool = os.getenv("SEED_DEMO_DATA", "false").lower() in ("1", "true", "yes")

if (
    JWT_SECRET in ("development-only-change-this-secret", "development-only-change-this-secret-32bytes-minimum", "REPLACE_WITH_A_LONG_RANDOM_SECRET")
    and ENVIRONMENT == "production"
):
    raise RuntimeError("Set a strong unique JWT_SECRET before production deployment.")
