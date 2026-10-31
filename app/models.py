from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

VALID_ROLES = (
    "admin",
    "accountant",
    "hr",
    "project_manager",
    "sales",
    "employee",
)

ACCOUNT_NORMAL_BALANCE_MAP: dict[str, str] = {
    "asset": "debit",
    "expense": "debit",
    "liability": "credit",
    "equity": "credit",
    "revenue": "credit",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    full_name_en: Mapped[str] = mapped_column(String(150), default="")
    full_name_bn: Mapped[str] = mapped_column(String(150), default="")
    email: Mapped[str] = mapped_column(String(150), default="")
    password_digest: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30), default="employee", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    deactivated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role", "permission_key", name="uq_role_permission"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(30), index=True)
    permission_key: Mapped[str] = mapped_column(String(60), index=True)
    allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
    updated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(200), default="NEXTGEN TECHNIX LIMITED")
    name_bn: Mapped[str] = mapped_column(String(200), default="নেক্সটজেন টেকনিক্স লিমিটেড")
    tagline_en: Mapped[str] = mapped_column(String(250), default="Premier IT Company & Custom Software Engineering Studio · Enterprise ERP")
    tagline_bn: Mapped[str] = mapped_column(String(250), default="শীর্ষস্থানীয় আইটি ও সফটওয়্যার নির্মাতা প্রতিষ্ঠান · এন্টারপ্রাইজ ইআরপি")
    logo_url: Mapped[str] = mapped_column(String(500), default="/company-logo.jpg")
    banner_url: Mapped[str] = mapped_column(String(500), default="/company-hq.jpg")
    registration_no: Mapped[str] = mapped_column(String(80), default="RJSC-C-194820")
    tin_no: Mapped[str] = mapped_column(String(80), default="519-842-7710")
    bin_no: Mapped[str] = mapped_column(String(80), default="004918273-0101")
    address_en: Mapped[str] = mapped_column(String(300), default="Level 9, Plot 42, Gulshan Avenue, Dhaka-1212, Bangladesh")
    address_bn: Mapped[str] = mapped_column(String(300), default="লেভেল ৯, প্লট ৪২, গুলশান অ্যাভিনিউ, ঢাকা-১২১২, বাংলাদেশ")
    phone: Mapped[str] = mapped_column(String(60), default="+880 2-2222-84910")
    email: Mapped[str] = mapped_column(String(120), default="info@nextgentechnix.com")
    website: Mapped[str] = mapped_column(String(150), default="https://www.nextgentechnix.com")
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, default=7)
    is_demo_environment: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class FiscalPeriod(Base):
    __tablename__ = "fiscal_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    start_date: Mapped[str] = mapped_column(String(10), index=True)
    end_date: Mapped[str] = mapped_column(String(10), index=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("opening_debit >= 0", name="ck_accounts_opening_debit_nonneg"),
        CheckConstraint("opening_credit >= 0", name="ck_accounts_opening_credit_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(150))
    name_bn: Mapped[str] = mapped_column(String(150), default="")
    account_type: Mapped[str] = mapped_column(String(20), index=True)
    normal_balance: Mapped[str] = mapped_column(String(10), default="debit")
    parent_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    description_en: Mapped[str] = mapped_column(String(300), default="")
    description_bn: Mapped[str] = mapped_column(String(300), default="")
    opening_debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    opening_credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    voucher_no: Mapped[Optional[str]] = mapped_column(String(40), unique=True, index=True, nullable=True)
    entry_date: Mapped[str] = mapped_column(String(10), index=True)
    memo: Mapped[str] = mapped_column(String(500))
    reference: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(25), default="posted", index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    submitted_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    reversed_entry_id: Mapped[Optional[int]] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    lines: Mapped[list["JournalLine"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="JournalLine.id",
    )


class JournalLine(Base):
    __tablename__ = "journal_lines"
    __table_args__ = (
        CheckConstraint("debit >= 0", name="ck_journal_lines_debit_nonneg"),
        CheckConstraint("credit >= 0", name="ck_journal_lines_credit_nonneg"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("journal_entries.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    description: Mapped[str] = mapped_column(String(250), default="")
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))

    entry: Mapped[JournalEntry] = relationship(back_populates="lines")
    account: Mapped[Account] = relationship()


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    emp_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    full_name_en: Mapped[str] = mapped_column(String(150))
    full_name_bn: Mapped[str] = mapped_column(String(150), default="")
    designation_en: Mapped[str] = mapped_column(String(120), default="Software Engineer")
    designation_bn: Mapped[str] = mapped_column(String(120), default="সফটওয়্যার প্রকৌশলী")
    department: Mapped[str] = mapped_column(String(80), default="Engineering", index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(120), default="")
    join_date: Mapped[str] = mapped_column(String(10), default="2026-01-01")
    basic_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    house_rent: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    medical_allowance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    transport_allowance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    payment_method_pref: Mapped[str] = mapped_column(String(40), default="Bank Transfer")
    bank_account_no: Mapped[str] = mapped_column(String(80), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("employee_id", "attendance_date", name="uq_employee_attendance_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    attendance_date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    status: Mapped[str] = mapped_column(String(20), default="present", index=True)  # present/late/half_day/leave/absent/holiday
    check_in: Mapped[str] = mapped_column(String(10), default="09:00")
    check_out: Mapped[str] = mapped_column(String(10), default="18:00")
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"))
    note: Mapped[str] = mapped_column(String(200), default="")

    employee: Mapped[Employee] = relationship()


class SalaryPayment(Base):
    __tablename__ = "salary_payments"
    __table_args__ = (
        UniqueConstraint("employee_id", "salary_month", name="uq_employee_salary_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payslip_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    salary_month: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    payment_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    working_days: Mapped[int] = mapped_column(Integer, default=26)
    present_days: Mapped[int] = mapped_column(Integer, default=0)
    late_days: Mapped[int] = mapped_column(Integer, default=0)
    half_days: Mapped[int] = mapped_column(Integer, default=0)
    leave_days: Mapped[int] = mapped_column(Integer, default=0)
    absent_days: Mapped[int] = mapped_column(Integer, default=0)
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0.00"))
    basic_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    house_rent: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    medical_allowance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    transport_allowance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    gross_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    overtime_pay: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    bonus_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    absent_deduction: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    advance_deduction: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    tax_deduction: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    net_payable: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    payment_method: Mapped[str] = mapped_column(String(40), default="Bank Transfer")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending/paid
    linked_journal_id: Mapped[Optional[int]] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)
    notes: Mapped[str] = mapped_column(String(250), default="")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    employee: Mapped[Employee] = relationship()


class BusinessDocument(Base):
    __tablename__ = "business_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doc_type: Mapped[str] = mapped_column(String(30), index=True)
    doc_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    issue_date: Mapped[str] = mapped_column(String(10), index=True)
    due_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    party_name_en: Mapped[str] = mapped_column(String(200), default="")
    party_name_bn: Mapped[str] = mapped_column(String(200), default="")
    party_address: Mapped[str] = mapped_column(String(300), default="")
    subject_en: Mapped[str] = mapped_column(String(250), default="")
    subject_bn: Mapped[str] = mapped_column(String(250), default="")
    body_en: Mapped[str] = mapped_column(Text, default="")
    body_bn: Mapped[str] = mapped_column(Text, default="")
    payment_method: Mapped[str] = mapped_column(String(60), default="Bank Transfer")
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    tax_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"))
    notes_en: Mapped[str] = mapped_column(String(400), default="Synthetic demonstration record — not a valid tax document.")
    notes_bn: Mapped[str] = mapped_column(String(400), default="সিনথেটিক ডেমো নথি — কর চালান বা প্রকৃত লেনদেন নয়।")
    status: Mapped[str] = mapped_column(String(25), default="issued")
    linked_journal_id: Mapped[Optional[int]] = mapped_column(ForeignKey("journal_entries.id"), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

    items: Mapped[list["BusinessDocumentItem"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="BusinessDocumentItem.id",
    )


class BusinessDocumentItem(Base):
    __tablename__ = "business_document_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("business_documents.id", ondelete="CASCADE"), index=True)
    description_en: Mapped[str] = mapped_column(String(250))
    description_bn: Mapped[str] = mapped_column(String(250), default="")
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1.00"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))

    document: Mapped[BusinessDocument] = relationship(back_populates="items")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[str] = mapped_column(String(50), default="")
    details: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
