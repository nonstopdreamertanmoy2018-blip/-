from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

RoleLiteral = Literal[
    "admin",
    "accountant",
    "hr",
    "project_manager",
    "sales",
    "employee",
]

AccountTypeLiteral = Literal[
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
]

DocTypeLiteral = Literal[
    "letterhead",
    "payment_voucher",
    "receipt",
    "quotation",
    "invoice",
]

AttendanceStatusLiteral = Literal[
    "present",
    "late",
    "half_day",
    "leave",
    "absent",
    "holiday",
]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserOut(BaseModel):
    id: int
    username: str
    full_name_en: str
    full_name_bn: str
    email: str
    role: str
    is_active: bool
    permissions: list[str]


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=10, max_length=128)
    full_name_en: str = Field(default="", max_length=150)
    full_name_bn: str = Field(default="", max_length=150)
    email: str = Field(default="", max_length=150)
    role: RoleLiteral = "employee"


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserRoleUpdate(BaseModel):
    role: RoleLiteral


class UserPasswordReset(BaseModel):
    new_password: str = Field(min_length=10, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    full_name_en: str
    full_name_bn: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    deactivated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class PermissionMatrixUpdate(BaseModel):
    matrix: dict[str, dict[str, bool]]


class CompanyProfileUpdate(BaseModel):
    name_en: str = Field(min_length=2, max_length=200)
    name_bn: str = Field(default="", max_length=200)
    tagline_en: str = Field(default="", max_length=250)
    tagline_bn: str = Field(default="", max_length=250)
    logo_url: str = Field(default="/company-logo.jpg", max_length=500)
    banner_url: str = Field(default="/company-hq.jpg", max_length=500)
    registration_no: str = Field(default="", max_length=80)
    tin_no: str = Field(default="", max_length=80)
    bin_no: str = Field(default="", max_length=80)
    address_en: str = Field(default="", max_length=300)
    address_bn: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=60)
    email: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=150)
    currency: str = Field(default="BDT", min_length=3, max_length=10)
    fiscal_year_start_month: int = Field(default=7, ge=1, le=12)


class CompanyProfileOut(CompanyProfileUpdate):
    id: int
    is_demo_environment: bool
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FiscalPeriodCreate(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class FiscalPeriodOut(BaseModel):
    id: int
    name: str
    start_date: str
    end_date: str
    is_closed: bool
    closed_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class AccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9-]+$")
    name_en: str = Field(min_length=1, max_length=150)
    name_bn: str = Field(default="", max_length=150)
    account_type: AccountTypeLiteral
    parent_code: Optional[str] = Field(default=None, max_length=20)
    description_en: str = Field(default="", max_length=300)
    description_bn: str = Field(default="", max_length=300)
    opening_debit: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    opening_credit: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)


class AccountUpdate(BaseModel):
    name_en: Optional[str] = Field(default=None, min_length=1, max_length=150)
    name_bn: Optional[str] = Field(default=None, max_length=150)
    description_en: Optional[str] = Field(default=None, max_length=300)
    description_bn: Optional[str] = Field(default=None, max_length=300)
    opening_debit: Optional[Decimal] = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    opening_credit: Optional[Decimal] = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    is_active: Optional[bool] = None


class AccountOut(BaseModel):
    id: int
    code: str
    name_en: str
    name_bn: str
    account_type: str
    normal_balance: str
    parent_code: Optional[str] = None
    description_en: str
    description_bn: str
    opening_debit: Decimal
    opening_credit: Decimal
    is_system: bool
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


class JournalLineInput(BaseModel):
    account_id: int
    description: str = Field(default="", max_length=250)
    debit: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    credit: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)


class JournalCreate(BaseModel):
    entry_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    memo: str = Field(min_length=1, max_length=500)
    reference: str = Field(default="", max_length=120)
    workflow_action: Optional[Literal["draft", "submit", "direct_post"]] = None
    lines: list[JournalLineInput] = Field(min_length=2)


class JournalRejectInput(BaseModel):
    reason: str = Field(min_length=3, max_length=400)


class JournalLineOut(BaseModel):
    id: int
    account_id: int
    account_code: str
    account_name_en: str
    account_name_bn: str
    description: str
    debit: Decimal
    credit: Decimal


class JournalOut(BaseModel):
    id: int
    voucher_no: Optional[str] = None
    entry_date: str
    memo: str
    reference: str = ""
    status: str
    total_debit: Decimal
    total_credit: Decimal
    created_by: int
    created_by_username: str = ""
    approved_by: Optional[int] = None
    approved_by_username: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    reversed_entry_id: Optional[int] = None
    created_at: Optional[datetime] = None
    lines: list[JournalLineOut] = Field(default_factory=list)


