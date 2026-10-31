from __future__ import annotations

from decimal import Decimal


def get_admin_headers(client) -> dict[str, str]:
    response = client.post(
        "/auth/token",
        data={"username": "admin", "password": "ChangeThis-Immediately-123!"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_balanced_journal_and_reject_unbalanced(client):
    headers = get_admin_headers(client)

    cash = client.post(
        "/accounts",
        headers=headers,
        json={"code": "1000", "name_en": "Cash", "name_bn": "নগদ", "account_type": "asset"},
    )
    assert cash.status_code == 200, cash.text
    cash_id = cash.json()["id"]
    assert cash.json()["normal_balance"] == "debit"

    capital = client.post(
        "/accounts",
        headers=headers,
        json={"code": "3000", "name_en": "Owner Equity", "name_bn": "মালিকানা মূলধন", "account_type": "equity"},
    )
    assert capital.status_code == 200, capital.text
    capital_id = capital.json()["id"]
    assert capital.json()["normal_balance"] == "credit"

    good = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-01-01",
            "memo": "Opening capital test",
            "lines": [
                {"account_id": cash_id, "debit": "1000.00", "credit": "0.00"},
                {"account_id": capital_id, "debit": "0.00", "credit": "1000.00"},
            ],
        },
    )
    assert good.status_code == 200, good.text
    assert Decimal(good.json()["total_debit"]) == Decimal("1000.00")
    assert Decimal(good.json()["total_credit"]) == Decimal("1000.00")
    assert good.json()["status"] == "posted"

    bad = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-01-02",
            "memo": "Unbalanced test",
            "lines": [
                {"account_id": cash_id, "debit": "1000.00", "credit": "0.00"},
                {"account_id": capital_id, "debit": "0.00", "credit": "900.00"},
            ],
        },
    )
    assert bad.status_code == 422


def test_reject_both_debit_and_credit_or_zero_lines(client):
    headers = get_admin_headers(client)
    a1 = client.post("/accounts", headers=headers, json={"code": "1010", "name_en": "Bank", "account_type": "asset"}).json()["id"]
    a2 = client.post("/accounts", headers=headers, json={"code": "4010", "name_en": "Revenue", "account_type": "revenue"}).json()["id"]

    # Both debit and credit on same line -> 422
    both_same_line = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-02-01",
            "memo": "Invalid simultaneous debit and credit",
            "lines": [
                {"account_id": a1, "debit": "500.00", "credit": "500.00"},
                {"account_id": a2, "debit": "0.00", "credit": "0.00"},
            ],
        },
    )
    assert both_same_line.status_code == 422

    # Zero debit and zero credit -> 422
    zero_lines = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-02-01",
            "memo": "Zero value lines",
            "lines": [
                {"account_id": a1, "debit": "0.00", "credit": "0.00"},
                {"account_id": a2, "debit": "0.00", "credit": "0.00"},
            ],
        },
    )
    assert zero_lines.status_code == 422


def test_duplicate_account_code_rejected_409(client):
    headers = get_admin_headers(client)
    first = client.post(
        "/accounts",
        headers=headers,
        json={"code": "2050", "name_en": "Accounts Payable", "name_bn": "প্রদেয় হিসাব", "account_type": "liability"},
    )
    assert first.status_code == 200

    duplicate = client.post(
        "/accounts",
        headers=headers,
        json={"code": "2050", "name_en": "Duplicate Payable", "account_type": "liability"},
    )
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.json()["detail"].lower()


def test_invalid_and_inactive_accounts_rejected(client):
    headers = get_admin_headers(client)
    cash_id = client.post(
        "/accounts",
        headers=headers,
        json={"code": "1001", "name_en": "Cash Account", "account_type": "asset"},
    ).json()["id"]
    expense_id = client.post(
        "/accounts",
        headers=headers,
        json={"code": "5001", "name_en": "Rent Expense", "account_type": "expense"},
    ).json()["id"]

    # Non-existent account ID 999999
    missing_acc = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-03-01",
            "memo": "Missing account test",
            "lines": [
                {"account_id": cash_id, "debit": "0.00", "credit": "250.00"},
                {"account_id": 999999, "debit": "250.00", "credit": "0.00"},
            ],
        },
    )
    assert missing_acc.status_code == 422
    assert "999999" in missing_acc.json()["detail"]

    # Deactivate expense account and verify postings are blocked
    deact = client.patch(f"/accounts/{expense_id}", headers=headers, json={"is_active": False})
    assert deact.status_code == 200
    assert deact.json()["is_active"] is False

    inactive_post = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-03-02",
            "memo": "Attempt posting to inactive account",
            "lines": [
                {"account_id": expense_id, "debit": "400.00", "credit": "0.00"},
                {"account_id": cash_id, "debit": "0.00", "credit": "400.00"},
            ],
        },
    )
    assert inactive_post.status_code == 422
    assert "inactive" in inactive_post.json()["detail"].lower()


