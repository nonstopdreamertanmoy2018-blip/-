"""Add Employees, Attendance, Salary Payments, and Company Picture columns

Revision ID: 0002_attendance_payroll_backup
Revises: 0001_foundation_accounting
Create Date: 2026-10-28 00:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_attendance_payroll_backup"
down_revision: Union[str, None] = "0001_foundation_accounting"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("company_profiles") as batch_op:
        batch_op.add_column(
            sa.Column("logo_url", sa.String(length=500), nullable=False, server_default="/company-logo.jpg")
        )
        batch_op.add_column(
            sa.Column("banner_url", sa.String(length=500), nullable=False, server_default="/company-hq.jpg")
        )

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("emp_code", sa.String(length=30), nullable=False),
        sa.Column("full_name_en", sa.String(length=150), nullable=False),
        sa.Column("full_name_bn", sa.String(length=150), nullable=False, server_default=""),
        sa.Column("designation_en", sa.String(length=120), nullable=False, server_default="Software Engineer"),
        sa.Column("designation_bn", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("department", sa.String(length=80), nullable=False, server_default="Engineering"),
        sa.Column("phone", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("join_date", sa.String(length=10), nullable=False, server_default="2026-01-01"),
        sa.Column("basic_salary", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("house_rent", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("medical_allowance", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("transport_allowance", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("payment_method_pref", sa.String(length=40), nullable=False, server_default="Bank Transfer"),
        sa.Column("bank_account_no", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_employees_emp_code", "employees", ["emp_code"], unique=True)
    op.create_index("ix_employees_department", "employees", ["department"], unique=False)

    op.create_table(
        "attendance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attendance_date", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="present"),
        sa.Column("check_in", sa.String(length=10), nullable=False, server_default="09:00"),
        sa.Column("check_out", sa.String(length=10), nullable=False, server_default="18:00"),
        sa.Column("overtime_hours", sa.Numeric(precision=6, scale=2), nullable=False, server_default="0.00"),
        sa.Column("note", sa.String(length=200), nullable=False, server_default=""),
        sa.UniqueConstraint("employee_id", "attendance_date", name="uq_employee_attendance_date"),
    )
    op.create_index("ix_attendance_records_employee_id", "attendance_records", ["employee_id"], unique=False)
    op.create_index("ix_attendance_records_attendance_date", "attendance_records", ["attendance_date"], unique=False)
    op.create_index("ix_attendance_records_status", "attendance_records", ["status"], unique=False)

    op.create_table(
        "salary_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("payslip_no", sa.String(length=40), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("salary_month", sa.String(length=7), nullable=False),
        sa.Column("payment_date", sa.String(length=10), nullable=True),
        sa.Column("working_days", sa.Integer(), nullable=False, server_default="26"),
        sa.Column("present_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("late_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("half_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("leave_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("absent_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("overtime_hours", sa.Numeric(precision=6, scale=2), nullable=False, server_default="0.00"),
        sa.Column("basic_salary", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("house_rent", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("medical_allowance", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("transport_allowance", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("gross_salary", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("overtime_pay", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("bonus_amount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("absent_deduction", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("advance_deduction", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("tax_deduction", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("net_payable", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("payment_method", sa.String(length=40), nullable=False, server_default="Bank Transfer"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("linked_journal_id", sa.Integer(), sa.ForeignKey("journal_entries.id"), nullable=True),
        sa.Column("notes", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("employee_id", "salary_month", name="uq_employee_salary_month"),
    )
    op.create_index("ix_salary_payments_payslip_no", "salary_payments", ["payslip_no"], unique=True)
    op.create_index("ix_salary_payments_employee_id", "salary_payments", ["employee_id"], unique=False)
    op.create_index("ix_salary_payments_salary_month", "salary_payments", ["salary_month"], unique=False)
    op.create_index("ix_salary_payments_status", "salary_payments", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_salary_payments_status", table_name="salary_payments")
    op.drop_index("ix_salary_payments_salary_month", table_name="salary_payments")
    op.drop_index("ix_salary_payments_employee_id", table_name="salary_payments")
    op.drop_index("ix_salary_payments_payslip_no", table_name="salary_payments")
    op.drop_table("salary_payments")

    op.drop_index("ix_attendance_records_status", table_name="attendance_records")
    op.drop_index("ix_attendance_records_attendance_date", table_name="attendance_records")
    op.drop_index("ix_attendance_records_employee_id", table_name="attendance_records")
    op.drop_table("attendance_records")

    op.drop_index("ix_employees_department", table_name="employees")
    op.drop_index("ix_employees_emp_code", table_name="employees")
    op.drop_table("employees")

    with op.batch_alter_table("company_profiles") as batch_op:
        batch_op.drop_column("banner_url")
        batch_op.drop_column("logo_url")
