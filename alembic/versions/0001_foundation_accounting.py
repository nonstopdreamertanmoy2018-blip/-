"""Initial schema: Company Foundation, RBAC Permission Matrix, Accounting & Printable Documents

Revision ID: 0001_foundation_accounting
Revises:
Create Date: 2026-10-28 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_foundation_accounting"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("full_name_en", sa.String(length=150), nullable=False, server_default=""),
        sa.Column("full_name_bn", sa.String(length=150), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=150), nullable=False, server_default=""),
        sa.Column("password_digest", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False, server_default="employee"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("deactivated_at", sa.DateTime(), nullable=True),
        sa.Column("deactivated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_role", "users", ["role"], unique=False)

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("permission_key", sa.String(length=60), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("role", "permission_key", name="uq_role_permission"),
    )
    op.create_index("ix_role_permissions_role", "role_permissions", ["role"], unique=False)
    op.create_index("ix_role_permissions_permission_key", "role_permissions", ["permission_key"], unique=False)

    op.create_table(
        "company_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name_en", sa.String(length=200), nullable=False),
        sa.Column("name_bn", sa.String(length=200), nullable=False),
        sa.Column("tagline_en", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("tagline_bn", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("registration_no", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("tin_no", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("bin_no", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("address_en", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("address_bn", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("email", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("website", sa.String(length=150), nullable=False, server_default=""),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="BDT"),
        sa.Column("fiscal_year_start_month", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("is_demo_environment", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "fiscal_periods",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False, unique=True),
        sa.Column("start_date", sa.String(length=10), nullable=False),
        sa.Column("end_date", sa.String(length=10), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_fiscal_periods_start_date", "fiscal_periods", ["start_date"], unique=False)
    op.create_index("ix_fiscal_periods_end_date", "fiscal_periods", ["end_date"], unique=False)

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name_en", sa.String(length=150), nullable=False),
        sa.Column("name_bn", sa.String(length=150), nullable=False, server_default=""),
        sa.Column("account_type", sa.String(length=20), nullable=False),
        sa.Column("normal_balance", sa.String(length=10), nullable=False, server_default="debit"),
        sa.Column("parent_code", sa.String(length=20), nullable=True),
        sa.Column("description_en", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("description_bn", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("opening_debit", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("opening_credit", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("opening_debit >= 0", name="ck_accounts_opening_debit_nonneg"),
        sa.CheckConstraint("opening_credit >= 0", name="ck_accounts_opening_credit_nonneg"),
    )
    op.create_index("ix_accounts_code", "accounts", ["code"], unique=True)
    op.create_index("ix_accounts_account_type", "accounts", ["account_type"], unique=False)

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("voucher_no", sa.String(length=40), nullable=True),
        sa.Column("entry_date", sa.String(length=10), nullable=False),
        sa.Column("memo", sa.String(length=500), nullable=False),
        sa.Column("reference", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=25), nullable=False, server_default="posted"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("submitted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.String(length=400), nullable=True),
        sa.Column("reversed_entry_id", sa.Integer(), sa.ForeignKey("journal_entries.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_journal_entries_voucher_no", "journal_entries", ["voucher_no"], unique=True)
    op.create_index("ix_journal_entries_entry_date", "journal_entries", ["entry_date"], unique=False)
    op.create_index("ix_journal_entries_status", "journal_entries", ["status"], unique=False)

    op.create_table(
        "journal_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entry_id", sa.Integer(), sa.ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("description", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("debit", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("credit", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.CheckConstraint("debit >= 0", name="ck_journal_lines_debit_nonneg"),
        sa.CheckConstraint("credit >= 0", name="ck_journal_lines_credit_nonneg"),
    )
    op.create_index("ix_journal_lines_entry_id", "journal_lines", ["entry_id"], unique=False)
    op.create_index("ix_journal_lines_account_id", "journal_lines", ["account_id"], unique=False)

    op.create_table(
        "business_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("doc_type", sa.String(length=30), nullable=False),
        sa.Column("doc_number", sa.String(length=40), nullable=False),
        sa.Column("issue_date", sa.String(length=10), nullable=False),
        sa.Column("due_date", sa.String(length=10), nullable=True),
        sa.Column("party_name_en", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("party_name_bn", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("party_address", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("subject_en", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("subject_bn", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("body_en", sa.Text(), nullable=False, server_default=""),
        sa.Column("body_bn", sa.Text(), nullable=False, server_default=""),
        sa.Column("payment_method", sa.String(length=60), nullable=False, server_default="Bank Transfer"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="BDT"),
        sa.Column("discount_amount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("tax_rate_percent", sa.Numeric(precision=5, scale=2), nullable=False, server_default="0.00"),
        sa.Column("notes_en", sa.String(length=400), nullable=False, server_default=""),
        sa.Column("notes_bn", sa.String(length=400), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=25), nullable=False, server_default="issued"),
        sa.Column("linked_journal_id", sa.Integer(), sa.ForeignKey("journal_entries.id"), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_business_documents_doc_type", "business_documents", ["doc_type"], unique=False)
    op.create_index("ix_business_documents_doc_number", "business_documents", ["doc_number"], unique=True)
    op.create_index("ix_business_documents_issue_date", "business_documents", ["issue_date"], unique=False)

    op.create_table(
        "business_document_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("business_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description_en", sa.String(length=250), nullable=False),
        sa.Column("description_bn", sa.String(length=250), nullable=False, server_default=""),
        sa.Column("quantity", sa.Numeric(precision=10, scale=2), nullable=False, server_default="1.00"),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False, server_default="0.00"),
    )
    op.create_index("ix_business_document_items_document_id", "business_document_items", ["document_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=50), nullable=False, server_default=""),
        sa.Column("details", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_entity_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_business_document_items_document_id", table_name="business_document_items")
    op.drop_table("business_document_items")

    op.drop_index("ix_business_documents_issue_date", table_name="business_documents")
    op.drop_index("ix_business_documents_doc_number", table_name="business_documents")
    op.drop_index("ix_business_documents_doc_type", table_name="business_documents")
    op.drop_table("business_documents")

    op.drop_index("ix_journal_lines_account_id", table_name="journal_lines")
    op.drop_index("ix_journal_lines_entry_id", table_name="journal_lines")
    op.drop_table("journal_lines")

    op.drop_index("ix_journal_entries_status", table_name="journal_entries")
    op.drop_index("ix_journal_entries_entry_date", table_name="journal_entries")
    op.drop_index("ix_journal_entries_voucher_no", table_name="journal_entries")
    op.drop_table("journal_entries")

    op.drop_index("ix_accounts_account_type", table_name="accounts")
    op.drop_index("ix_accounts_code", table_name="accounts")
    op.drop_table("accounts")

    op.drop_index("ix_fiscal_periods_end_date", table_name="fiscal_periods")
    op.drop_index("ix_fiscal_periods_start_date", table_name="fiscal_periods")
    op.drop_table("fiscal_periods")

    op.drop_table("company_profiles")

    op.drop_index("ix_role_permissions_permission_key", table_name="role_permissions")
    op.drop_index("ix_role_permissions_role", table_name="role_permissions")
    op.drop_table("role_permissions")

    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
