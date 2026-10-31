from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.config import DATABASE_URL
from app.database import get_db
from app.models import (
    Account,
    AttendanceRecord,
    BusinessDocument,
    BusinessDocumentItem,
    CompanyProfile,
    Employee,
    FiscalPeriod,
    JournalEntry,
    JournalLine,
    RolePermission,
    SalaryPayment,
    User,
)
from app.schemas import BackupRestorePayload, BackupSnapshotInfo, BackupStatusOut
from app.security import record_audit, require_permission

router = APIRouter(prefix="/backup", tags=["Database Backup & Recovery"])

ZERO = Decimal("0.00")
BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"


def _ensure_backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


def _serialize_full_backup_dict(db: Session) -> dict[str, Any]:
    company = db.scalar(select(CompanyProfile).order_by(CompanyProfile.id))
    periods = db.scalars(select(FiscalPeriod).order_by(FiscalPeriod.id)).all()
    accounts = db.scalars(select(Account).order_by(Account.id)).all()
    employees = db.scalars(select(Employee).order_by(Employee.id)).all()
    attendance = db.scalars(select(AttendanceRecord).order_by(AttendanceRecord.id)).all()
    journals = db.scalars(
        select(JournalEntry).options(selectinload(JournalEntry.lines)).order_by(JournalEntry.id)
    ).all()
    salaries = db.scalars(select(SalaryPayment).order_by(SalaryPayment.id)).all()
    docs = db.scalars(
        select(BusinessDocument).options(selectinload(BusinessDocument.items)).order_by(BusinessDocument.id)
    ).all()
    perms = db.scalars(select(RolePermission).order_by(RolePermission.id)).all()

    payload_body: dict[str, Any] = {
        "schema_version": "0002_attendance_payroll_backup",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "company_profile": {
            "name_en": company.name_en,
            "name_bn": company.name_bn,
            "tagline_en": company.tagline_en,
            "tagline_bn": company.tagline_bn,
            "logo_url": company.logo_url,
            "banner_url": company.banner_url,
            "registration_no": company.registration_no,
            "tin_no": company.tin_no,
            "bin_no": company.bin_no,
            "address_en": company.address_en,
            "address_bn": company.address_bn,
            "phone": company.phone,
            "email": company.email,
            "website": company.website,
            "currency": company.currency,
            "fiscal_year_start_month": company.fiscal_year_start_month,
        }
        if company
        else None,
        "role_permissions": [
            {"role": p.role, "permission_key": p.permission_key, "allowed": p.allowed}
            for p in perms
        ],
        "fiscal_periods": [
            {"id": fp.id, "name": fp.name, "start_date": fp.start_date, "end_date": fp.end_date, "is_closed": fp.is_closed}
            for fp in periods
        ],
        "accounts": [
            {
                "id": a.id,
                "code": a.code,
                "name_en": a.name_en,
                "name_bn": a.name_bn,
                "account_type": a.account_type,
                "normal_balance": a.normal_balance,
                "parent_code": a.parent_code,
                "description_en": a.description_en,
                "description_bn": a.description_bn,
                "opening_debit": str(Decimal(str(a.opening_debit)).quantize(ZERO)),
                "opening_credit": str(Decimal(str(a.opening_credit)).quantize(ZERO)),
                "is_system": a.is_system,
                "is_active": a.is_active,
            }
            for a in accounts
        ],
        "employees": [
            {
                "id": e.id,
                "emp_code": e.emp_code,
                "full_name_en": e.full_name_en,
                "full_name_bn": e.full_name_bn,
                "designation_en": e.designation_en,
                "designation_bn": e.designation_bn,
                "department": e.department,
                "phone": e.phone,
                "email": e.email,
                "join_date": e.join_date,
                "basic_salary": str(Decimal(str(e.basic_salary)).quantize(ZERO)),
                "house_rent": str(Decimal(str(e.house_rent)).quantize(ZERO)),
                "medical_allowance": str(Decimal(str(e.medical_allowance)).quantize(ZERO)),
                "transport_allowance": str(Decimal(str(e.transport_allowance)).quantize(ZERO)),
                "payment_method_pref": e.payment_method_pref,
                "bank_account_no": e.bank_account_no,
                "is_active": e.is_active,
            }
            for e in employees
        ],
        "attendance_records": [
            {
                "employee_id": r.employee_id,
                "attendance_date": r.attendance_date,
                "status": r.status,
                "check_in": r.check_in,
                "check_out": r.check_out,
                "overtime_hours": str(Decimal(str(r.overtime_hours)).quantize(ZERO)),
                "note": r.note,
            }
            for r in attendance
        ],
        "journal_entries": [
            {
                "id": j.id,
                "voucher_no": j.voucher_no,
                "entry_date": j.entry_date,
                "memo": j.memo,
                "reference": j.reference,
                "status": j.status,
                "created_by": j.created_by,
                "lines": [
                    {
                        "account_id": ln.account_id,
                        "description": ln.description,
                        "debit": str(Decimal(str(ln.debit)).quantize(ZERO)),
                        "credit": str(Decimal(str(ln.credit)).quantize(ZERO)),
                    }
                    for ln in j.lines
                ],
            }
            for j in journals
        ],
        "salary_payments": [
            {
                "id": s.id,
                "payslip_no": s.payslip_no,
                "employee_id": s.employee_id,
                "salary_month": s.salary_month,
                "payment_date": s.payment_date,
                "working_days": s.working_days,
                "present_days": s.present_days,
                "late_days": s.late_days,
                "half_days": s.half_days,
                "leave_days": s.leave_days,
                "absent_days": s.absent_days,
                "overtime_hours": str(Decimal(str(s.overtime_hours)).quantize(ZERO)),
                "basic_salary": str(Decimal(str(s.basic_salary)).quantize(ZERO)),
                "house_rent": str(Decimal(str(s.house_rent)).quantize(ZERO)),
                "medical_allowance": str(Decimal(str(s.medical_allowance)).quantize(ZERO)),
                "transport_allowance": str(Decimal(str(s.transport_allowance)).quantize(ZERO)),
                "gross_salary": str(Decimal(str(s.gross_salary)).quantize(ZERO)),
                "overtime_pay": str(Decimal(str(s.overtime_pay)).quantize(ZERO)),
                "bonus_amount": str(Decimal(str(s.bonus_amount)).quantize(ZERO)),
                "absent_deduction": str(Decimal(str(s.absent_deduction)).quantize(ZERO)),
                "advance_deduction": str(Decimal(str(s.advance_deduction)).quantize(ZERO)),
                "tax_deduction": str(Decimal(str(s.tax_deduction)).quantize(ZERO)),
                "net_payable": str(Decimal(str(s.net_payable)).quantize(ZERO)),
                "payment_method": s.payment_method,
                "status": s.status,
                "linked_journal_id": s.linked_journal_id,
                "notes": s.notes,
            }
            for s in salaries
        ],
        "business_documents": [
            {
                "id": d.id,
                "doc_type": d.doc_type,
                "doc_number": d.doc_number,
                "issue_date": d.issue_date,
                "due_date": d.due_date,
                "party_name_en": d.party_name_en,
                "party_name_bn": d.party_name_bn,
                "party_address": d.party_address,
                "subject_en": d.subject_en,
                "subject_bn": d.subject_bn,
                "body_en": d.body_en,
                "body_bn": d.body_bn,
                "payment_method": d.payment_method,
                "currency": d.currency,
                "discount_amount": str(Decimal(str(d.discount_amount)).quantize(ZERO)),
                "tax_rate_percent": str(Decimal(str(d.tax_rate_percent)).quantize(ZERO)),
                "notes_en": d.notes_en,
                "notes_bn": d.notes_bn,
                "status": d.status,
                "items": [
                    {
                        "description_en": it.description_en,
                        "description_bn": it.description_bn,
                        "quantity": str(Decimal(str(it.quantity)).quantize(ZERO)),
                        "unit_price": str(Decimal(str(it.unit_price)).quantize(ZERO)),
                        "amount": str(Decimal(str(it.amount)).quantize(ZERO)),
                    }
                    for it in d.items
                ],
            }
            for d in docs
        ],
    }

    canonical_bytes = json.dumps(payload_body, sort_keys=True, ensure_ascii=False).encode("utf-8")
    checksum = hashlib.sha256(canonical_bytes).hexdigest()
    return {
        "checksum_sha256": checksum,
        "data": payload_body,
    }


