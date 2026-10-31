from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    Account,
    AttendanceRecord,
    BusinessDocument,
    BusinessDocumentItem,
    Employee,
    JournalEntry,
    JournalLine,
    SalaryPayment,
    User,
)
from app.routers.accounting import _ensure_open_fiscal_period, _next_voucher_no
from app.routers.documents import _next_doc_number, _serialize_document
from app.schemas import (
    AttendanceBulkSave,
    AttendanceRowOut,
    EmployeeCreate,
    EmployeeOut,
    MonthlyAttendanceSummaryRow,
    QuickExpensePaymentInput,
    SalaryAdjustmentInput,
    SalaryGenerateRequest,
    SalaryPayInput,
    SalaryPaymentOut,
)
from app.security import record_audit, require_permission

router = APIRouter(prefix="/hr", tags=["Attendance, Salary & Payments"])

ZERO = Decimal("0.00")


def _serialize_employee(e: Employee) -> EmployeeOut:
    b = Decimal(str(e.basic_salary)).quantize(ZERO)
    h = Decimal(str(e.house_rent)).quantize(ZERO)
    m = Decimal(str(e.medical_allowance)).quantize(ZERO)
    t = Decimal(str(e.transport_allowance)).quantize(ZERO)
    return EmployeeOut(
        id=e.id,
        emp_code=e.emp_code,
        full_name_en=e.full_name_en,
        full_name_bn=e.full_name_bn,
        designation_en=e.designation_en,
        designation_bn=e.designation_bn,
        department=e.department,
        phone=e.phone,
        email=e.email,
        join_date=e.join_date,
        basic_salary=b,
        house_rent=h,
        medical_allowance=m,
        transport_allowance=t,
        gross_salary=(b + h + m + t).quantize(ZERO),
        payment_method_pref=e.payment_method_pref,
        bank_account_no=e.bank_account_no,
        is_active=e.is_active,
    )


def _serialize_salary(sp: SalaryPayment, emp: Employee) -> SalaryPaymentOut:
    abs_ded = Decimal(str(sp.absent_deduction)).quantize(ZERO)
    adv_ded = Decimal(str(sp.advance_deduction)).quantize(ZERO)
    tax_ded = Decimal(str(sp.tax_deduction)).quantize(ZERO)
    tot_ded = (abs_ded + adv_ded + tax_ded).quantize(ZERO)
    return SalaryPaymentOut(
        id=sp.id,
        payslip_no=sp.payslip_no,
        employee_id=emp.id,
        emp_code=emp.emp_code,
        full_name_en=emp.full_name_en,
        full_name_bn=emp.full_name_bn,
        designation_en=emp.designation_en,
        designation_bn=emp.designation_bn,
        department=emp.department,
        bank_account_no=emp.bank_account_no,
        salary_month=sp.salary_month,
        payment_date=sp.payment_date,
        working_days=sp.working_days,
        present_days=sp.present_days,
        late_days=sp.late_days,
        half_days=sp.half_days,
        leave_days=sp.leave_days,
        absent_days=sp.absent_days,
        overtime_hours=Decimal(str(sp.overtime_hours)).quantize(ZERO),
        basic_salary=Decimal(str(sp.basic_salary)).quantize(ZERO),
        house_rent=Decimal(str(sp.house_rent)).quantize(ZERO),
        medical_allowance=Decimal(str(sp.medical_allowance)).quantize(ZERO),
        transport_allowance=Decimal(str(sp.transport_allowance)).quantize(ZERO),
        gross_salary=Decimal(str(sp.gross_salary)).quantize(ZERO),
        overtime_pay=Decimal(str(sp.overtime_pay)).quantize(ZERO),
        bonus_amount=Decimal(str(sp.bonus_amount)).quantize(ZERO),
        absent_deduction=abs_ded,
        advance_deduction=adv_ded,
        tax_deduction=tax_ded,
        total_deductions=tot_ded,
        net_payable=Decimal(str(sp.net_payable)).quantize(ZERO),
        payment_method=sp.payment_method,
        status=sp.status,
        linked_journal_id=sp.linked_journal_id,
        notes=sp.notes,
    )


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees(
    include_inactive: bool = True,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("hr:view")),
):
    stmt = select(Employee).order_by(Employee.emp_code)
    if not include_inactive:
        stmt = stmt.where(Employee.is_active.is_(True))
    return [_serialize_employee(e) for e in db.scalars(stmt).all()]


