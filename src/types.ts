export type Language = 'en' | 'bn';

export type RoleKey =
  | 'admin'
  | 'accountant'
  | 'hr'
  | 'project_manager'
  | 'sales'
  | 'employee';

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

export type DocType =
  | 'letterhead'
  | 'payment_voucher'
  | 'receipt'
  | 'quotation'
  | 'invoice';

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half_day'
  | 'leave'
  | 'absent'
  | 'holiday';

export interface CurrentUser {
  id: number;
  username: string;
  full_name_en: string;
  full_name_bn: string;
  email: string;
  role: RoleKey;
  is_active: boolean;
  permissions: string[];
}

export interface UserRecord {
  id: number;
  username: string;
  full_name_en: string;
  full_name_bn: string;
  email: string;
  role: RoleKey;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
}

export interface RoleMeta {
  role: RoleKey;
  label_en: string;
  label_bn: string;
}

export interface PermissionDef {
  key: string;
  module: string;
  label_en: string;
  label_bn: string;
  description_en: string;
  description_bn: string;
}

export interface PermissionMatrixResponse {
  roles: RoleMeta[];
  permissions: PermissionDef[];
  immutable_admin_permissions: string[];
  matrix: Record<RoleKey, Record<string, boolean>>;
}

export interface CompanyProfile {
  id: number;
  name_en: string;
  name_bn: string;
  tagline_en: string;
  tagline_bn: string;
  logo_url?: string;
  banner_url?: string;
  registration_no: string;
  tin_no: string;
  bin_no: string;
  address_en: string;
  address_bn: string;
  phone: string;
  email: string;
  website: string;
  currency: string;
  fiscal_year_start_month: number;
  is_demo_environment: boolean;
  updated_at: string;
}

export interface FiscalPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
}

export interface Account {
  id: number;
  code: string;
  name_en: string;
  name_bn: string;
  account_type: AccountType;
  normal_balance: 'debit' | 'credit';
  parent_code: string | null;
  description_en: string;
  description_bn: string;
  opening_debit: string;
  opening_credit: string;
  is_system: boolean;
  is_active: boolean;
}

export interface JournalLine {
  id: number;
  account_id: number;
  account_code: string;
  account_name_en: string;
  account_name_bn: string;
  description: string;
  debit: string;
  credit: string;
}

export interface JournalEntry {
  id: number;
  voucher_no: string | null;
  entry_date: string;
  memo: string;
  reference: string;
  status: 'draft' | 'pending_approval' | 'posted' | 'rejected' | 'reversed';
  total_debit: string;
  total_credit: string;
  created_by: number;
  created_by_username: string;
  approved_by: number | null;
  approved_by_username: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reversed_entry_id: number | null;
  created_at: string | null;
  lines: JournalLine[];
}

export interface LedgerMovementRow {
  line_id: number;
  entry_id: number;
  voucher_no: string;
  entry_date: string;
  memo: string;
  line_description: string;
  debit: string;
  credit: string;
  running_balance: string;
  balance_side: 'DR' | 'CR' | 'ZERO';
}

export interface GeneralLedgerReport {
  account_id: number;
  account_code: string;
  account_name_en: string;
  account_name_bn: string;
  account_type: AccountType;
  normal_balance: string;
  start_date: string | null;
  end_date: string | null;
  opening_balance: string;
  opening_side: 'DR' | 'CR' | 'ZERO';
  period_debit: string;
  period_credit: string;
  closing_balance: string;
  closing_side: 'DR' | 'CR' | 'ZERO';
  movements: LedgerMovementRow[];
}

export interface TrialBalanceRow {
  account_id: number;
  account_code: string;
  account_name: string;
  account_name_bn: string;
  account_type: AccountType;
  normal_balance: string;
  opening_debit: string;
  opening_credit: string;
  period_debit: string;
  period_credit: string;
  debit: string;
  credit: string;
  is_abnormal_balance: boolean;
}

export interface VerifiedTrialBalance {
  start_date: string | null;
  as_of_date: string | null;
  rows: TrialBalanceRow[];
  total_opening_debit: string;
  total_opening_credit: string;
  total_period_debit: string;
  total_period_credit: string;
  total_closing_debit: string;
  total_closing_credit: string;
  verification: {
    is_opening_balanced: boolean;
    is_movement_balanced: boolean;
    is_closing_balanced: boolean;
    ledger_reconciled: boolean;
    raw_journal_debit_sum: string;
    raw_journal_credit_sum: string;
    reconciliation_discrepancy: string;
    excluded_unposted_journals: number;
    abnormal_balance_codes: string[];
    safeguard_notice_en: string;
    safeguard_notice_bn: string;
  };
}