class LedgerMovementRow(BaseModel):
    line_id: int
    entry_id: int
    voucher_no: str
    entry_date: str
    memo: str
    line_description: str
    debit: Decimal
    credit: Decimal
    running_balance: Decimal
    balance_side: Literal["DR", "CR", "ZERO"]


class GeneralLedgerOut(BaseModel):
    account_id: int
    account_code: str
    account_name_en: str
    account_name_bn: str
    account_type: str
    normal_balance: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    opening_balance: Decimal
    opening_side: Literal["DR", "CR", "ZERO"]
    period_debit: Decimal
    period_credit: Decimal
    closing_balance: Decimal
    closing_side: Literal["DR", "CR", "ZERO"]
    movements: list[LedgerMovementRow]


class TrialBalanceRow(BaseModel):
    account_id: int
    account_code: str
    account_name: str
    account_name_bn: str = ""
    account_type: str = ""
    normal_balance: str = "debit"
    opening_debit: Decimal = Decimal("0.00")
    opening_credit: Decimal = Decimal("0.00")
    period_debit: Decimal = Decimal("0.00")
    period_credit: Decimal = Decimal("0.00")
    debit: Decimal
    credit: Decimal
    is_abnormal_balance: bool = False


class TrialBalanceVerification(BaseModel):
    is_opening_balanced: bool
    is_movement_balanced: bool
    is_closing_balanced: bool
    ledger_reconciled: bool
    raw_journal_debit_sum: Decimal
    raw_journal_credit_sum: Decimal
    reconciliation_discrepancy: Decimal
    excluded_unposted_journals: int
    abnormal_balance_codes: list[str]
    safeguard_notice_en: str
    safeguard_notice_bn: str


class VerifiedTrialBalanceOut(BaseModel):
    start_date: Optional[str] = None
    as_of_date: Optional[str] = None
    rows: list[TrialBalanceRow]
    total_opening_debit: Decimal
    total_opening_credit: Decimal
    total_period_debit: Decimal
    total_period_credit: Decimal
    total_closing_debit: Decimal
    total_closing_credit: Decimal
    verification: TrialBalanceVerification


class EmployeeCreate(BaseModel):
    emp_code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9-]+$")
    full_name_en: str = Field(min_length=2, max_length=150)
    full_name_bn: str = Field(default="", max_length=150)
    designation_en: str = Field(default="Software Engineer", max_length=120)
    designation_bn: str = Field(default="", max_length=120)
    department: str = Field(default="Engineering", max_length=80)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=120)
    join_date: str = Field(default="2026-01-01", pattern=r"^\d{4}-\d{2}-\d{2}$")
    basic_salary: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    house_rent: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    medical_allowance: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    transport_allowance: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    payment_method_pref: str = Field(default="Bank Transfer", max_length=40)
    bank_account_no: str = Field(default="", max_length=80)


class EmployeeOut(BaseModel):
    id: int
    emp_code: str
    full_name_en: str
    full_name_bn: str
    designation_en: str
    designation_bn: str
    department: str
    phone: str
    email: str
    join_date: str
    basic_salary: Decimal
    house_rent: Decimal
    medical_allowance: Decimal
    transport_allowance: Decimal
    gross_salary: Decimal
    payment_method_pref: str
    bank_account_no: str
    is_active: bool


class AttendanceEntryInput(BaseModel):
    employee_id: int
    status: AttendanceStatusLiteral = "present"
    check_in: str = Field(default="09:00", max_length=10)
    check_out: str = Field(default="18:00", max_length=10)
    overtime_hours: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=6, decimal_places=2)
    note: str = Field(default="", max_length=200)


class AttendanceBulkSave(BaseModel):
    attendance_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    entries: list[AttendanceEntryInput] = Field(min_length=1)


class AttendanceRowOut(BaseModel):
    employee_id: int
    emp_code: str
    full_name_en: str
    full_name_bn: str
    designation_en: str
    department: str
    attendance_date: str
    status: str
    check_in: str
    check_out: str
    overtime_hours: Decimal
    note: str


class MonthlyAttendanceSummaryRow(BaseModel):
    employee_id: int
    emp_code: str
    full_name_en: str
    full_name_bn: str
    designation_en: str
    department: str
    present_days: int
    late_days: int
    half_days: int
    leave_days: int
    absent_days: int
    holiday_days: int
    total_overtime_hours: Decimal


