from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Configure isolated test environment variables BEFORE importing app modules
_tmp_db_dir = tempfile.mkdtemp(prefix="nextgen_erp_test_")
_test_db_path = Path(_tmp_db_dir) / "test_erp.db"

os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"
os.environ["JWT_SECRET"] = "test-only-deterministic-jwt-secret-key-2026"
os.environ["BOOTSTRAP_ADMIN_USERNAME"] = "admin"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "ChangeThis-Immediately-123!"
os.environ["SEED_DEMO_DATA"] = "false"

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import bootstrap_database  # noqa: E402


@pytest.fixture(autouse=True)
def reset_test_database():
    """Ensure every test runs against a clean, deterministic schema with bootstrap admin & default RBAC matrix."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    bootstrap_database(seed_demo=False)
    yield


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db_session():
    with SessionLocal() as session:
        yield session