def test_journal_approval_workflow_general_ledger_and_verified_trial_balance(client):
    headers = get_admin_headers(client)

    # Create accounts with balanced opening balances (100,000 DR == 100,000 CR)
    bank_id = client.post(
        "/accounts",
        headers=headers,
        json={
            "code": "1020",
            "name_en": "Operating Bank",
            "account_type": "asset",
            "opening_debit": "100000.00",
            "opening_credit": "0.00",
        },
    ).json()["id"]
    equity_id = client.post(
        "/accounts",
        headers=headers,
        json={
            "code": "3010",
            "name_en": "Share Capital",
            "account_type": "equity",
            "opening_debit": "0.00",
            "opening_credit": "100000.00",
        },
    ).json()["id"]
    rev_id = client.post(
        "/accounts",
        headers=headers,
        json={"code": "4010", "name_en": "Software Revenue", "account_type": "revenue"},
    ).json()["id"]
    exp_id = client.post(
        "/accounts",
        headers=headers,
        json={"code": "5010", "name_en": "Cloud Expense", "account_type": "expense"},
    ).json()["id"]

    # 1. Create a Draft journal -> must NOT affect Trial Balance yet
    draft_res = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-10-05",
            "memo": "Client milestone billing",
            "workflow_action": "draft",
            "lines": [
                {"account_id": bank_id, "debit": "50000.00", "credit": "0.00"},
                {"account_id": rev_id, "debit": "0.00", "credit": "50000.00"},
            ],
        },
    )
    assert draft_res.status_code == 200
    j_id = draft_res.json()["id"]
    assert draft_res.json()["status"] == "draft"

    tb_before = client.get("/reports/trial-balance/verified", headers=headers).json()
    assert Decimal(tb_before["total_period_debit"]) == Decimal("0.00")
    assert tb_before["verification"]["excluded_unposted_journals"] == 1

    # 2. Submit for approval -> status becomes pending_approval, still excluded from Trial Balance
    sub_res = client.post(f"/journals/{j_id}/submit", headers=headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "pending_approval"

    # 3. Approve -> posts to General Ledger & Trial Balance
    app_res = client.post(f"/journals/{j_id}/approve", headers=headers)
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "posted"
    assert app_res.json()["approved_by"] is not None

    # 4. Post an expense entry directly
    exp_res = client.post(
        "/journals",
        headers=headers,
        json={
            "entry_date": "2026-10-10",
            "memo": "Pay cloud hosting",
            "workflow_action": "direct_post",
            "lines": [
                {"account_id": exp_id, "debit": "12000.00", "credit": "0.00"},
                {"account_id": bank_id, "debit": "0.00", "credit": "12000.00"},
            ],
        },
    )
    assert exp_res.status_code == 200

    # 5. Verify General Ledger running balance on Operating Bank:
    # Opening 100,000 DR + 50,000 DR - 12,000 CR = 138,000.00 DR
    gl = client.get(f"/reports/general-ledger?account_id={bank_id}", headers=headers)
    assert gl.status_code == 200
    gl_data = gl.json()
    assert Decimal(gl_data["opening_balance"]) == Decimal("100000.00")
    assert gl_data["opening_side"] == "DR"
    assert Decimal(gl_data["closing_balance"]) == Decimal("138000.00")
    assert gl_data["closing_side"] == "DR"
    assert len(gl_data["movements"]) == 2

    # 6. Verify Mathematically Verified Trial Balance
    # Closing DR: Bank (138,000) + Cloud Expense (12,000) = 150,000.00
    # Closing CR: Share Capital (100,000) + Software Revenue (50,000) = 150,000.00
    vtb = client.get("/reports/trial-balance/verified", headers=headers)
    assert vtb.status_code == 200
    vtb_data = vtb.json()
    assert Decimal(vtb_data["total_opening_debit"]) == Decimal("100000.00")
    assert Decimal(vtb_data["total_opening_credit"]) == Decimal("100000.00")
    assert Decimal(vtb_data["total_period_debit"]) == Decimal("62000.00")
    assert Decimal(vtb_data["total_period_credit"]) == Decimal("62000.00")
    assert Decimal(vtb_data["total_closing_debit"]) == Decimal("150000.00")
    assert Decimal(vtb_data["total_closing_credit"]) == Decimal("150000.00")
    assert vtb_data["verification"]["is_opening_balanced"] is True
    assert vtb_data["verification"]["is_movement_balanced"] is True
    assert vtb_data["verification"]["is_closing_balanced"] is True
    assert vtb_data["verification"]["ledger_reconciled"] is True
    assert Decimal(vtb_data["verification"]["reconciliation_discrepancy"]) == Decimal("0.00")
    assert vtb_data["verification"]["abnormal_balance_codes"] == []
