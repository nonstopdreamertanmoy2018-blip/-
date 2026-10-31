from __future__ import annotations


def login_headers(client, username: str, password: str) -> dict[str, str]:
    res = client.post("/auth/token", data={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_admin_user_creation_and_immediate_deactivation_revocation(client):
    admin_headers = login_headers(client, "admin", "ChangeThis-Immediately-123!")

    # Create an accountant user
    created = client.post(
        "/users",
        headers=admin_headers,
        json={
            "username": "tasnim_acc",
            "password": "StrongPassword-2026!",
            "full_name_en": "Tasnim Rahman (Demo)",
            "full_name_bn": "তাসনিম রহমান (ডেমো)",
            "email": "tasnim@nextgen-demo.example",
            "role": "accountant",
        },
    )
    assert created.status_code == 201, created.text
    uid = created.json()["id"]

    # User logs in and accesses /auth/me
    user_headers = login_headers(client, "tasnim_acc", "StrongPassword-2026!")
    me_ok = client.get("/auth/me", headers=user_headers)
    assert me_ok.status_code == 200
    assert me_ok.json()["role"] == "accountant"
    assert "journals:approve" in me_ok.json()["permissions"]

    # Admin cannot deactivate their own active account
    admin_me = client.get("/auth/me", headers=admin_headers).json()
    self_deact = client.patch(
        f"/users/{admin_me['id']}/status",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert self_deact.status_code == 422

    # Admin deactivates tasnim_acc
    deact = client.patch(
        f"/users/{uid}/status",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert deact.status_code == 200
    assert deact.json()["is_active"] is False

    # Existing bearer token is immediately rejected (401)
    me_revoked = client.get("/auth/me", headers=user_headers)
    assert me_revoked.status_code == 401

    # Subsequent login attempts also fail (401)
    relogin = client.post(
        "/auth/token",
        data={"username": "tasnim_acc", "password": "StrongPassword-2026!"},
    )
    assert relogin.status_code == 401


def test_configurable_permission_matrix_across_all_six_roles(client):
    admin_headers = login_headers(client, "admin", "ChangeThis-Immediately-123!")

    # Provision synthetic users for the remaining 5 roles
    roles_to_create = ["accountant", "hr", "project_manager", "sales", "employee"]
    tokens: dict[str, dict[str, str]] = {"admin": admin_headers}
    for r in roles_to_create:
        res = client.post(
            "/users",
            headers=admin_headers,
            json={
                "username": f"user_{r}",
                "password": "RolePassword-2026!",
                "full_name_en": f"Demo {r}",
                "role": r,
            },
        )
        assert res.status_code == 201
        tokens[r] = login_headers(client, f"user_{r}", "RolePassword-2026!")

    # Employee cannot create Chart of Accounts (403)
    emp_acc = client.post(
        "/accounts",
        headers=tokens["employee"],
        json={"code": "1999", "name_en": "Unauthorized Account", "account_type": "asset"},
    )
    assert emp_acc.status_code == 403

    # Sales can create a Quotation document (201), but cannot view Trial Balance (403)
    sales_quote = client.post(
        "/documents",
        headers=tokens["sales"],
        json={
            "doc_type": "quotation",
            "issue_date": "2026-10-20",
            "party_name_en": "Delta Retail Ltd (Demo)",
            "subject_en": "POS Integration Proposal",
            "items": [
                {"description_en": "POS Sync Engine", "quantity": "1.00", "unit_price": "45000.00"}
            ],
        },
    )
    assert sales_quote.status_code == 201
    assert sales_quote.json()["doc_number"].startswith("QT-2026-")

    sales_tb = client.get("/reports/trial-balance", headers=tokens["sales"])
    assert sales_tb.status_code == 403

    # HR initially does NOT have journals:view (403)
    hr_journals_before = client.get("/journals", headers=tokens["hr"])
    assert hr_journals_before.status_code == 403

    # Admin fetches matrix, grants journals:view to HR, and saves
    matrix_data = client.get("/permissions/matrix", headers=admin_headers).json()
    updated_matrix = matrix_data["matrix"]
    updated_matrix["hr"]["journals:view"] = True

    put_res = client.put(
        "/permissions/matrix",
        headers=admin_headers,
        json={"matrix": updated_matrix},
    )
    assert put_res.status_code == 200

    # Now HR can read /journals immediately (200)
    hr_journals_after = client.get("/journals", headers=tokens["hr"])
    assert hr_journals_after.status_code == 200

    # Governance safeguard: Admin cannot strip permissions:manage from admin role
    updated_matrix["admin"]["permissions:manage"] = False
    bad_lockout = client.put(
        "/permissions/matrix",
        headers=admin_headers,
        json={"matrix": updated_matrix},
    )
    assert bad_lockout.status_code == 422