class SalaryGenerateRequest(BaseModel):
    salary_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    working_days: int = Field(default=26, ge=1, le=31)


class SalaryAdjustmentInput(BaseModel):
    bonus_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    advance_deduction: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    tax_deduction: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    notes: str = Field(default="", max_length=250)


class SalaryPayInput(BaseModel):
    payment_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    payment_method: str = Field(default="Bank Transfer", max_length=40)
    payment_account_code: str = Field(default="1020", max_length=20)


class SalaryPaymentOut(BaseModel):
    id: int
    payslip_no: str
    employee_id: int
    emp_code: str
    full_name_en: str
    full_name_bn: str
    designation_en: str
    designation_bn: str
    department: str
    bank_account_no: str
    salary_month: str
    payment_date: Optional[str] = None
    working_days: int
    present_days: int
    late_days: int
    half_days: int
    leave_days: int
    absent_days: int
    overtime_hours: Decimal
    basic_salary: Decimal
    house_rent: Decimal
    medical_allowance: Decimal
    transport_allowance: Decimal
    gross_salary: Decimal
    overtime_pay: Decimal
    bonus_amount: Decimal
    absent_deduction: Decimal
    advance_deduction: Decimal
    tax_deduction: Decimal
    total_deductions: Decimal
    net_payable: Decimal
    payment_method: str
    status: str
    linked_journal_id: Optional[int] = None
    notes: str


class QuickExpensePaymentInput(BaseModel):
    payment_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    payee_name_en: str = Field(min_length=2, max_length=200)
    payee_name_bn: str = Field(default="", max_length=200)
    expense_account_id: int
    paid_from_account_id: int
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(default="Bank Transfer", max_length=60)
    purpose_en: str = Field(min_length=2, max_length=250)
    purpose_bn: str = Field(default="", max_length=250)


class DocumentItemInput(BaseModel):
    description_en: str = Field(min_length=1, max_length=250)
    description_bn: str = Field(default="", max_length=250)
    quantity: Decimal = Field(default=Decimal("1.00"), gt=0, max_digits=10, decimal_places=2)
    unit_price: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)


class DocumentCreate(BaseModel):
    doc_type: DocTypeLiteral
    issue_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    party_name_en: str = Field(default="", max_length=200)
    party_name_bn: str = Field(default="", max_length=200)
    party_address: str = Field(default="", max_length=300)
    subject_en: str = Field(default="", max_length=250)
    subject_bn: str = Field(default="", max_length=250)
    body_en: str = Field(default="", max_length=5000)
    body_bn: str = Field(default="", max_length=5000)
    payment_method: str = Field(default="Bank Transfer", max_length=60)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    tax_rate_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100, max_digits=5, decimal_places=2)
    notes_en: str = Field(default="Synthetic demonstration record — not a valid tax document.", max_length=400)
    notes_bn: str = Field(default="সিনথেটিক ডেমো নথি — কর চালান বা প্রকৃত লেনদেন নয়।", max_length=400)
    items: list[DocumentItemInput] = Field(default_factory=list)


class DocumentItemOut(BaseModel):
    id: int
    description_en: str
    description_bn: str
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal
    model_config = ConfigDict(from_attributes=True)


class DocumentOut(BaseModel):
    id: int
    doc_type: str
    doc_number: str
    issue_date: str
    due_date: Optional[str] = None
    party_name_en: str
    party_name_bn: str
    party_address: str
    subject_en: str
    subject_bn: str
    body_en: str
    body_bn: str
    payment_method: str
    currency: str
    discount_amount: Decimal
    tax_rate_percent: Decimal
    subtotal: Decimal
    tax_amount: Decimal
    grand_total: Decimal
    notes_en: str
    notes_bn: str
    status: str
    created_by: int
    created_at: datetime
    items: list[DocumentItemOut] = Field(default_factory=list)


class BackupSnapshotInfo(BaseModel):
    filename: str
    created_at: str
    size_bytes: int
    sha256: str


class BackupStatusOut(BaseModel):
    database_dialect: str
    opening_debit_total: Decimal
    opening_credit_total: Decimal
    opening_balance_is_zero: bool
    table_counts: dict[str, int]
    snapshots: list[BackupSnapshotInfo]


class BackupRestorePayload(BaseModel):
    snapshot_filename: Optional[str] = None
    backup_data: Optional[dict[str, Any]] = None


class AuditLogOut(BaseModel):
    id: int
    actor_user_id: Optional[int]
    actor_username: str = ""
    action: str
    entity_type: str
    entity_id: str
    details: str
    created_at: datetime