def _list_snapshots() -> list[BackupSnapshotInfo]:
    bdir = _ensure_backup_dir()
    out: list[BackupSnapshotInfo] = []
    for p in sorted(bdir.glob("*.json"), reverse=True):
        raw = p.read_bytes()
        out.append(
            BackupSnapshotInfo(
                filename=p.name,
                created_at=datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat(),
                size_bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(),
            )
        )
    return out


@router.get("/status", response_model=BackupStatusOut)
def get_backup_status(
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("backup:manage")),
):
    od_sum_raw, oc_sum_raw = db.execute(
        select(
            func.coalesce(func.sum(Account.opening_debit), ZERO),
            func.coalesce(func.sum(Account.opening_credit), ZERO),
        )
    ).one()
    od_sum = Decimal(str(od_sum_raw)).quantize(ZERO)
    oc_sum = Decimal(str(oc_sum_raw)).quantize(ZERO)

    counts = {
        "users": db.scalar(select(func.count(User.id))) or 0,
        "employees": db.scalar(select(func.count(Employee.id))) or 0,
        "attendance_records": db.scalar(select(func.count(AttendanceRecord.id))) or 0,
        "salary_payments": db.scalar(select(func.count(SalaryPayment.id))) or 0,
        "accounts": db.scalar(select(func.count(Account.id))) or 0,
        "journal_entries": db.scalar(select(func.count(JournalEntry.id))) or 0,
        "business_documents": db.scalar(select(func.count(BusinessDocument.id))) or 0,
    }

    return BackupStatusOut(
        database_dialect="SQLite" if DATABASE_URL.startswith("sqlite") else "PostgreSQL",
        opening_debit_total=od_sum,
        opening_credit_total=oc_sum,
        opening_balance_is_zero=(od_sum == ZERO and oc_sum == ZERO),
        table_counts=counts,
        snapshots=_list_snapshots(),
    )