@router.post("/employees", response_model=EmployeeOut, status_code=201)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr:manage")),
):
    if db.scalar(select(Employee).where(Employee.emp_code == data.emp_code)):
        raise HTTPException(status_code=409, detail="Employee code already exists")
    try:
        emp = Employee(**data.model_dump(), is_active=True)
        db.add(emp)
        db.flush()
        record_audit(db, user.id, "employee.created", "employee", emp.emp_code, emp.full_name_en)
        db.commit()
        db.refresh(emp)
        return _serialize_employee(emp)
    except Exception:
        db.rollback()
        raise


@router.get("/attendance", response_model=list[AttendanceRowOut])
def get_daily_attendance(
    attendance_date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("hr:view")),
):
    employees = db.scalars(select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.emp_code)).all()
    records = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.attendance_date == attendance_date)
    ).all()
    rec_by_emp = {r.employee_id: r for r in records}

    out: list[AttendanceRowOut] = []
    for emp in employees:
        rec = rec_by_emp.get(emp.id)
        out.append(
            AttendanceRowOut(
                employee_id=emp.id,
                emp_code=emp.emp_code,
                full_name_en=emp.full_name_en,
                full_name_bn=emp.full_name_bn,
                designation_en=emp.designation_en,
                department=emp.department,
                attendance_date=attendance_date,
                status=rec.status if rec else "present",
                check_in=rec.check_in if rec else "09:00",
                check_out=rec.check_out if rec else "18:00",
                overtime_hours=Decimal(str(rec.overtime_hours)).quantize(ZERO) if rec else ZERO,
                note=rec.note if rec else "",
            )
        )
    return out


@router.post("/attendance/bulk", response_model=list[AttendanceRowOut])
def save_daily_attendance_bulk(
    payload: AttendanceBulkSave,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("hr:manage")),
):
    try:
        existing_rows = db.scalars(
            select(AttendanceRecord).where(AttendanceRecord.attendance_date == payload.attendance_date)
        ).all()
        existing_map = {r.employee_id: r for r in existing_rows}

        for item in payload.entries:
            emp = db.get(Employee, item.employee_id)
            if not emp:
                raise HTTPException(status_code=422, detail=f"Employee {item.employee_id} does not exist")
            rec = existing_map.get(item.employee_id)
            if rec:
                rec.status = item.status
                rec.check_in = item.check_in
                rec.check_out = item.check_out
                rec.overtime_hours = item.overtime_hours
                rec.note = item.note
            else:
                db.add(
                    AttendanceRecord(
                        employee_id=item.employee_id,
                        attendance_date=payload.attendance_date,
                        status=item.status,
                        check_in=item.check_in,
                        check_out=item.check_out,
                        overtime_hours=item.overtime_hours,
                        note=item.note,
                    )
                )

        record_audit(
            db,
            user.id,
            "attendance.saved",
            "attendance_record",
            payload.attendance_date,
            f"Saved attendance for {len(payload.entries)} employees on {payload.attendance_date}",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_daily_attendance(attendance_date=payload.attendance_date, db=db, _user=user)


@router.get("/attendance/monthly", response_model=list[MonthlyAttendanceSummaryRow])
def get_monthly_attendance_summary(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("hr:view")),
):
    employees = db.scalars(select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.emp_code)).all()
    records = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.attendance_date.like(f"{month}-%"))
    ).all()

    by_emp: dict[int, list[AttendanceRecord]] = {}
    for r in records:
        by_emp.setdefault(r.employee_id, []).append(r)

    summary: list[MonthlyAttendanceSummaryRow] = []
    for emp in employees:
        emp_recs = by_emp.get(emp.id, [])
        summary.append(
            MonthlyAttendanceSummaryRow(
                employee_id=emp.id,
                emp_code=emp.emp_code,
                full_name_en=emp.full_name_en,
                full_name_bn=emp.full_name_bn,
                designation_en=emp.designation_en,
                department=emp.department,
                present_days=sum(1 for r in emp_recs if r.status == "present"),
                late_days=sum(1 for r in emp_recs if r.status == "late"),
                half_days=sum(1 for r in emp_recs if r.status == "half_day"),
                leave_days=sum(1 for r in emp_recs if r.status == "leave"),
                absent_days=sum(1 for r in emp_recs if r.status == "absent"),
                holiday_days=sum(1 for r in emp_recs if r.status == "holiday"),
                total_overtime_hours=sum((Decimal(str(r.overtime_hours)) for r in emp_recs), ZERO).quantize(ZERO),
            )
        )
    return summary


