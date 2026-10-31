from __future__ import annotations

from decimal import Decimal
from pathlib import Path
import tempfile

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.exc import IntegrityError

from app.models import Account, JournalEntry, JournalLine, User


def get_admin_headers(client) -> dict[str, str]:
    res = client.post("/auth/token", data={"username": "admin", "password": "ChangeThis-Immediately-123!"})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_database_rollback_leaves_zero_partial_journal_records(client, db_session):
    headers = get_admin_headers(client)
    cash_id = client.post(
        "/accounts",
        headers=headers,
        json={"code": "1015", "name_en": "Cash Float", "account_type": "asset"},
    ).json()["id"]

    # 1. Endpoint-level rollback: Line 1 is valid, Line 2 references non-existent account 888888
    resp = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-10-15",
            "memo": "Should rollback completely",
            "lines": [
                {"account_id": cash_id, "debit": "5000.00", "credit": "0.00"},
                {"account_id": 888888, "debit": "0.00", "credit": "5000.00"},
            ],
        },
    )
    assert resp.status_code == 422
    assert db_session.scalar(select(func.count(JournalEntry.id))) == 0
    assert db_session.scalar(select(func.count(JournalLine.id))) == 0

    # 2. Direct ORM transaction rollback on database constraint violation (negative debit violates CheckConstraint + FK)
    admin_user = db_session.scalar(select(User).where(User.username == "admin"))
    assert admin_user is not None

    with pytest.raises(IntegrityError):
        entry = JournalEntry(
            voucher_no="JV-ROLLBACK-0001",
            entry_date="2026-10-15",
            memo="Mid-transaction failure test",
            status="posted",
            created_by=admin_user.id,
        )
        db_session.add(entry)
        db_session.flush()  # entry.id assigned inside transaction

        valid_line = JournalLine(
            entry_id=entry.id,
            account_id=cash_id,
            debit=Decimal("1000.00"),
            credit=Decimal("0.00"),
        )
        db_session.add(valid_line)
        db_session.flush()

        # Violates ck_journal_lines_credit_nonneg (credit < 0)
        corrupt_line = JournalLine(
            entry_id=entry.id,
            account_id=cash_id,
            debit=Decimal("0.00"),
            credit=Decimal("-1000.00"),
        )
        db_session.add(corrupt_line)
        db_session.commit()

    db_session.rollback()

    # Verify complete atomicity: neither the parent JournalEntry nor valid_line survived
    assert db_session.scalar(select(func.count(JournalEntry.id))) == 0
    assert db_session.scalar(select(func.count(JournalLine.id))) == 0


def test_alembic_migrations_upgrade_and_downgrade_cycle():
    with tempfile.TemporaryDirectory() as tmpdir:
        mig_db_path = Path(tmpdir) / "alembic_verify.db"
        mig_url = f"sqlite:///{mig_db_path}"

        alembic_cfg = Config("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", mig_url)

        # Upgrade to head
        command.upgrade(alembic_cfg, "head")
        mig_engine = create_engine(mig_url)
        tables_up = set(inspect(mig_engine).get_table_names())
        expected_tables = {
            "users",
            "role_permissions",
            "company_profiles",
            "fiscal_periods",
            "accounts",
            "journal_entries",
            "journal_lines",
            "business_documents",
            "business_document_items",
            "audit_logs",
        }
        assert expected_tables.issubset(tables_up)
        mig_engine.dispose()

        # Downgrade to base
        command.downgrade(alembic_cfg, "base")
        mig_engine_down = create_engine(mig_url)
        tables_down = set(inspect(mig_engine_down).get_table_names())
        assert expected_tables.isdisjoint(tables_down)
        mig_engine_down.dispose()

        # Re-upgrade to head cleanly
        command.upgrade(alembic_cfg, "head")
        mig_engine_reup = create_engine(mig_url)
        assert expected_tables.issubset(set(inspect(mig_engine_reup).get_table_names()))
        mig_engine_reup.dispose()


def test_all_five_printable_templates_and_closed_fiscal_period_guard(client):
    headers = get_admin_headers(client)

    # Create all 5 required printable document types
    doc_payloads = [
        {
            "doc_type": "letterhead",
            "issue_date": "2026-10-20",
            "party_name_en": "Synthetic Partner Ltd",
            "subject_en": "Official Letterhead Test",
            "body_en": "Official bilingual test correspondence.",
            "items": [],
        },
        {
            "doc_type": "payment_voucher",
            "issue_date": "2026-10-20",
            "party_name_en": "Dhaka Fiber ISP (Demo)",
            "subject_en": "Bandwidth Payment",
            "items": [{"description_en": "Dedicated Fiber Link", "quantity": "1.00", "unit_price": "15000.00"}],
        },
        {
            "doc_type": "receipt",
            "issue_date": "2026-10-20",
            "party_name_en": "Bengal Logistics (Demo)",
            "subject_en": "Advance Retainer Receipt",
            "items": [{"description_en": "AMC Q4 Retainer", "quantity": "1.00", "unit_price": "30000.00"}],
        },
        {
            "doc_type": "quotation",
            "issue_date": "2026-10-20",
            "party_name_en": "Karnafuli Traders (Demo)",
            "subject_en": "Inventory Module Quotation",
            "items": [{"description_en": "Custom Module Build", "quantity": "1.00", "unit_price": "120000.00"}],
        },
        {
            "doc_type": "invoice",
            "issue_date": "2026-10-20",
            "party_name_en": "Jamuna Agro (Demo)",
            "subject_en": "Phase 1 Delivery Invoice",
            "items": [{"description_en": "ERP Deployment", "quantity": "1.00", "unit_price": "95000.00"}],
        },
    ]

    expected_prefixes = ["LH-2026-", "PV-2026-", "MR-2026-", "QT-2026-", "INV-2026-"]
    for payload, prefix in zip(doc_payloads, expected_prefixes):
        r = client.post("/documents", headers=headers, json=payload)
        assert r.status_code == 201, r.text
        assert r.json()["doc_number"].startswith(prefix)
        html_r = client.get(f"/documents/{r.json()['id']}/html", headers=headers)
        assert html_r.status_code == 200
        assert "NEXTGEN TECHNIX LIMITED" in html_r.text

    # Fiscal period lock safeguard test
    fp = client.post(
        "/fiscal-periods",
        headers=headers,
        json={"name": "Closed Q1 2025", "start_date": "2025-01-01", "end_date": "2025-03-31"},
    )
    assert fp.status_code == 201
    fp_id = fp.json()["id"]
    lock_res = client.post(f"/fiscal-periods/{fp_id}/toggle-close", headers=headers)
    assert lock_res.status_code == 200
    assert lock_res.json()["is_closed"] is True

    a1 = client.post("/accounts", headers=headers, json={"code": "1090", "name_en": "Cash", "account_type": "asset"}).json()["id"]
    a2 = client.post("/accounts", headers=headers, json={"code": "4090", "name_en": "Sales", "account_type": "revenue"}).json()["id"]

    blocked = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2025-02-15",
            "memo": "Backdated into closed period",
            "lines": [
                {"account_id": a1, "debit": "500.00", "credit": "0.00"},
                {"account_id": a2, "debit": "0.00", "credit": "500.00"},
            ],
        },
    )
    assert blocked.status_code == 422
    assert "closed fiscal period" in blocked.json()["detail"].lower()