@router.post("/snapshots", response_model=BackupSnapshotInfo, status_code=201)
def create_server_snapshot(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("backup:manage")),
):
    bdir = _ensure_backup_dir()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    fname = f"nextgen_technix_erp_snapshot_{stamp}.json"
    fpath = bdir / fname

    archive = _serialize_full_backup_dict(db)
    content = json.dumps(archive, indent=2, ensure_ascii=False).encode("utf-8")
    fpath.write_bytes(content)

    record_audit(db, user.id, "backup.snapshot_created", "backup", fname, f"Size={len(content)} bytes")
    db.commit()

    return BackupSnapshotInfo(
        filename=fname,
        created_at=datetime.now(timezone.utc).isoformat(),
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )


@router.get("/export-json")
def export_backup_json(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("backup:manage")),
):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    archive = _serialize_full_backup_dict(db)
    content = json.dumps(archive, indent=2, ensure_ascii=False).encode("utf-8")
    record_audit(db, user.id, "backup.exported_json", "backup", f"export_{stamp}.json", "Downloaded JSON backup")
    db.commit()
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="NextGen_Technix_ERP_Backup_{stamp}.json"',
        },
    )


@router.get("/export-sqlite")
def export_sqlite_binary_snapshot(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("backup:manage")),
):
    if not DATABASE_URL.startswith("sqlite:///"):
        raise HTTPException(status_code=422, detail="Raw SQLite download is only applicable when running on SQLite")

    raw_db_path = DATABASE_URL.replace("sqlite:///", "", 1)
    src_path = Path(raw_db_path).resolve()
    if not src_path.exists():
        raise HTTPException(status_code=404, detail="SQLite database file not found")

    tmp_dir = Path(tempfile.mkdtemp(prefix="ng_sqlite_bak_"))
    dest_path = tmp_dir / "NextGen_Technix_ERP_HotBackup.db"

    src_conn = sqlite3.connect(str(src_path))
    dst_conn = sqlite3.connect(str(dest_path))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    record_audit(db, user.id, "backup.exported_sqlite", "backup", dest_path.name, "Downloaded consistent SQLite DB file")
    db.commit()

    return FileResponse(
        path=str(dest_path),
        filename="NextGen_Technix_ERP_Database_Backup.db",
        media_type="application/octet-stream",
    )


