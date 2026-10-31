from __future__ import annotations

from decimal import Decimal


def get_admin_headers(client) -> dict[str, str]:
    res = client.post("/auth/token", data={"username": "admin", "password": "ChangeThis-Immediately-123!"})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_zero_opening_balance_reset_and_verification(client):
    headers = get_admin_headers(client)

    # Create accounts with non-zero opening first, then reset to zero
    client.post(
        "/accounts",
        headers=headers,
        json={"code": "1020", "name_en": "Operating Bank", "account_type": "asset", "opening_debit": "500.00"},
    )
    client.post(
        "/accounts",
        headers=headers,
        json={"code": "3010", "name_en": "Share Capital", "account_type": "equity", "opening_credit": "500.00"},
    )

    reset_res = client.post("/accounts/reset-opening-balances", headers=headers)
    assert reset_res.status_code == 200
    for acc in reset_res.json():
        assert Decimal(acc["opening_debit"]) == Decimal("0.00")
        assert Decimal(acc["opening_credit"]) == Decimal("0.00")

    tb = client.get("/reports/trial-balance/verified", headers=headers).json()
    assert Decimal(tb["total_opening_debit"]) == Decimal("0.00")
    assert Decimal(tb["total_opening_credit"]) == Decimal("0.00")


def test_attendance_salary_disbursement_and_accounting_sync(client):
    headers = get_admin_headers(client)

    # Create accounts for salary posting
    bank = client.post(
        "/accounts",
        headers=headers,
        json={"code": "1020", "name_en": "Operating Bank", "account_type": "asset"},
    ).json()
    cap = client.post(
        "/accounts",
        headers=headers,
        json={"code": "3010", "name_en": "Share Capital", "account_type": "equity"},
    ).json()
    sal_exp = client.post(
        "/accounts",
        headers=headers,
        json={"code": "5010", "name_en": "Staff Salaries", "account_type": "expense"},
    ).json()

    # Fund bank via balanced journal (opening balance stays 0.00!)
    client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-10-01",
            "memo": "Capital deposit",
            "lines": [
                {"account_id": bank["id"], "debit": "200000.00", "credit": "0.00"},
                {"account_id": cap["id"], "debit": "0.00", "credit": "200000.00"},
            ],
        },
    )

    # Create Employee
    emp_res = client.post(
        "/hr/employees",
        headers=headers,
        json={
            "emp_code": "EMP-101",
            "full_name_en": "Rafiqul Islam (Demo)",
            "full_name_bn": "রফিকুল ইসলাম (ডেমো)",
            "designation_en": "Senior Engineer",
            "department": "Engineering",
            "basic_salary": "30000.00",
            "house_rent": "15000.00",
            "medical_allowance": "3000.00",
            "transport_allowance": "2000.00",
        },
    )
    assert emp_res.status_code == 201
    emp_id = emp_res.json()["id"]
    assert Decimal(emp_res.json()["gross_salary"]) == Decimal("50000.00")

    # Record attendance (1 present day with 2h overtime, 1 absent day)
    client.post(
        "/hr/attendance/bulk",
        headers=headers,
        json={
            "attendance_date": "2026-10-10",
            "entries": [{"employee_id": emp_id, "status": "present", "overtime_hours": "2.00"}],
        },
    )
    client.post(
        "/hr/attendance/bulk",
        headers=headers,
        json={
            "attendance_date": "2026-10-11",
            "entries": [{"employee_id": emp_id, "status": "absent", "overtime_hours": "0.00"}],
        },
    )

    # Generate October 2026 payroll
    gen_res = client.post(
        "/hr/payroll/generate",
        headers=headers,
        json={"salary_month": "2026-10", "working_days": 26},
    )
    assert gen_res.status_code == 200
    slip = gen_res.json()[0]
    assert slip["present_days"] == 1
    assert slip["absent_days"] == 1
    assert Decimal(slip["absent_deduction"]) == Decimal("1000.00")  # 30,000 / 30 * 1

    # Pay salary -> posts balanced journal + issues Payment Voucher
    pay_res = client.post(
        f"/hr/payroll/{slip['id']}/pay",
        headers=headers,
        json={"payment_date": "2026-10-28", "payment_method": "Bank Transfer", "payment_account_code": "1020"},
    )
    assert pay_res.status_code == 200
    assert pay_res.json()["status"] == "paid"
    assert pay_res.json()["linked_journal_id"] is not None

    # Verify Trial Balance remains 100% balanced with Opening = 0.00
    vtb = client.get("/reports/trial-balance/verified", headers=headers).json()
    assert Decimal(vtb["total_opening_debit"]) == Decimal("0.00")
    assert vtb["verification"]["is_closing_balanced"] is True
    assert vtb["verification"]["ledger_reconciled"] is True
    assert sal_exp["id"] in [r["account_id"] for r in vtb["rows"]]


def test_backup_snapshot_export_and_atomic_restore(client):
    headers = get_admin_headers(client)

    client.post("/accounts", headers=headers, json={"code": "1050", "name_en": "Backup Cash", "account_type": "asset"})
    snap_res = client.post("/backup/snapshots", headers=headers)
    assert snap_res.status_code == 201
    fname = snap_res.json()["filename"]

    export_res = client.get("/backup/export-json", headers=headers)
    assert export_res.status_code == 200
    archive = export_res.json()
    assert "checksum_sha256" in archive

    # Add extra account after snapshot, then restore snapshot and verify state reverts cleanly
    client.post("/accounts", headers=headers, json={"code": "9999", "name_en": "Temporary", "account_type": "expense"})
    assert len(client.get("/accounts", headers=headers).json()) == 2

    restore_res = client.post("/backup/restore", headers=headers, json={"snapshot_filename": fname})
    assert restore_res.status_code == 200
    assert restore_res.json()["checksum_verified"] is True

    accounts_after = client.get("/accounts", headers=headers).json()
    assert len(accounts_after) == 1
    assert accounts_after[0]["code"] == "1050"
