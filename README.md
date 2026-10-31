# Next Generation Company Limited ERP — Salary, Payment, Attendance, Accounting & Backup Suite (v0.3)

Bilingual (**English / বাংলা**) colorful corporate ERP built on **FastAPI**, **SQLAlchemy 2.0**, **Alembic**, **Argon2id**, and **React 19 + TypeScript + Tailwind CSS**.

> **Important Safeguard**: This repository contains **synthetic demonstration data only** (`DEMO`). All Chart of Accounts opening balances default strictly to **`0.00 BDT`**.

---

## 1. Core Implemented Capabilities

1. **Salary Disbursement & Instant Payment Center (`/hr/payroll`, `/hr/quick-payment`)**:
   - Automatic monthly payslip calculation from employee attendance, absent/half-day deductions, and overtime hours (`1.5x`).
   - Bonus, Salary Advance recovery, and TDS tax adjustment editor.
   - One-click **Pay Now** & **Pay All Pending** actions that disburse salaries, post balanced Double-Entry Journal Vouchers (`DR 5010 Salaries / CR 1020 Bank`), and issue sequential `PV-YYYY-XXXX` Payment Vouchers.
   - **Quick Vendor / Bill Payment** composer posting balanced journals and colorful Payment Vouchers in a single step.
2. **Daily & Monthly Attendance Maintenance (`/hr/attendance`, `/hr/employees`)**:
   - Daily attendance register (`Present`, `Late`, `Half-Day`, `Leave`, `Absent`, `Holiday`) with check-in/out times, overtime hours, and one-click **Mark All Present**.
   - Monthly attendance summary matrix and active employee salary structure roster.
3. **Database Backup & Recovery Vault (`/backup/*`) + Zero Opening Balance (`0.00 BDT`)**:
   - All accounts start with **`0.00` Opening Balance** plus one-click `POST /api/accounts/reset-opening-balances`.
   - Server-side timestamped snapshots (`POST /api/backup/snapshots`), downloadable SHA-256 verified JSON archive (`GET /api/backup/export-json`), online hot SQLite `.db` binary download (`GET /api/backup/export-sqlite`), and atomic SHA-256 verified restore (`POST /api/backup/restore`).
4. **Universal Full-Color Print Engine (Active Across Every Module)**:
   - Embedded Company Emblem (`/company-logo.jpg`), Dhaka HQ & Office Workspace banners, and `print-color-adjust: exact` A4 print layouts for **Salary Payslips**, **Master Salary Sheets**, **Daily & Monthly Attendance Registers**, **Letterheads**, **Payment Vouchers**, **Money Receipts**, **Commercial Quotations**, **Service Invoices**, **Journal Vouchers**, **Chart of Accounts**, **General Ledger**, and **Verified Trial Balance**—plus standalone `.html` download support.
5. **Alembic Migrations, 6-Role RBAC & Verified Double-Entry Accounting**:
   - Reversible migrations (`0001_foundation_accounting` → `0002_attendance_payroll_backup`), Argon2id user management with immediate token revocation on deactivation, 16-permission configurable role matrix, and mathematically verified Trial Balance.

---

## 2. Local Installation & Execution (Windows PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

$env:JWT_SECRET = "replace-with-a-long-random-32-byte-secret"
$env:BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "ChangeThis-Immediately-123!"
$env:DATABASE_URL = "sqlite:///./erp_dev.db"

# Apply Alembic migrations (0001 -> 0002)
alembic upgrade head

# Option 1: Run unified full-stack gateway (FastAPI + React UI) on http://localhost:3000
npm install
npm run dev

# Option 2: Run FastAPI directly on http://127.0.0.1:8000
uvicorn app.main:app --reload --port 8000
```

---

## 3. Running Automated Unit & Integration Tests (14 Tests)

```powershell
pytest -v
```