@router.post("/restore")
def restore_from_snapshot_or_json(
    payload: BackupRestorePayload,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("backup:manage")),
):
    archive: dict[str, Any]
    if payload.snapshot_filename:
        safe_name = Path(payload.snapshot_filename).name
        fpath = _ensure_backup_dir() / safe_name
        if not fpath.exists():
            raise HTTPException(status_code=404, detail="Snapshot file not found")
        archive = json.loads(fpath.read_text(encoding="utf-8"))
    elif payload.backup_data:
        archive = payload.backup_data
    else:
        raise HTTPException(status_code=422, detail="Provide either snapshot_filename or backup_data")

    if "data" not in archive or not isinstance(archive["data"], dict):
        raise HTTPException(status_code=422, detail="Invalid backup archive structure")

    body = archive["data"]
    expected_hash = archive.get("checksum_sha256")
    if expected_hash:
        actual_hash = hashlib.sha256(
            json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        if actual_hash != expected_hash:
            raise HTTPException(status_code=422, detail="Backup SHA-256 checksum verification failed")

    try:
        # Clear transactional & master operational tables in FK-safe order (preserving active users)
        db.execute(delete(SalaryPayment))
        db.execute(delete(AttendanceRecord))
        db.execute(delete(BusinessDocumentItem))
        db.execute(delete(BusinessDocument))
        db.execute(delete(JournalLine))
        db.execute(delete(JournalEntry))
        db.execute(delete(Employee))
        db.execute(delete(Account))
        db.flush()

        # Restore Company Profile
        if body.get("company_profile"):
            cp = db.scalar(select(CompanyProfile).order_by(CompanyProfile.id))
            if not cp:
                cp = CompanyProfile()
                db.add(cp)
            for k, v in body["company_profile"].items():
                if hasattr(cp, k):
                    setattr(cp, k, v)

        # Restore Accounts
        acc_id_map: dict[int, int] = {}
        for a in body.get("accounts", []):
            new_a = Account(
                code=a["code"],
                name_en=a["name_en"],
                name_bn=a.get("name_bn", ""),
                account_type=a["account_type"],
                normal_balance=a["normal_balance"],
                parent_code=a.get("parent_code"),
                description_en=a.get("description_en", ""),
                description_bn=a.get("description_bn", ""),
                opening_debit=Decimal(str(a.get("opening_debit", "0.00"))),
                opening_credit=Decimal(str(a.get("opening_credit", "0.00"))),
                is_system=bool(a.get("is_system", False)),
                is_active=bool(a.get("is_active", True)),
            )
            db.add(new_a)
            db.flush()
            acc_id_map[int(a["id"])] = new_a.id

        # Restore Employees
        emp_id_map: dict[int, int] = {}
        for e in body.get("employees", []):
            new_e = Employee(
                emp_code=e["emp_code"],
                full_name_en=e["full_name_en"],
                full_name_bn=e.get("full_name_bn", ""),
                designation_en=e.get("designation_en", ""),
                designation_bn=e.get("designation_bn", ""),
                department=e.get("department", "Engineering"),
                phone=e.get("phone", ""),
                email=e.get("email", ""),
                join_date=e.get("join_date", "2026-01-01"),
                basic_salary=Decimal(str(e.get("basic_salary", "0.00"))),
                house_rent=Decimal(str(e.get("house_rent", "0.00"))),
                medical_allowance=Decimal(str(e.get("medical_allowance", "0.00"))),
                transport_allowance=Decimal(str(e.get("transport_allowance", "0.00"))),
                payment_method_pref=e.get("payment_method_pref", "Bank Transfer"),
                bank_account_no=e.get("bank_account_no", ""),
                is_active=bool(e.get("is_active", True)),
            )
            db.add(new_e)
            db.flush()
            emp_id_map[int(e["id"])] = new_e.id

        # Restore Attendance
        for r in body.get("attendance_records", []):
            mapped_emp = emp_id_map.get(int(r["employee_id"]))
            if mapped_emp:
                db.add(
                    AttendanceRecord(
                        employee_id=mapped_emp,
                        attendance_date=r["attendance_date"],
                        status=r["status"],
                        check_in=r.get("check_in", "09:00"),
                        check_out=r.get("check_out", "18:00"),
                        overtime_hours=Decimal(str(r.get("overtime_hours", "0.00"))),
                        note=r.get("note", ""),
                    )
                )

        # Restore Journals
        journal_id_map: dict[int, int] = {}
        for j in body.get("journal_entries", []):
            new_j = JournalEntry(
                voucher_no=j.get("voucher_no"),
                entry_date=j["entry_date"],
                memo=j["memo"],
                reference=j.get("reference", ""),
                status=j.get("status", "posted"),
                created_by=user.id,
                approved_by=user.id if j.get("status") == "posted" else None,
                approved_at=datetime.now(timezone.utc) if j.get("status") == "posted" else None,
                lines=[
                    JournalLine(
                        account_id=acc_id_map[int(ln["account_id"])],
                        description=ln.get("description", ""),
                        debit=Decimal(str(ln.get("debit", "0.00"))),
                        credit=Decimal(str(ln.get("credit", "0.00"))),
                    )
                    for ln in j.get("lines", [])
                    if int(ln["account_id"]) in acc_id_map
                ],
            )
            db.add(new_j)
            db.flush()
            journal_id_map[int(j["id"])] = new_j.id

        # Restore Salary Payments
        for s in body.get("salary_payments", []):
            mapped_emp = emp_id_map.get(int(s["employee_id"]))
            if mapped_emp:
                db.add(
                    SalaryPayment(
                        payslip_no=s["payslip_no"],
                        employee_id=mapped_emp,
                        salary_month=s["salary_month"],
                        payment_date=s.get("payment_date"),
                        working_days=int(s.get("working_days", 26)),
                        present_days=int(s.get("present_days", 0)),
                        late_days=int(s.get("late_days", 0)),
                        half_days=int(s.get("half_days", 0)),
                        leave_days=int(s.get("leave_days", 0)),
                        absent_days=int(s.get("absent_days", 0)),
                        overtime_hours=Decimal(str(s.get("overtime_hours", "0.00"))),
                        basic_salary=Decimal(str(s.get("basic_salary", "0.00"))),
                        house_rent=Decimal(str(s.get("house_rent", "0.00"))),
                        medical_allowance=Decimal(str(s.get("medical_allowance", "0.00"))),
                        transport_allowance=Decimal(str(s.get("transport_allowance", "0.00"))),
                        gross_salary=Decimal(str(s.get("gross_salary", "0.00"))),
                        overtime_pay=Decimal(str(s.get("overtime_pay", "0.00"))),
                        bonus_amount=Decimal(str(s.get("bonus_amount", "0.00"))),
                        absent_deduction=Decimal(str(s.get("absent_deduction", "0.00"))),
                        advance_deduction=Decimal(str(s.get("advance_deduction", "0.00"))),
                        tax_deduction=Decimal(str(s.get("tax_deduction", "0.00"))),
                        net_payable=Decimal(str(s.get("net_payable", "0.00"))),
                        payment_method=s.get("payment_method", "Bank Transfer"),
                        status=s.get("status", "pending"),
                        linked_journal_id=journal_id_map.get(int(s["linked_journal_id"])) if s.get("linked_journal_id") else None,
                        notes=s.get("notes", ""),
                        created_by=user.id,
                    )
                )

        # Restore Documents
        for d in body.get("business_documents", []):
            db.add(
                BusinessDocument(
                    doc_type=d["doc_type"],
                    doc_number=d["doc_number"],
                    issue_date=d["issue_date"],
                    due_date=d.get("due_date"),
                    party_name_en=d.get("party_name_en", ""),
                    party_name_bn=d.get("party_name_bn", ""),
                    party_address=d.get("party_address", ""),
                    subject_en=d.get("subject_en", ""),
                    subject_bn=d.get("subject_bn", ""),
                    body_en=d.get("body_en", ""),
                    body_bn=d.get("body_bn", ""),
                    payment_method=d.get("payment_method", "Bank Transfer"),
                    currency=d.get("currency", "BDT"),
                    discount_amount=Decimal(str(d.get("discount_amount", "0.00"))),
                    tax_rate_percent=Decimal(str(d.get("tax_rate_percent", "0.00"))),
                    notes_en=d.get("notes_en", ""),
                    notes_bn=d.get("notes_bn", ""),
                    status=d.get("status", "issued"),
                    created_by=user.id,
                    items=[
                        BusinessDocumentItem(
                            description_en=it["description_en"],
                            description_bn=it.get("description_bn", ""),
                            quantity=Decimal(str(it.get("quantity", "1.00"))),
                            unit_price=Decimal(str(it.get("unit_price", "0.00"))),
                            amount=Decimal(str(it.get("amount", "0.00"))),
                        )
                        for it in d.get("items", [])
                    ],
                )
            )

        record_audit(db, user.id, "backup.restored", "backup", payload.snapshot_filename or "uploaded_json", "Restored ERP database state")
        db.commit()
        return {"status": "restored", "checksum_verified": bool(expected_hash)}
    except Exception:
        db.rollback()
        raise