export interface Employee {
  id: number;
  emp_code: string;
  full_name_en: string;
  full_name_bn: string;
  designation_en: string;
  designation_bn: string;
  department: string;
  phone: string;
  email: string;
  join_date: string;
  basic_salary: string;
  house_rent: string;
  medical_allowance: string;
  transport_allowance: string;
  gross_salary: string;
  payment_method_pref: string;
  bank_account_no: string;
  is_active: boolean;
}

export interface AttendanceRow {
  employee_id: number;
  emp_code: string;
  full_name_en: string;
  full_name_bn: string;
  designation_en: string;
  department: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  overtime_hours: string;
  note: string;
}

export interface MonthlyAttendanceSummary {
  employee_id: number;
  emp_code: string;
  full_name_en: string;
  full_name_bn: string;
  designation_en: string;
  department: string;
  present_days: number;
  late_days: number;
  half_days: number;
  leave_days: number;
  absent_days: number;
  holiday_days: number;
  total_overtime_hours: string;
}

export interface SalaryPayment {
  id: number;
  payslip_no: string;
  employee_id: number;
  emp_code: string;
  full_name_en: string;
  full_name_bn: string;
  designation_en: string;
  designation_bn: string;
  department: string;
  bank_account_no: string;
  salary_month: string;
  payment_date: string | null;
  working_days: number;
  present_days: number;
  late_days: number;
  half_days: number;
  leave_days: number;
  absent_days: number;
  overtime_hours: string;
  basic_salary: string;
  house_rent: string;
  medical_allowance: string;
  transport_allowance: string;
  gross_salary: string;
  overtime_pay: string;
  bonus_amount: string;
  absent_deduction: string;
  advance_deduction: string;
  tax_deduction: string;
  total_deductions: string;
  net_payable: string;
  payment_method: string;
  status: 'pending' | 'paid';
  linked_journal_id: number | null;
  notes: string;
}

export interface DocumentItem {
  id?: number;
  description_en: string;
  description_bn: string;
  quantity: string;
  unit_price: string;
  amount?: string;
}

export interface BusinessDocument {
  id: number;
  doc_type: DocType;
  doc_number: string;
  issue_date: string;
  due_date: string | null;
  party_name_en: string;
  party_name_bn: string;
  party_address: string;
  subject_en: string;
  subject_bn: string;
  body_en: string;
  body_bn: string;
  payment_method: string;
  currency: string;
  discount_amount: string;
  tax_rate_percent: string;
  subtotal: string;
  tax_amount: string;
  grand_total: string;
  notes_en: string;
  notes_bn: string;
  status: string;
  linked_journal_id?: number | null;
  created_by: number;
  created_at: string;
  items: DocumentItem[];
}

export type ProjectStatus = 'planning' | 'active' | 'uat' | 'completed' | 'on_hold';

export interface SoftwareProject {
  id: number;
  project_code: string;
  name_en: string;
  name_bn: string;
  client_name_en: string;
  client_name_bn: string;
  client_contact: string;
  tech_stack: string;
  status: ProjectStatus;
  progress_percent: number;
  start_date: string;
  deadline: string | null;
  contract_value: string;
  billed_amount: string;
  received_amount: string;
  due_amount: string;
  manager_username: string;
  notes: string;
  created_at: string;
}

export interface FinancialStatementLine {
  account_id: number;
  account_code: string;
  account_name_en: string;
  account_name_bn: string;
  account_type: AccountType;
  normal_balance: 'debit' | 'credit';
  balance: string;
  is_contra: boolean;
}

export interface FinancialStatementsReport {
  start_date: string | null;
  as_of_date: string | null;
  revenue_lines: FinancialStatementLine[];
  expense_lines: FinancialStatementLine[];
  total_revenue: string;
  total_expenses: string;
  net_income: string;
  profit_margin_percent: string;
  asset_lines: FinancialStatementLine[];
  liability_lines: FinancialStatementLine[];
  equity_lines: FinancialStatementLine[];
  total_assets: string;
  total_liabilities: string;
  posted_equity: string;
  total_equity_with_net_income: string;
  total_liabilities_and_equity: string;
  accounting_equation_difference: string;
  is_balance_sheet_balanced: boolean;
  cash_and_bank: {
    petty_cash: string;
    bank_balance: string;
    total_liquid_cash: string;
    accounts_receivable: string;
    accounts_payable: string;
    accrued_liabilities: string;
    net_working_capital: string;
  };
}

export interface BackupSnapshot {
  filename: string;
  created_at: string;
  size_bytes: number;
  sha256: string;
}

export interface BackupStatus {
  database_dialect: string;
  opening_debit_total: string;
  opening_credit_total: string;
  opening_balance_is_zero: boolean;
  table_counts: Record<string, number>;
  snapshots: BackupSnapshot[];
}

export interface AuditLog {
  id: number;
  actor_user_id: number | null;
  actor_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}