@router.get("/payroll", response_model=list[SalaryPaymentOut])
def list_monthly_payroll(
    salary_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("hr:view")),
):
    stmt = (
        select(SalaryPayment)
        .options(selectinload(SalaryPayment.employee))
        .order_by(SalaryPayment.salary_month.desc(), SalaryPayment.payslip_no.asc())
    )
    if salary_month:
        stmt = stmt.where(SalaryPayment.salary_month == salary_month)
    rows = db.scalars(stmt).all()
    return [_serialize_salary(sp, sp.employee) for sp in rows]


@router.post("/payroll/generate", response_model=list[SalaryPaymentOut])
def generate_monthly_payroll(
    payload: SalaryGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll:manage")),
):
    employees = db.scalars(select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.emp_code)).all()
    if not employees:
        raise HTTPException(status_code=422, detail="No active employees found to generate payroll")

    att_records = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.attendance_date.like(f"{payload.salary_month}-%"))
    ).all()
    att_by_emp: dict[int, list[AttendanceRecord]] = {}
    for r in att_records:
        att_by_emp.setdefault(r.employee_id, []).append(r)

    month_compact = payload.salary_month.replace("-", "")

    try:
        for idx, emp in enumerate(employees, start=1):
            existing = db.scalar(
                select(SalaryPayment).where(
                    SalaryPayment.employee_id == emp.id,
                    SalaryPayment.salary_month == payload.salary_month,
                )
            )
            if existing and existing.status == "paid":
                continue

            recs = att_by_emp.get(emp.id, [])
            present_d = sum(1 for r in recs if r.status == "present")
            late_d = sum(1 for r in recs if r.status == "late")
            half_d = sum(1 for r in recs if r.status == "half_day")
            leave_d = sum(1 for r in recs if r.status == "leave")
            absent_d = sum(1 for r in recs if r.status == "absent")
            ot_hours = sum((Decimal(str(r.overtime_hours)) for r in recs), ZERO).quantize(ZERO)

            basic = Decimal(str(emp.basic_salary)).quantize(ZERO)
            house = Decimal(str(emp.house_rent)).quantize(ZERO)
            med = Decimal(str(emp.medical_allowance)).quantize(ZERO)
            trans = Decimal(str(emp.transport_allowance)).quantize(ZERO)
            gross = (basic + house + med + trans).quantize(ZERO)

            daily_basic = (basic / Decimal("30.00"))
            absent_ded = ((Decimal(absent_d) + Decimal(half_d) * Decimal("0.5")) * daily_basic).quantize(ZERO)
            hourly_rate = (basic / Decimal("208.00")) * Decimal("1.50")
            ot_pay = (ot_hours * hourly_rate).quantize(ZERO)

            bonus = Decimal(str(existing.bonus_amount)).quantize(ZERO) if existing else ZERO
            adv = Decimal(str(existing.advance_deduction)).quantize(ZERO) if existing else ZERO
            tax = Decimal(str(existing.tax_deduction)).quantize(ZERO) if existing else ZERO

            net = max((gross + ot_pay + bonus) - (absent_ded + adv + tax), ZERO).quantize(ZERO)

            if existing:
                existing.working_days = payload.working_days
                existing.present_days = present_d
                existing.late_days = late_d
                existing.half_days = half_d
                existing.leave_days = leave_d
                existing.absent_days = absent_d
                existing.overtime_hours = ot_hours
                existing.basic_salary = basic
                existing.house_rent = house
                existing.medical_allowance = med
                existing.transport_allowance = trans
                existing.gross_salary = gross
                existing.overtime_pay = ot_pay
                existing.absent_deduction = absent_ded
                existing.net_payable = net
            else:
                payslip_no = f"PAY-{month_compact}-{emp.id:03d}"
                db.add(
                    SalaryPayment(
                        payslip_no=payslip_no,
                        employee_id=emp.id,
                        salary_month=payload.salary_month,
                        working_days=payload.working_days,
                        present_days=present_d,
                        late_days=late_d,
                        half_days=half_d,
                        leave_days=leave_d,
                        absent_days=absent_d,
                        overtime_hours=ot_hours,
                        basic_salary=basic,
                        house_rent=house,
                        medical_allowance=med,
                        transport_allowance=trans,
                        gross_salary=gross,
                        overtime_pay=ot_pay,
                        bonus_amount=ZERO,
                        absent_deduction=absent_ded,
                        advance_deduction=ZERO,
                        tax_deduction=ZERO,
                        net_payable=net,
                        payment_method=emp.payment_method_pref,
                        status="pending",
                        created_by=user.id,
                    )
                )

        record_audit(
            db,
            user.id,
            "payroll.generated",
            "salary_payment",
            payload.salary_month,
            f"Generated/recalculated payroll sheet for {payload.salary_month}",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return list_monthly_payroll(salary_month=payload.salary_month, db=db, _user=user)


@router.patch("/payroll/{payslip_id}", response_model=SalaryPaymentOut)
def adjust_payslip(
    payslip_id: int,
    data: SalaryAdjustmentInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll:manage")),
):
    sp = db.scalar(
        select(SalaryPayment).options(selectinload(SalaryPayment.employee)).where(SalaryPayment.id == payslip_id)
    )
    if not sp:
        raise HTTPException(status_code=404, detail="Payslip not found")
    if sp.status == "paid":
        raise HTTPException(status_code=422, detail="Paid salary slips cannot be modified")

    sp.bonus_amount = data.bonus_amount
    sp.advance_deduction = data.advance_deduction
    sp.tax_deduction = data.tax_deduction
    sp.notes = data.notes

    gross = Decimal(str(sp.gross_salary))
    ot = Decimal(str(sp.overtime_pay))
    abs_ded = Decimal(str(sp.absent_deduction))
    sp.net_payable = max(
        (gross + ot + data.bonus_amount) - (abs_ded + data.advance_deduction + data.tax_deduction),
        ZERO,
    ).quantize(ZERO)

    record_audit(db, user.id, "payroll.adjusted", "salary_payment", sp.payslip_no, f"Net={sp.net_payable}")
    db.commit()
    db.refresh(sp)
    return _serialize_salary(sp, sp.employee)


@router.post("/payroll/{payslip_id}/pay", response_model=SalaryPaymentOut)
def disburse_salary_payment(
    payslip_id: int,
    payload: SalaryPayInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll:manage")),
):
    sp = db.scalar(
        select(SalaryPayment).options(selectinload(SalaryPayment.employee)).where(SalaryPayment.id == payslip_id)
    )
    if not sp:
        raise HTTPException(status_code=404, detail="Payslip not found")
    if sp.status == "paid":
        raise HTTPException(status_code=422, detail="This salary slip has already been paid")

    _ensure_open_fiscal_period(db, payload.payment_date)

    salary_exp_acc = db.scalar(select(Account).where(Account.code == "5010")) or db.scalar(
        select(Account).where(Account.account_type == "expense", Account.is_active.is_(True))
    )
    pay_acc = db.scalar(select(Account).where(Account.code == payload.payment_account_code)) or db.scalar(
        select(Account).where(Account.account_type == "asset", Account.is_active.is_(True))
    )

    net_amount = Decimal(str(sp.net_payable)).quantize(ZERO)

    try:
        linked_jid: Optional[int] = None
        if salary_exp_acc and pay_acc and net_amount > ZERO:
            vno = _next_voucher_no(db, payload.payment_date)
            now = datetime.now(timezone.utc)
            je = JournalEntry(
                voucher_no=vno,
                entry_date=payload.payment_date,
                memo=f"Salary Disbursement ({sp.salary_month}) — {sp.employee.full_name_en} ({sp.payslip_no})",
                reference=sp.payslip_no,
                status="posted",
                created_by=user.id,
                submitted_by=user.id,
                approved_by=user.id,
                approved_at=now,
                lines=[
                    JournalLine(
                        account_id=salary_exp_acc.id,
                        description=f"Salary {sp.salary_month} - {sp.employee.emp_code}",
                        debit=net_amount,
                        credit=ZERO,
                    ),
                    JournalLine(
                        account_id=pay_acc.id,
                        description=f"Paid via {payload.payment_method}",
                        debit=ZERO,
                        credit=net_amount,
                    ),
                ],
            )
            db.add(je)
            db.flush()
            linked_jid = je.id

            # Also auto-issue a printable Payment Voucher
            pv_no = _next_doc_number(db, "payment_voucher", payload.payment_date)
            pv_doc = BusinessDocument(
                doc_type="payment_voucher",
                doc_number=pv_no,
                issue_date=payload.payment_date,
                party_name_en=f"{sp.employee.full_name_en} ({sp.employee.emp_code})",
                party_name_bn=sp.employee.full_name_bn,
                party_address=f"{sp.employee.designation_en} · {sp.employee.department}",
                subject_en=f"Monthly Salary Disbursement for {sp.salary_month} ({sp.payslip_no})",
                subject_bn=f"মাসিক বেতন পরিশোধ — {sp.salary_month} ({sp.payslip_no})",
                payment_method=payload.payment_method,
                linked_journal_id=linked_jid,
                created_by=user.id,
                items=[
                    BusinessDocumentItem(
                        description_en=f"Net Salary Settlement — {sp.salary_month} ({sp.payslip_no})",
                        description_bn=f"নিট বেতন পরিশোধ — {sp.salary_month}",
                        quantity=Decimal("1.00"),
                        unit_price=net_amount,
                        amount=net_amount,
                    )
                ],
            )
            db.add(pv_doc)

        sp.status = "paid"
        sp.payment_date = payload.payment_date
        sp.payment_method = payload.payment_method
        sp.linked_journal_id = linked_jid

        record_audit(
            db,
            user.id,
            "payroll.paid",
            "salary_payment",
            sp.payslip_no,
            f"Disbursed BDT {net_amount} to {sp.employee.emp_code}",
        )
        db.commit()
        db.refresh(sp)
        return _serialize_salary(sp, sp.employee)
    except Exception:
        db.rollback()
        raise


@router.post("/quick-payment")
def create_quick_expense_payment(
    data: QuickExpensePaymentInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("payroll:manage")),
):
    _ensure_open_fiscal_period(db, data.payment_date)

    exp_acc = db.get(Account, data.expense_account_id)
    pay_acc = db.get(Account, data.paid_from_account_id)
    if not exp_acc or not exp_acc.is_active:
        raise HTTPException(status_code=422, detail="Selected expense/debit account is invalid or inactive")
    if not pay_acc or not pay_acc.is_active:
        raise HTTPException(status_code=422, detail="Selected cash/bank payment account is invalid or inactive")
    if exp_acc.id == pay_acc.id:
        raise HTTPException(status_code=422, detail="Debit and Credit accounts must be distinct")

    try:
        pv_no = _next_doc_number(db, "payment_voucher", data.payment_date)
        vno = _next_voucher_no(db, data.payment_date)
        now = datetime.now(timezone.utc)
        amt = data.amount.quantize(ZERO)

        je = JournalEntry(
            voucher_no=vno,
            entry_date=data.payment_date,
            memo=f"Payment to {data.payee_name_en}: {data.purpose_en}",
            reference=pv_no,
            status="posted",
            created_by=user.id,
            submitted_by=user.id,
            approved_by=user.id,
            approved_at=now,
            lines=[
                JournalLine(account_id=exp_acc.id, description=data.purpose_en, debit=amt, credit=ZERO),
                JournalLine(account_id=pay_acc.id, description=f"Paid via {data.payment_method}", debit=ZERO, credit=amt),
            ],
        )
        db.add(je)
        db.flush()

        doc = BusinessDocument(
            doc_type="payment_voucher",
            doc_number=pv_no,
            issue_date=data.payment_date,
            party_name_en=data.payee_name_en,
            party_name_bn=data.payee_name_bn,
            subject_en=data.purpose_en,
            subject_bn=data.purpose_bn,
            payment_method=data.payment_method,
            linked_journal_id=je.id,
            created_by=user.id,
            items=[
                BusinessDocumentItem(
                    description_en=data.purpose_en,
                    description_bn=data.purpose_bn,
                    quantity=Decimal("1.00"),
                    unit_price=amt,
                    amount=amt,
                )
            ],
        )
        db.add(doc)
        db.flush()

        record_audit(db, user.id, "payment.quick_voucher", "business_document", pv_no, f"BDT {amt} to {data.payee_name_en}")
        db.commit()
        db.refresh(doc)
        return {
            "voucher_no": vno,
            "payment_voucher": _serialize_document(doc),
        }
    except Exception:
        db.rollback()
        raise
