import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, {type NextFunction, type Request, type Response, type Router} from 'express';

type RoleKey = 'admin' | 'accountant' | 'hr' | 'project_manager' | 'sales' | 'employee';
type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
type DocType = 'letterhead' | 'payment_voucher' | 'receipt' | 'quotation' | 'invoice';
type AttendanceStatus = 'present' | 'late' | 'half_day' | 'leave' | 'absent' | 'holiday';
type ProjectStatus = 'planning' | 'active' | 'uat' | 'completed' | 'on_hold';

const VALID_ROLES: readonly RoleKey[] = [
  'admin',
  'accountant',
  'hr',
  'project_manager',
  'sales',
  'employee',
];

const VALID_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'planning',
  'active',
  'uat',
  'completed',
  'on_hold',
];

const ACCOUNT_NORMAL_BALANCE_MAP: Record<AccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  equity: 'credit',
  revenue: 'credit',
};

const DOC_PREFIX_MAP: Record<string, string> = {
  letterhead: 'LH',
  payment_voucher: 'PV',
  receipt: 'MR',
  quotation: 'QT',
  invoice: 'INV',
};

const DOC_TITLE_MAP: Record<string, [string, string]> = {
  letterhead: ['OFFICIAL LETTERHEAD', 'অফিসিয়াল লেটারহেড'],
  payment_voucher: ['PAYMENT VOUCHER', 'পেমেন্ট ভাউচার'],
  receipt: ['MONEY RECEIPT', 'মানি রসিদ'],
  quotation: ['COMMERCIAL QUOTATION', 'ব্যবসায়িক কোটেশন'],
  invoice: ['SERVICE INVOICE', 'সার্ভিস ইনভয়েস / চালান'],
};

const ROLES_META = [
  {role: 'admin', label_en: 'Administrator', label_bn: 'প্রশাসক (Administrator)'},
  {role: 'accountant', label_en: 'Accountant', label_bn: 'হিসাবরক্ষক (Accountant)'},
  {role: 'hr', label_en: 'HR & Payroll', label_bn: 'মানবসম্পদ ও পেরোল (HR & Payroll)'},
  {role: 'project_manager', label_en: 'Project Manager', label_bn: 'প্রজেক্ট ম্যানেজার'},
  {role: 'sales', label_en: 'Sales Executive', label_bn: 'বিক্রয় কর্মকর্তা (Sales Executive)'},
  {role: 'employee', label_en: 'Employee', label_bn: 'কর্মী (Employee)'},
];

const PERMISSIONS_CATALOG = [
  {
    key: 'users:manage',
    module: 'Foundation',
    label_en: 'Manage Users & Deactivation',
    label_bn: 'ব্যবহারকারী তৈরি ও নিষ্ক্রিয়করণ',
    description_en: 'Create user accounts, assign roles, and activate or deactivate access.',
    description_bn: 'নতুন ব্যবহারকারী তৈরি, ভূমিকা নির্ধারণ এবং অ্যাকাউন্ট সক্রিয়/নিষ্ক্রিয় করা।',
  },
  {
    key: 'permissions:manage',
    module: 'Foundation',
    label_en: 'Configure Permission Matrix',
    label_bn: 'অনুমতি ম্যাট্রিক্স কনফিগারেশন',
    description_en: 'Modify role-based access permissions across ERP modules.',
    description_bn: 'ভূমিকা অনুযায়ী ইআরপি মডিউলের অনুমতি পরিবর্তন করা।',
  },
  {
    key: 'company:manage',
    module: 'Foundation',
    label_en: 'Manage Company & Fiscal Periods',
    label_bn: 'কোম্পানি প্রোফাইল ও অর্থবছর ব্যবস্থাপনা',
    description_en: 'Edit company letterhead, pictures, and open or lock fiscal periods.',
    description_bn: 'কোম্পানির লেটারহেড, ছবি ও হিসাবকাল খোলা বা বন্ধ করা।',
  },
  {
    key: 'backup:manage',
    module: 'Foundation',
    label_en: 'Backup & Restore Database',
    label_bn: 'ডাটাবেস ব্যাকআপ ও পুনরুদ্ধার',
    description_en: 'Create encrypted/JSON & SQLite snapshots, download backups, and restore state.',
    description_bn: 'ডাটাবেস ব্যাকআপ তৈরি, ডাউনলোড এবং পুনরুদ্ধার পরিচালনা করা।',
  },
  {
    key: 'hr:view',
    module: 'Attendance & Salary',
    label_en: 'View Staff & Attendance',
    label_bn: 'কর্মী ও উপস্থিতি দেখা',
    description_en: 'View employee directory, daily attendance register, and monthly attendance summary.',
    description_bn: 'কর্মীদের তালিকা, দৈনিক উপস্থিতি এবং মাসিক হাজিরা প্রতিবেদন দেখা।',
  },
  {
    key: 'hr:manage',
    module: 'Attendance & Salary',
    label_en: 'Manage Staff & Mark Attendance',
    label_bn: 'কর্মী তথ্য ও হাজিরা এন্ট্রি',
    description_en: 'Add/update employees and record daily check-in, check-out, leave, and overtime.',
    description_bn: 'কর্মী যুক্ত করা এবং দৈনিক উপস্থিতি, ছুটি ও ওভারটাইম সংরক্ষণ করা।',
  },
  {
    key: 'payroll:manage',
    module: 'Attendance & Salary',
    label_en: 'Process Salary & Payments',
    label_bn: 'বেতন প্রস্তুত ও পেমেন্ট পরিশোধ',
    description_en: 'Generate monthly salary sheets, disburse salaries, and post quick expense payments.',
    description_bn: 'মাসিক বেতন শীট তৈরি, বেতন পরিশোধ এবং পেমেন্ট ভাউচার ইস্যু করা।',
  },
  {
    key: 'accounts:view',
    module: 'Accounting',
    label_en: 'View Chart of Accounts',
    label_bn: 'চার্ট অফ অ্যাকাউন্টস দেখা',
    description_en: 'Inspect ledger account hierarchy, codes, and normal balances.',
    description_bn: 'হিসাবের তালিকা, কোড এবং নরমাল ব্যালেন্স দেখা।',
  },
  {
    key: 'accounts:manage',
    module: 'Accounting',
    label_en: 'Manage Chart of Accounts',
    label_bn: 'চার্ট অফ অ্যাকাউন্টস ব্যবস্থাপনা',
    description_en: 'Create ledger accounts, reset opening balances to zero, or toggle active status.',
    description_bn: 'নতুন হিসাব খাত তৈরি, প্রারম্ভিক জের শূন্যকরণ ও স্থিতি পরিবর্তন।',
  },
  {
    key: 'journals:view',
    module: 'Accounting',
    label_en: 'View Journal Vouchers',
    label_bn: 'জার্নাল ভাউচার দেখা',
    description_en: 'View draft, pending approval, posted, and rejected journal entries.',
    description_bn: 'খসড়া, অনুমোদনের অপেক্ষায় থাকা এবং পোস্টকৃত জার্নাল দেখা।',
  },
  {
    key: 'journals:create',
    module: 'Accounting',
    label_en: 'Draft & Submit Journals',
    label_bn: 'জার্নাল খসড়া ও জমা দেওয়া',
    description_en: 'Prepare balanced double-entry journal vouchers and submit for approval.',
    description_bn: 'সুষম ডেবিট-ক্রেডিট জার্নাল তৈরি ও অনুমোদনের জন্য জমা দেওয়া।',
  },
  {
    key: 'journals:approve',
    module: 'Accounting',
    label_en: 'Approve, Post & Reverse Journals',
    label_bn: 'জার্নাল অনুমোদন, পোস্টিং ও রিভার্সাল',
    description_en: 'Approve pending journals into the General Ledger, reject, or post reversals.',
    description_bn: 'অপেক্ষমাণ জার্নাল জেনারেল লেজারে পোস্ট, প্রত্যাখ্যান বা রিভার্স করা।',
  },
  {
    key: 'reports:view',
    module: 'Accounting',
    label_en: 'View Ledger, Trial Balance & Financial Statements',
    label_bn: 'লেজার, ট্রায়াল ব্যালেন্স ও আর্থিক বিবরণী দেখা',
    description_en: 'Run General Ledger, Verified Trial Balance, Income Statement (P&L), and Balance Sheet.',
    description_bn: 'জেনারেল লেজার, ট্রায়াল ব্যালেন্স, লাভ-ক্ষতি ও ব্যালেন্স শিট প্রতিবেদন দেখা।',
  },
  {
    key: 'documents:view',
    module: 'Printing',
    label_en: 'View & Print Documents',
    label_bn: 'মুদ্রণযোগ্য নথিপত্র দেখা ও প্রিন্ট',
    description_en: 'Preview and print letterhead, payment vouchers, receipts, quotations, and invoices.',
    description_bn: 'লেটারহেড, পেমেন্ট ভাউচার, রসিদ, কোটেশন ও চালান প্রিন্ট করা।',
  },
  {
    key: 'documents:create',
    module: 'Printing',
    label_en: 'Create Printable Documents',
    label_bn: 'মুদ্রণযোগ্য নথিপত্র তৈরি',
    description_en: 'Issue numbered company letterheads, vouchers, receipts, quotations, and invoices.',
    description_bn: 'নতুন লেটারহেড, পেমেন্ট ভাউচার, মানি রসিদ, কোটেশন ও ইনভয়েস তৈরি করা।',
  },
  {
    key: 'projects:view',
    module: 'Operations',
    label_en: 'View Client & Project Operations',
    label_bn: 'গ্রাহক ও সফটওয়্যার প্রজেক্ট দেখা',
    description_en: 'Access software delivery milestones, client contracts, and project status.',
    description_bn: 'সফটওয়্যার প্রজেক্ট, মাইলস্টোন ও গ্রাহকের চুক্তির তথ্য দেখা।',
  },
  {
    key: 'projects:manage',
    module: 'Operations',
    label_en: 'Create & Manage Software Projects',
    label_bn: 'সফটওয়্যার প্রজেক্ট ও চুক্তি পরিচালনা',
    description_en: 'Create client software projects, update delivery progress, and track contract billing.',
    description_bn: 'নতুন সফটওয়্যার প্রজেক্ট তৈরি, অগ্রগতি হালনাগাদ এবং চুক্তিমূল্য ট্র্যাক করা।',
  },
];

const ALL_PERMISSION_KEYS = new Set(PERMISSIONS_CATALOG.map((p) => p.key));
const IMMUTABLE_ADMIN_PERMISSIONS = new Set(['users:manage', 'permissions:manage']);

const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  admin: Array.from(ALL_PERMISSION_KEYS),
  accountant: [
    'hr:view',
    'payroll:manage',
    'accounts:view',
    'accounts:manage',
    'journals:view',
    'journals:create',
    'journals:approve',
    'reports:view',
    'documents:view',
    'documents:create',
    'projects:view',
    'backup:manage',
  ],
  hr: [
    'hr:view',
    'hr:manage',
    'payroll:manage',
    'documents:view',
    'documents:create',
    'accounts:view',
    'projects:view',
  ],
  project_manager: [
    'hr:view',
    'projects:view',
    'projects:manage',
    'documents:view',
    'documents:create',
    'journals:view',
    'accounts:view',
  ],
  sales: [
    'projects:view',
    'projects:manage',
    'documents:view',
    'documents:create',
    'accounts:view',
  ],
  employee: ['hr:view', 'projects:view', 'documents:view'],
};

interface StoredUser {
  id: number;
  username: string;
  full_name_en: string;
  full_name_bn: string;
  email: string;
  password_digest: string;
  role: RoleKey;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
  deactivated_by: number | null;
}

interface StoredCompanyProfile {
  id: number;
  name_en: string;
  name_bn: string;
  tagline_en: string;
  tagline_bn: string;
  logo_url: string;
  banner_url: string;
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

interface StoredFiscalPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: number | null;
}

interface StoredAccount {
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

interface StoredJournalLine {
  id: number;
  account_id: number;
  description: string;
  debit: string;
  credit: string;
}

interface StoredJournalEntry {
  id: number;
  voucher_no: string | null;
  entry_date: string;
  memo: string;
  reference: string;
  status: 'draft' | 'pending_approval' | 'posted' | 'rejected' | 'reversed';
  created_by: number;
  submitted_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reversed_entry_id: number | null;
  created_at: string;
  lines: StoredJournalLine[];
}

interface StoredEmployee {
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
  payment_method_pref: string;
  bank_account_no: string;
  is_active: boolean;
}

interface StoredAttendanceRecord {
  id: number;
  employee_id: number;
  attendance_date: string;
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  overtime_hours: string;
  note: string;
}

interface StoredSalaryPayment {
  id: number;
  payslip_no: string;
  employee_id: number;
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
  net_payable: string;
  payment_method: string;
  status: 'pending' | 'paid';
  linked_journal_id: number | null;
  notes: string;
  created_by: number;
}

interface StoredDocumentItem {
  id: number;
  description_en: string;
  description_bn: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

interface StoredBusinessDocument {
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
  notes_en: string;
  notes_bn: string;
  status: string;
  linked_journal_id: number | null;
  created_by: number;
  created_at: string;
  items: StoredDocumentItem[];
}

interface StoredSoftwareProject {
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
  manager_username: string;
  notes: string;
  created_by: number;
  created_at: string;
}

interface StoredAuditLog {
  id: number;
  actor_user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}

interface ErpState {
  counters: Record<string, number>;
  users: StoredUser[];
  permission_matrix: Record<RoleKey, Record<string, boolean>>;
  company_profile: StoredCompanyProfile;
  fiscal_periods: StoredFiscalPeriod[];
  accounts: StoredAccount[];
  journals: StoredJournalEntry[];
  employees: StoredEmployee[];
  attendance_records: StoredAttendanceRecord[];
  salary_payments: StoredSalaryPayment[];
  documents: StoredBusinessDocument[];
  projects: StoredSoftwareProject[];
  audit_logs: StoredAuditLog[];
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// --- Exact 2-Decimal Cent Arithmetic Helpers (BigInt) ---
function parseCents(val: unknown, fallback = 0n): bigint {
  if (val === undefined || val === null || val === '') return fallback;
  const raw = String(val).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new HttpError(422, `Invalid numeric amount: ${raw}`);
  }
  const neg = raw.startsWith('-');
  const unsigned = neg ? raw.slice(1) : raw;
  const [whole, frac = ''] = unsigned.split('.');
  const frac3 = (frac + '000').slice(0, 3);
  let cents = BigInt(whole) * 100n + BigInt(frac3.slice(0, 2));
  if (Number(frac3[2]) >= 5) {
    cents += 1n;
  }
  return neg ? -cents : cents;
}

function formatCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${whole.toString()}.${frac}`;
}

function mulCents(aCents: bigint, bCents: bigint): bigint {
  // (a/100) * (b/100) in cents => (a * b) / 100 rounded half-up
  const prod = aCents * bCents;
  if (prod >= 0n) {
    return (prod + 50n) / 100n;
  }
  return (prod - 50n) / 100n;
}

function divRound(num: bigint, den: bigint): bigint {
  if (den === 0n) return 0n;
  const half = den / 2n;
  if (num >= 0n) {
    return (num + half) / den;
  }
  return (num - half) / den;
}

function absBigInt(v: bigint): bigint {
  return v < 0n ? -v : v;
}

// --- Password & JWT Security ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, digest: string): boolean {
  const parts = digest.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, storedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(storedHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-ephemeral-gateway-jwt-secret-change-in-production';
}

function signJwt(user: StoredUser): string {
  const header = Buffer.from(JSON.stringify({alg: 'HS256', typ: 'JWT'})).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.username,
      uid: user.id,
      role: user.role,
      exp,
    }),
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyJwt(token: string): {sub: string; uid: number; role: string} {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new HttpError(401, 'Invalid authentication token');
  }
  const [header, payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new HttpError(401, 'Invalid token signature');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    uid?: number;
    role?: string;
    exp?: number;
  };
  if (!decoded.sub || typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'Session expired or invalid token');
  }
  return {sub: decoded.sub, uid: Number(decoded.uid || 0), role: String(decoded.role || '')};
}

function canonicalJsonString(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonString(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonString(obj[k])}`).join(',')}}`;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoneyDisplay(amountStr: string): string {
  const num = Number(amountStr || '0');
  return num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// --- Fresh Zero-Balance Production ERP Seed State ---
function buildInitialSeedState(): ErpState {
  const nowIso = new Date().toISOString();
  const counters: Record<string, number> = {
    user: 0,
    period: 0,
    account: 0,
    journal: 0,
    journal_line: 0,
    employee: 0,
    attendance: 0,
    salary: 0,
    document: 0,
    document_item: 0,
    project: 0,
    audit: 0,
  };
  const nextId = (key: string) => {
    counters[key] = (counters[key] || 0) + 1;
    return counters[key];
  };

  const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeThis-Immediately-123!';

  const adminUser: StoredUser = {
    id: nextId('user'),
    username: adminUsername,
    full_name_en: 'System Administrator',
    full_name_bn: 'সিস্টেম প্রশাসক',
    email: 'admin@nextgentechnix.com',
    password_digest: hashPassword(adminPassword),
    role: 'admin',
    is_active: true,
    created_at: nowIso,
    deactivated_at: null,
    deactivated_by: null,
  };

  const roleAccountSpecs: Array<[string, string, string, string, RoleKey, string]> = [
    ['accountant', 'Chief Accountant', 'প্রধান হিসাবরক্ষক', 'accounts@nextgentechnix.com', 'accountant', 'NextGen-Acc-2026!'],
    ['hr_payroll', 'HR & Payroll Manager', 'মানবসম্পদ ও পেরোল ব্যবস্থাপক', 'hr@nextgentechnix.com', 'hr', 'NextGen-HR-2026!'],
    ['project_manager', 'Lead Project Manager', 'লিড প্রজেক্ট ম্যানেজার', 'pm@nextgentechnix.com', 'project_manager', 'NextGen-PM-2026!'],
    ['sales_exec', 'Senior Sales Executive', 'সিনিয়র বিক্রয় কর্মকর্তা', 'sales@nextgentechnix.com', 'sales', 'NextGen-Sales-2026!'],
    ['employee', 'Software Engineer', 'সফটওয়্যার প্রকৌশলী', 'engineer@nextgentechnix.com', 'employee', 'NextGen-Staff-2026!'],
  ];

  const users: StoredUser[] = [adminUser];
  for (const [uname, nen, nbn, email, role, initialPassword] of roleAccountSpecs) {
    users.push({
      id: nextId('user'),
      username: uname,
      full_name_en: nen,
      full_name_bn: nbn,
      email,
      password_digest: hashPassword(initialPassword),
      role,
      is_active: true,
      created_at: nowIso,
      deactivated_at: null,
      deactivated_by: null,
    });
  }

  const permission_matrix = {} as Record<RoleKey, Record<string, boolean>>;
  for (const role of VALID_ROLES) {
    permission_matrix[role] = {};
    const defaults = new Set(DEFAULT_ROLE_PERMISSIONS[role] || []);
    for (const perm of PERMISSIONS_CATALOG) {
      permission_matrix[role][perm.key] = defaults.has(perm.key);
    }
  }

  const company_profile: StoredCompanyProfile = {
    id: 1,
    name_en: 'NEXTGEN TECHNIX LIMITED',
    name_bn: 'নেক্সটজেন টেকনিক্স লিমিটেড',
    tagline_en: 'Premier IT Company & Custom Software Engineering Studio · Enterprise ERP',
    tagline_bn: 'শীর্ষস্থানীয় আইটি ও সফটওয়্যার নির্মাতা প্রতিষ্ঠান · এন্টারপ্রাইজ ইআরপি',
    logo_url: '/company-logo.jpg',
    banner_url: '/company-hq.jpg',
    registration_no: 'RJSC-C-194820',
    tin_no: '519-842-7710',
    bin_no: '004918273-0101',
    address_en: 'Level 9, Plot 42, Gulshan Avenue, Dhaka-1212, Bangladesh',
    address_bn: 'লেভেল ৯, প্লট ৪২, গুলশান অ্যাভিনিউ, ঢাকা-১২১২, বাংলাদেশ',
    phone: '+880 2-2222-84910',
    email: 'info@nextgentechnix.com',
    website: 'https://www.nextgentechnix.com',
    currency: 'BDT',
    fiscal_year_start_month: 7,
    is_demo_environment: false,
    updated_at: nowIso,
  };

  const currentYear = new Date().getFullYear();
  const fiscal_periods: StoredFiscalPeriod[] = [
    {
      id: nextId('period'),
      name: `FY ${currentYear}-${currentYear + 1} (Jul ${currentYear} – Jun ${currentYear + 1})`,
      start_date: `${currentYear}-07-01`,
      end_date: `${currentYear + 1}-06-30`,
      is_closed: false,
      closed_at: null,
      closed_by: null,
    },
    {
      id: nextId('period'),
      name: `FY ${currentYear - 1}-${currentYear} (Jul ${currentYear - 1} – Jun ${currentYear})`,
      start_date: `${currentYear - 1}-07-01`,
      end_date: `${currentYear}-06-30`,
      is_closed: false,
      closed_at: null,
      closed_by: null,
    },
  ];

  // ALL OPENING & CLOSING BALANCES STRICTLY ZERO (0.00 DR / 0.00 CR)
  const coaSpecs: Array<[string, string, string, AccountType, string]> = [
    ['1010', 'Petty Cash in Hand', 'হাতে খুচরা নগদ', 'asset', 'Corporate office petty cash float'],
    ['1020', 'Operating Bank Account (BDT)', 'চলতি ব্যাংক হিসাব (বিডিটি)', 'asset', 'Primary corporate operating bank account'],
    ['1100', 'Accounts Receivable — Clients', 'প্রাপ্য হিসাব — গ্রাহকবৃন্দ', 'asset', 'Billed software engineering & AMC client receivables'],
    ['1200', 'Staff Salary Advance & Deposits', 'কর্মী অগ্রিম ও নিরাপত্তা জমা', 'asset', 'Employee salary advances and security deposits'],
    ['1500', 'Server & Workstation Hardware', 'সার্ভার ও কম্পিউটার সরঞ্জাম', 'asset', 'Engineering workstations, servers, and office equipment'],
    ['2010', 'Accounts Payable — Vendors', 'প্রদেয় হিসাব — সরবরাহকারী', 'liability', 'Cloud infrastructure and supplier bills payable'],
    ['2100', 'Unearned AMC & Retainer Revenue', 'অনুপার্জিত রক্ষণাবেক্ষণ আয়', 'liability', 'Advance client retainers pending milestone delivery'],
    ['2200', 'Accrued Salaries & Statutory Payable', 'বকেয়া বেতন ও বিধিবদ্ধ প্রদেয়', 'liability', 'Accrued monthly payroll and withholding tax obligations'],
    ['3010', 'Paid-Up Share Capital', 'পরিশোধিত শেয়ার মূলধন', 'equity', 'Authorized and paid-up company share capital'],
    ['3020', 'Retained Earnings', 'সংরক্ষিত আয়', 'equity', 'Accumulated retained earnings and reserves'],
    ['4010', 'Custom Software Engineering Revenue', 'কাস্টম সফটওয়্যার উন্নয়ন আয়', 'revenue', 'Custom software, web, mobile, and ERP project billing'],
    ['4020', 'Cloud Hosting & AMC Support Revenue', 'ক্লাউড ও বার্ষিক রক্ষণাবেক্ষণ আয়', 'revenue', 'Recurring SLA maintenance, cloud hosting, and DevOps fees'],
    ['5010', 'Staff Salaries & Allowances', 'কর্মকর্তা ও কর্মচারীদের বেতন-ভাতা', 'expense', 'Monthly employee salaries, allowances, bonuses, and overtime'],
    ['5020', 'Office Rent & Utilities', 'অফিস ভাড়া ও উপযোগ খরচ', 'expense', 'Corporate office lease, electricity, water, and fiber internet'],
    ['5030', 'Cloud Infrastructure & DevOps Cost', 'ক্লাউড অবকাঠামো ও ডেভঅপস ব্যয়', 'expense', 'Production servers, domains, CI/CD, and software licenses'],
    ['5040', 'Office, Marketing & Conveyance', 'অফিস, মার্কেটিং ও যাতায়াত ব্যয়', 'expense', 'Stationery, business development, conveyance, and admin costs'],
  ];

  const accounts: StoredAccount[] = coaSpecs.map(([code, name_en, name_bn, account_type, description_en]) => ({
    id: nextId('account'),
    code,
    name_en,
    name_bn,
    account_type,
    normal_balance: ACCOUNT_NORMAL_BALANCE_MAP[account_type],
    parent_code: null,
    description_en,
    description_bn: '',
    opening_debit: '0.00',
    opening_credit: '0.00',
    is_system: true,
    is_active: true,
  }));

  return {
    counters,
    users,
    permission_matrix,
    company_profile,
    fiscal_periods,
    accounts,
    journals: [],
    employees: [],
    attendance_records: [],
    salary_payments: [],
    documents: [],
    projects: [],
    audit_logs: [],
  };
}

export function createCloudRunErpRouter(): Router {
  const router = express.Router();

  const stateFilePath =
    process.env.ERP_STATE_FILE || path.join(os.tmpdir(), 'nextgen_technix_erp_live_v1.json');
  const snapshotDir =
    process.env.ERP_SNAPSHOT_DIR || path.join(os.tmpdir(), 'nextgen_technix_erp_snapshots_v1');

  fs.mkdirSync(path.dirname(stateFilePath), {recursive: true});
  fs.mkdirSync(snapshotDir, {recursive: true});

  let state: ErpState;
  if (fs.existsSync(stateFilePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFilePath, 'utf8')) as ErpState;
      if (parsed?.company_profile?.is_demo_environment === true) {
        state = buildInitialSeedState();
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
      } else {
        state = parsed;
      }
    } catch {
      state = buildInitialSeedState();
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
    }
  } else {
    state = buildInitialSeedState();
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
  }

  function persistState(): void {
    const tmpFile = `${stateFilePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, JSON.stringify(state), 'utf8');
    fs.renameSync(tmpFile, stateFilePath);
  }

  let stateMigrated = false;
  if (!Array.isArray(state.projects)) {
    state.projects = [];
    stateMigrated = true;
  }
  if (typeof state.counters?.project !== 'number') {
    state.counters = {...state.counters, project: state.projects.length};
    stateMigrated = true;
  }
  for (const role of VALID_ROLES) {
    if (!state.permission_matrix[role]) {
      state.permission_matrix[role] = {};
      stateMigrated = true;
    }
    const defaults = new Set(DEFAULT_ROLE_PERMISSIONS[role] || []);
    for (const perm of PERMISSIONS_CATALOG) {
      if (state.permission_matrix[role][perm.key] === undefined) {
        state.permission_matrix[role][perm.key] = defaults.has(perm.key);
        stateMigrated = true;
      }
    }
  }
  if (stateMigrated) {
    persistState();
  }

  function nextId(counterKey: string): number {
    state.counters[counterKey] = (state.counters[counterKey] || 0) + 1;
    return state.counters[counterKey];
  }

  function recordAudit(
    actorUserId: number | null,
    action: string,
    entityType: string,
    entityId: string,
    details: string,
  ): void {
    state.audit_logs.push({
      id: nextId('audit'),
      actor_user_id: actorUserId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString(),
    });
  }

  function getEffectivePermissions(role: RoleKey): string[] {
    const rolePerms = state.permission_matrix[role] || {};
    return PERMISSIONS_CATALOG.map((p) => p.key).filter((k) => Boolean(rolePerms[k]));
  }

  function hasPermission(user: StoredUser, permKey: string): boolean {
    if (user.role === 'admin' && IMMUTABLE_ADMIN_PERMISSIONS.has(permKey)) {
      return true;
    }
    return Boolean(state.permission_matrix[user.role]?.[permKey]);
  }

  function authenticateUser(req: Request): StoredUser {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      throw new HttpError(401, 'Not authenticated');
    }
    const token = authHeader.slice(7).trim();
    const decoded = verifyJwt(token);
    const user = state.users.find((u) => u.username === decoded.sub);
    if (!user || !user.is_active) {
      throw new HttpError(401, 'User account is inactive or does not exist');
    }
    return user;
  }

  function requirePerm(req: Request, permKey: string): StoredUser {
    const user = authenticateUser(req);
    if (!hasPermission(user, permKey)) {
      throw new HttpError(403, `Missing required permission: ${permKey}`);
    }
    return user;
  }

  function serializeUser(u: StoredUser) {
    return {
      id: u.id,
      username: u.username,
      full_name_en: u.full_name_en,
      full_name_bn: u.full_name_bn,
      email: u.email,
      role: u.role,
      is_active: u.is_active,
      created_at: u.created_at,
      deactivated_at: u.deactivated_at,
    };
  }

  function nextVoucherNo(entryDate: string): string {
    const year = String(entryDate).slice(0, 4);
    const prefix = `JV-${year}-`;
    let maxSeq = 0;
    for (const j of state.journals) {
      if (j.voucher_no && j.voucher_no.startsWith(prefix)) {
        const tail = j.voucher_no.slice(prefix.length);
        if (/^\d+$/.test(tail)) {
          maxSeq = Math.max(maxSeq, Number(tail));
        }
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  function nextDocNumber(docType: string, issueDate: string): string {
    const prefixCode = DOC_PREFIX_MAP[docType] || 'DOC';
    const year = String(issueDate).slice(0, 4);
    const prefix = `${prefixCode}-${year}-`;
    let maxSeq = 0;
    for (const d of state.documents) {
      if (d.doc_number && d.doc_number.startsWith(prefix)) {
        const tail = d.doc_number.slice(prefix.length);
        if (/^\d+$/.test(tail)) {
          maxSeq = Math.max(maxSeq, Number(tail));
        }
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }

  function ensureOpenFiscalPeriod(entryDate: string): void {
    const closed = state.fiscal_periods.find(
      (fp) => fp.is_closed && fp.start_date <= entryDate && fp.end_date >= entryDate,
    );
    if (closed) {
      throw new HttpError(
        422,
        `Cannot post journal into closed fiscal period '${closed.name}' (${closed.start_date} to ${closed.end_date})`,
      );
    }
  }

  function validateJournalLines(
    linesInput: Array<{account_id: number; description?: string; debit?: unknown; credit?: unknown}>,
  ): Array<{account_id: number; description: string; debit: string; credit: string}> {
    if (!Array.isArray(linesInput) || linesInput.length < 2) {
      throw new HttpError(422, 'Journal requires at least 2 lines');
    }
    let totalDr = 0n;
    let totalCr = 0n;
    const normalized: Array<{account_id: number; description: string; debit: string; credit: string}> = [];

    linesInput.forEach((ln, idx) => {
      const dr = parseCents(ln.debit, 0n);
      const cr = parseCents(ln.credit, 0n);
      if (dr < 0n || cr < 0n || (dr > 0n && cr > 0n) || (dr === 0n && cr === 0n)) {
        throw new HttpError(
          422,
          `Line ${idx + 1}: Each journal line must contain either a positive debit or a positive credit, never both or zero`,
        );
      }
      const acc = state.accounts.find((a) => a.id === Number(ln.account_id));
      if (!acc) {
        throw new HttpError(422, `Account ${ln.account_id} does not exist`);
      }
      if (!acc.is_active) {
        throw new HttpError(
          422,
          `Account '${acc.code} - ${acc.name_en}' is inactive and cannot receive postings`,
        );
      }
      totalDr += dr;
      totalCr += cr;
      normalized.push({
        account_id: acc.id,
        description: String(ln.description || ''),
        debit: formatCents(dr),
        credit: formatCents(cr),
      });
    });

    if (totalDr <= 0n || totalDr !== totalCr) {
      throw new HttpError(
        422,
        `Journal is not balanced: total debit (${formatCents(totalDr)}) must equal total credit (${formatCents(totalCr)})`,
      );
    }
    return normalized;
  }

  function serializeJournal(j: StoredJournalEntry) {
    let totalDr = 0n;
    let totalCr = 0n;
    const creator = state.users.find((u) => u.id === j.created_by);
    const approver = j.approved_by ? state.users.find((u) => u.id === j.approved_by) : null;

    const lines = j.lines.map((ln) => {
      const acc = state.accounts.find((a) => a.id === ln.account_id);
      const dr = parseCents(ln.debit);
      const cr = parseCents(ln.credit);
      totalDr += dr;
      totalCr += cr;
      return {
        id: ln.id,
        account_id: ln.account_id,
        account_code: acc?.code || '',
        account_name_en: acc?.name_en || '',
        account_name_bn: acc?.name_bn || '',
        description: ln.description || '',
        debit: formatCents(dr),
        credit: formatCents(cr),
      };
    });

    return {
      id: j.id,
      voucher_no: j.voucher_no,
      entry_date: j.entry_date,
      memo: j.memo,
      reference: j.reference || '',
      status: j.status,
      total_debit: formatCents(totalDr),
      total_credit: formatCents(totalCr),
      created_by: j.created_by,
      created_by_username: creator?.username || '',
      approved_by: j.approved_by,
      approved_by_username: approver?.username || null,
      approved_at: j.approved_at,
      rejection_reason: j.rejection_reason,
      reversed_entry_id: j.reversed_entry_id,
      created_at: j.created_at,
      lines,
    };
  }

  function serializeEmployee(e: StoredEmployee) {
    const b = parseCents(e.basic_salary);
    const h = parseCents(e.house_rent);
    const m = parseCents(e.medical_allowance);
    const t = parseCents(e.transport_allowance);
    return {
      id: e.id,
      emp_code: e.emp_code,
      full_name_en: e.full_name_en,
      full_name_bn: e.full_name_bn,
      designation_en: e.designation_en,
      designation_bn: e.designation_bn,
      department: e.department,
      phone: e.phone,
      email: e.email,
      join_date: e.join_date,
      basic_salary: formatCents(b),
      house_rent: formatCents(h),
      medical_allowance: formatCents(m),
      transport_allowance: formatCents(t),
      gross_salary: formatCents(b + h + m + t),
      payment_method_pref: e.payment_method_pref,
      bank_account_no: e.bank_account_no,
      is_active: e.is_active,
    };
  }

  function serializeSalary(sp: StoredSalaryPayment) {
    const emp = state.employees.find((e) => e.id === sp.employee_id);
    const absDed = parseCents(sp.absent_deduction);
    const advDed = parseCents(sp.advance_deduction);
    const taxDed = parseCents(sp.tax_deduction);
    return {
      id: sp.id,
      payslip_no: sp.payslip_no,
      employee_id: sp.employee_id,
      emp_code: emp?.emp_code || '',
      full_name_en: emp?.full_name_en || '',
      full_name_bn: emp?.full_name_bn || '',
      designation_en: emp?.designation_en || '',
      designation_bn: emp?.designation_bn || '',
      department: emp?.department || '',
      bank_account_no: emp?.bank_account_no || '',
      salary_month: sp.salary_month,
      payment_date: sp.payment_date,
      working_days: sp.working_days,
      present_days: sp.present_days,
      late_days: sp.late_days,
      half_days: sp.half_days,
      leave_days: sp.leave_days,
      absent_days: sp.absent_days,
      overtime_hours: formatCents(parseCents(sp.overtime_hours)),
      basic_salary: formatCents(parseCents(sp.basic_salary)),
      house_rent: formatCents(parseCents(sp.house_rent)),
      medical_allowance: formatCents(parseCents(sp.medical_allowance)),
      transport_allowance: formatCents(parseCents(sp.transport_allowance)),
      gross_salary: formatCents(parseCents(sp.gross_salary)),
      overtime_pay: formatCents(parseCents(sp.overtime_pay)),
      bonus_amount: formatCents(parseCents(sp.bonus_amount)),
      absent_deduction: formatCents(absDed),
      advance_deduction: formatCents(advDed),
      tax_deduction: formatCents(taxDed),
      total_deductions: formatCents(absDed + advDed + taxDed),
      net_payable: formatCents(parseCents(sp.net_payable)),
      payment_method: sp.payment_method,
      status: sp.status,
      linked_journal_id: sp.linked_journal_id,
      notes: sp.notes,
    };
  }

  function serializeDocument(doc: StoredBusinessDocument) {
    let subtotalCents = 0n;
    const items = doc.items.map((it) => {
      const amt = parseCents(it.amount);
      subtotalCents += amt;
      return {
        id: it.id,
        description_en: it.description_en,
        description_bn: it.description_bn,
        quantity: formatCents(parseCents(it.quantity)),
        unit_price: formatCents(parseCents(it.unit_price)),
        amount: formatCents(amt),
      };
    });
    const discountCents = parseCents(doc.discount_amount);
    const taxableCents = subtotalCents > discountCents ? subtotalCents - discountCents : 0n;
    const taxRateCents = parseCents(doc.tax_rate_percent);
    const taxAmountCents = divRound(taxableCents * taxRateCents, 10000n);
    const grandTotalCents = taxableCents + taxAmountCents;

    return {
      id: doc.id,
      doc_type: doc.doc_type,
      doc_number: doc.doc_number,
      issue_date: doc.issue_date,
      due_date: doc.due_date,
      party_name_en: doc.party_name_en,
      party_name_bn: doc.party_name_bn,
      party_address: doc.party_address,
      subject_en: doc.subject_en,
      subject_bn: doc.subject_bn,
      body_en: doc.body_en,
      body_bn: doc.body_bn,
      payment_method: doc.payment_method,
      currency: doc.currency,
      discount_amount: formatCents(discountCents),
      tax_rate_percent: formatCents(taxRateCents),
      subtotal: formatCents(subtotalCents),
      tax_amount: formatCents(taxAmountCents),
      grand_total: formatCents(grandTotalCents),
      notes_en: doc.notes_en,
      notes_bn: doc.notes_bn,
      status: doc.status,
      linked_journal_id: doc.linked_journal_id ?? null,
      created_by: doc.created_by,
      created_at: doc.created_at,
      items,
    };
  }

  function nextProjectCode(startDate: string): string {
    const year = String(startDate).slice(0, 4) || String(new Date().getFullYear());
    const prefix = `PRJ-${year}-`;
    let maxSeq = 0;
    for (const p of state.projects) {
      if (p.project_code && p.project_code.startsWith(prefix)) {
        const tail = p.project_code.slice(prefix.length);
        if (/^\d+$/.test(tail)) {
          maxSeq = Math.max(maxSeq, Number(tail));
        }
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  function serializeProject(p: StoredSoftwareProject) {
    const contractCents = parseCents(p.contract_value, 0n);
    const billedCents = parseCents(p.billed_amount, 0n);
    const receivedCents = parseCents(p.received_amount, 0n);
    const dueCents = billedCents > receivedCents ? billedCents - receivedCents : 0n;
    return {
      id: p.id,
      project_code: p.project_code,
      name_en: p.name_en,
      name_bn: p.name_bn,
      client_name_en: p.client_name_en,
      client_name_bn: p.client_name_bn,
      client_contact: p.client_contact,
      tech_stack: p.tech_stack,
      status: p.status,
      progress_percent: Math.max(0, Math.min(100, Number(p.progress_percent || 0))),
      start_date: p.start_date,
      deadline: p.deadline,
      contract_value: formatCents(contractCents),
      billed_amount: formatCents(billedCents),
      received_amount: formatCents(receivedCents),
      due_amount: formatCents(dueCents),
      manager_username: p.manager_username,
      notes: p.notes,
      created_at: p.created_at,
    };
  }

  function computeVerifiedTrialBalance(startDate?: string, asOfDate?: string, includeZero = false) {
    const postedStatuses = new Set(['posted', 'reversed']);
    const sortedAccounts = [...state.accounts].sort((a, b) => a.code.localeCompare(b.code));
    const rows = [];

    let totalOd = 0n;
    let totalOc = 0n;
    let totalPd = 0n;
    let totalPc = 0n;
    let totalCd = 0n;
    let totalCc = 0n;
    const abnormalCodes: string[] = [];

    for (const acc of sortedAccounts) {
      let openNet = parseCents(acc.opening_debit) - parseCents(acc.opening_credit);
      if (startDate) {
        for (const je of state.journals) {
          if (!postedStatuses.has(je.status) || je.entry_date >= startDate) continue;
          for (const ln of je.lines) {
            if (ln.account_id === acc.id) {
              openNet += parseCents(ln.debit) - parseCents(ln.credit);
            }
          }
        }
      }

      const effOd = openNet > 0n ? openNet : 0n;
      const effOc = openNet < 0n ? -openNet : 0n;

      let mDr = 0n;
      let mCr = 0n;
      for (const je of state.journals) {
        if (!postedStatuses.has(je.status)) continue;
        if (startDate && je.entry_date < startDate) continue;
        if (asOfDate && je.entry_date > asOfDate) continue;
        for (const ln of je.lines) {
          if (ln.account_id === acc.id) {
            mDr += parseCents(ln.debit);
            mCr += parseCents(ln.credit);
          }
        }
      }

      const closingNet = effOd + mDr - (effOc + mCr);
      const cDr = closingNet > 0n ? closingNet : 0n;
      const cCr = closingNet < 0n ? -closingNet : 0n;

      const isAllZero = effOd === 0n && effOc === 0n && mDr === 0n && mCr === 0n && cDr === 0n && cCr === 0n;
      if (isAllZero && (!includeZero || !acc.is_active)) {
        continue;
      }

      const isAbnormal =
        (acc.normal_balance === 'debit' && closingNet < 0n) ||
        (acc.normal_balance === 'credit' && closingNet > 0n);
      if (isAbnormal) {
        abnormalCodes.push(acc.code);
      }

      totalOd += effOd;
      totalOc += effOc;
      totalPd += mDr;
      totalPc += mCr;
      totalCd += cDr;
      totalCc += cCr;

      rows.push({
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name_en,
        account_name_bn: acc.name_bn,
        account_type: acc.account_type,
        normal_balance: acc.normal_balance,
        opening_debit: formatCents(effOd),
        opening_credit: formatCents(effOc),
        period_debit: formatCents(mDr),
        period_credit: formatCents(mCr),
        debit: formatCents(cDr),
        credit: formatCents(cCr),
        is_abnormal_balance: isAbnormal,
      });
    }

    let rawDr = 0n;
    let rawCr = 0n;
    for (const je of state.journals) {
      if (!postedStatuses.has(je.status)) continue;
      if (startDate && je.entry_date < startDate) continue;
      if (asOfDate && je.entry_date > asOfDate) continue;
      for (const ln of je.lines) {
        rawDr += parseCents(ln.debit);
        rawCr += parseCents(ln.credit);
      }
    }

    const unpostedCount = state.journals.filter((j) =>
      ['draft', 'pending_approval', 'rejected'].includes(j.status),
    ).length;

    const algebraicLhs = totalOd - totalOc + (totalPd - totalPc);
    const algebraicRhs = totalCd - totalCc;
    const discrepancy =
      absBigInt(algebraicLhs - algebraicRhs) +
      absBigInt(totalPd - rawDr) +
      absBigInt(totalPc - rawCr);

    return {
      start_date: startDate || null,
      as_of_date: asOfDate || null,
      rows,
      total_opening_debit: formatCents(totalOd),
      total_opening_credit: formatCents(totalOc),
      total_period_debit: formatCents(totalPd),
      total_period_credit: formatCents(totalPc),
      total_closing_debit: formatCents(totalCd),
      total_closing_credit: formatCents(totalCc),
      verification: {
        is_opening_balanced: totalOd === totalOc,
        is_movement_balanced: totalPd === totalPc,
        is_closing_balanced: totalCd === totalCc,
        ledger_reconciled: discrepancy === 0n && rawDr === rawCr,
        raw_journal_debit_sum: formatCents(rawDr),
        raw_journal_credit_sum: formatCents(rawCr),
        reconciliation_discrepancy: formatCents(discrepancy),
        excluded_unposted_journals: unpostedCount,
        abnormal_balance_codes: abnormalCodes,
        safeguard_notice_en:
          'Trial Balance applies normal-balance presentation rules and independent ledger sum verification. Complete year-end closing entries and independent CPA/CA review before statutory financial filing.',
        safeguard_notice_bn:
          'এই ট্রায়াল ব্যালেন্সে নরমাল-ব্যালেন্স নিয়ম এবং স্বতন্ত্র লেজার যাচাইকরণ প্রয়োগ করা হয়েছে। আনুষ্ঠানিক আর্থিক বিবরণী দাখিলের পূর্বে বর্ষসমাপ্তি এন্ট্রি ও নিরীক্ষকের যাচাই সম্পন্ন করুন।',
      },
    };
  }

  function computeFinancialStatements(startDate?: string, asOfDate?: string) {
    const postedStatuses = new Set(['posted', 'reversed']);
    const sortedAccounts = [...state.accounts]
      .filter((a) => a.is_active)
      .sort((a, b) => a.code.localeCompare(b.code));

    const revenue_lines = [];
    const expense_lines = [];
    const asset_lines = [];
    const liability_lines = [];
    const equity_lines = [];

    let totalRevenue = 0n;
    let totalExpenses = 0n;
    let totalAssets = 0n;
    let totalLiabilities = 0n;
    let postedEquity = 0n;
    let cumulativeRevenue = 0n;
    let cumulativeExpense = 0n;

    const codeBalances = new Map<string, bigint>();

    for (const acc of sortedAccounts) {
      // Cumulative net debit-minus-credit up to asOfDate (for Balance Sheet)
      let cumDrMinusCr = parseCents(acc.opening_debit) - parseCents(acc.opening_credit);
      // Period net movement within [startDate, asOfDate] (for Income Statement)
      let periodDrMinusCr = startDate ? 0n : cumDrMinusCr;

      for (const je of state.journals) {
        if (!postedStatuses.has(je.status)) continue;
        if (asOfDate && je.entry_date > asOfDate) continue;
        for (const ln of je.lines) {
          if (ln.account_id !== acc.id) continue;
          const diff = parseCents(ln.debit) - parseCents(ln.credit);
          cumDrMinusCr += diff;
          if (!startDate || je.entry_date >= startDate) {
            periodDrMinusCr += diff;
          }
        }
      }

      const normalCumulative = acc.normal_balance === 'debit' ? cumDrMinusCr : -cumDrMinusCr;
      const normalPeriod = acc.normal_balance === 'debit' ? periodDrMinusCr : -periodDrMinusCr;
      codeBalances.set(acc.code, normalCumulative);

      if (acc.account_type === 'revenue') {
        totalRevenue += normalPeriod;
        cumulativeRevenue += normalCumulative;
        revenue_lines.push({
          account_id: acc.id,
          account_code: acc.code,
          account_name_en: acc.name_en,
          account_name_bn: acc.name_bn,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          balance: formatCents(normalPeriod),
          is_contra: normalPeriod < 0n,
        });
      } else if (acc.account_type === 'expense') {
        totalExpenses += normalPeriod;
        cumulativeExpense += normalCumulative;
        expense_lines.push({
          account_id: acc.id,
          account_code: acc.code,
          account_name_en: acc.name_en,
          account_name_bn: acc.name_bn,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          balance: formatCents(normalPeriod),
          is_contra: normalPeriod < 0n,
        });
      } else if (acc.account_type === 'asset') {
        totalAssets += normalCumulative;
        asset_lines.push({
          account_id: acc.id,
          account_code: acc.code,
          account_name_en: acc.name_en,
          account_name_bn: acc.name_bn,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          balance: formatCents(normalCumulative),
          is_contra: normalCumulative < 0n,
        });
      } else if (acc.account_type === 'liability') {
        totalLiabilities += normalCumulative;
        liability_lines.push({
          account_id: acc.id,
          account_code: acc.code,
          account_name_en: acc.name_en,
          account_name_bn: acc.name_bn,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          balance: formatCents(normalCumulative),
          is_contra: normalCumulative < 0n,
        });
      } else if (acc.account_type === 'equity') {
        postedEquity += normalCumulative;
        equity_lines.push({
          account_id: acc.id,
          account_code: acc.code,
          account_name_en: acc.name_en,
          account_name_bn: acc.name_bn,
          account_type: acc.account_type,
          normal_balance: acc.normal_balance,
          balance: formatCents(normalCumulative),
          is_contra: normalCumulative < 0n,
        });
      }
    }

    const netIncome = totalRevenue - totalExpenses;
    const unclosedSurplus = cumulativeRevenue - cumulativeExpense;
    const totalEquityWithNetIncome = postedEquity + unclosedSurplus;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquityWithNetIncome;
    const eqDiff = totalAssets - totalLiabilitiesAndEquity;
    const marginBps = totalRevenue > 0n ? divRound(netIncome * 10000n, totalRevenue) : 0n;

    const pettyCash = codeBalances.get('1010') ?? 0n;
    const bankBal = codeBalances.get('1020') ?? 0n;
    const receivables = codeBalances.get('1100') ?? 0n;
    const payables = codeBalances.get('2010') ?? 0n;
    const accrued = codeBalances.get('2200') ?? 0n;

    return {
      start_date: startDate || null,
      as_of_date: asOfDate || null,
      revenue_lines,
      expense_lines,
      total_revenue: formatCents(totalRevenue),
      total_expenses: formatCents(totalExpenses),
      net_income: formatCents(netIncome),
      profit_margin_percent: formatCents(marginBps),
      asset_lines,
      liability_lines,
      equity_lines,
      total_assets: formatCents(totalAssets),
      total_liabilities: formatCents(totalLiabilities),
      posted_equity: formatCents(postedEquity),
      total_equity_with_net_income: formatCents(totalEquityWithNetIncome),
      total_liabilities_and_equity: formatCents(totalLiabilitiesAndEquity),
      accounting_equation_difference: formatCents(eqDiff),
      is_balance_sheet_balanced: eqDiff === 0n,
      cash_and_bank: {
        petty_cash: formatCents(pettyCash),
        bank_balance: formatCents(bankBal),
        total_liquid_cash: formatCents(pettyCash + bankBal),
        accounts_receivable: formatCents(receivables),
        accounts_payable: formatCents(payables),
        accrued_liabilities: formatCents(accrued),
        net_working_capital: formatCents(totalAssets - totalLiabilities),
      },
    };
  }

  function buildFullBackupArchive() {
    const rolePermsFlat: Array<{role: string; permission_key: string; allowed: boolean}> = [];
    for (const role of VALID_ROLES) {
      for (const perm of PERMISSIONS_CATALOG) {
        rolePermsFlat.push({
          role,
          permission_key: perm.key,
          allowed: Boolean(state.permission_matrix[role]?.[perm.key]),
        });
      }
    }

    const cp = state.company_profile;
    const body = {
      schema_version: '0003_production_erp_full',
      exported_at: new Date().toISOString(),
      company_profile: {
        name_en: cp.name_en,
        name_bn: cp.name_bn,
        tagline_en: cp.tagline_en,
        tagline_bn: cp.tagline_bn,
        logo_url: cp.logo_url,
        banner_url: cp.banner_url,
        registration_no: cp.registration_no,
        tin_no: cp.tin_no,
        bin_no: cp.bin_no,
        address_en: cp.address_en,
        address_bn: cp.address_bn,
        phone: cp.phone,
        email: cp.email,
        website: cp.website,
        currency: cp.currency,
        fiscal_year_start_month: cp.fiscal_year_start_month,
      },
      role_permissions: rolePermsFlat,
      fiscal_periods: state.fiscal_periods.map((fp) => ({
        id: fp.id,
        name: fp.name,
        start_date: fp.start_date,
        end_date: fp.end_date,
        is_closed: fp.is_closed,
      })),
      accounts: state.accounts.map((a) => ({
        id: a.id,
        code: a.code,
        name_en: a.name_en,
        name_bn: a.name_bn,
        account_type: a.account_type,
        normal_balance: a.normal_balance,
        parent_code: a.parent_code,
        description_en: a.description_en,
        description_bn: a.description_bn,
        opening_debit: formatCents(parseCents(a.opening_debit)),
        opening_credit: formatCents(parseCents(a.opening_credit)),
        is_system: a.is_system,
        is_active: a.is_active,
      })),
      employees: state.employees.map((e) => ({
        id: e.id,
        emp_code: e.emp_code,
        full_name_en: e.full_name_en,
        full_name_bn: e.full_name_bn,
        designation_en: e.designation_en,
        designation_bn: e.designation_bn,
        department: e.department,
        phone: e.phone,
        email: e.email,
        join_date: e.join_date,
        basic_salary: formatCents(parseCents(e.basic_salary)),
        house_rent: formatCents(parseCents(e.house_rent)),
        medical_allowance: formatCents(parseCents(e.medical_allowance)),
        transport_allowance: formatCents(parseCents(e.transport_allowance)),
        payment_method_pref: e.payment_method_pref,
        bank_account_no: e.bank_account_no,
        is_active: e.is_active,
      })),
      attendance_records: state.attendance_records.map((r) => ({
        employee_id: r.employee_id,
        attendance_date: r.attendance_date,
        status: r.status,
        check_in: r.check_in,
        check_out: r.check_out,
        overtime_hours: formatCents(parseCents(r.overtime_hours)),
        note: r.note,
      })),
      journal_entries: state.journals.map((j) => ({
        id: j.id,
        voucher_no: j.voucher_no,
        entry_date: j.entry_date,
        memo: j.memo,
        reference: j.reference,
        status: j.status,
        created_by: j.created_by,
        lines: j.lines.map((ln) => ({
          account_id: ln.account_id,
          description: ln.description,
          debit: formatCents(parseCents(ln.debit)),
          credit: formatCents(parseCents(ln.credit)),
        })),
      })),
      salary_payments: state.salary_payments.map((s) => ({
        id: s.id,
        payslip_no: s.payslip_no,
        employee_id: s.employee_id,
        salary_month: s.salary_month,
        payment_date: s.payment_date,
        working_days: s.working_days,
        present_days: s.present_days,
        late_days: s.late_days,
        half_days: s.half_days,
        leave_days: s.leave_days,
        absent_days: s.absent_days,
        overtime_hours: formatCents(parseCents(s.overtime_hours)),
        basic_salary: formatCents(parseCents(s.basic_salary)),
        house_rent: formatCents(parseCents(s.house_rent)),
        medical_allowance: formatCents(parseCents(s.medical_allowance)),
        transport_allowance: formatCents(parseCents(s.transport_allowance)),
        gross_salary: formatCents(parseCents(s.gross_salary)),
        overtime_pay: formatCents(parseCents(s.overtime_pay)),
        bonus_amount: formatCents(parseCents(s.bonus_amount)),
        absent_deduction: formatCents(parseCents(s.absent_deduction)),
        advance_deduction: formatCents(parseCents(s.advance_deduction)),
        tax_deduction: formatCents(parseCents(s.tax_deduction)),
        net_payable: formatCents(parseCents(s.net_payable)),
        payment_method: s.payment_method,
        status: s.status,
        linked_journal_id: s.linked_journal_id,
        notes: s.notes,
      })),
      business_documents: state.documents.map((d) => ({
        id: d.id,
        doc_type: d.doc_type,
        doc_number: d.doc_number,
        issue_date: d.issue_date,
        due_date: d.due_date,
        party_name_en: d.party_name_en,
        party_name_bn: d.party_name_bn,
        party_address: d.party_address,
        subject_en: d.subject_en,
        subject_bn: d.subject_bn,
        body_en: d.body_en,
        body_bn: d.body_bn,
        payment_method: d.payment_method,
        currency: d.currency,
        discount_amount: formatCents(parseCents(d.discount_amount)),
        tax_rate_percent: formatCents(parseCents(d.tax_rate_percent)),
        notes_en: d.notes_en,
        notes_bn: d.notes_bn,
        status: d.status,
        items: d.items.map((it) => ({
          description_en: it.description_en,
          description_bn: it.description_bn,
          quantity: formatCents(parseCents(it.quantity)),
          unit_price: formatCents(parseCents(it.unit_price)),
          amount: formatCents(parseCents(it.amount)),
        })),
      })),
      projects: state.projects.map((p) => ({
        id: p.id,
        project_code: p.project_code,
        name_en: p.name_en,
        name_bn: p.name_bn,
        client_name_en: p.client_name_en,
        client_name_bn: p.client_name_bn,
        client_contact: p.client_contact,
        tech_stack: p.tech_stack,
        status: p.status,
        progress_percent: p.progress_percent,
        start_date: p.start_date,
        deadline: p.deadline,
        contract_value: formatCents(parseCents(p.contract_value, 0n)),
        billed_amount: formatCents(parseCents(p.billed_amount, 0n)),
        received_amount: formatCents(parseCents(p.received_amount, 0n)),
        manager_username: p.manager_username,
        notes: p.notes,
        created_at: p.created_at,
      })),
    };

    const canonical = canonicalJsonString(body);
    const checksum = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    return {checksum_sha256: checksum, data: body};
  }

  function listSnapshots() {
    fs.mkdirSync(snapshotDir, {recursive: true});
    const files = fs
      .readdirSync(snapshotDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    return files.map((filename) => {
      const fullPath = path.join(snapshotDir, filename);
      const buf = fs.readFileSync(fullPath);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        created_at: stat.mtime.toISOString(),
        size_bytes: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      };
    });
  }

  router.use(express.json({limit: '10mb'}));
  router.use(express.urlencoded({extended: false}));

  // --- Health ---
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'NEXTGEN TECHNIX LIMITED ERP API',
      version: '0.3.0',
      runtime: 'node-typescript',
    });
  });

  // --- Authentication & Users ---
  router.post('/auth/token', (req: Request, res: Response, next: NextFunction) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const user = state.users.find((u) => u.username === username);
      if (!user || !user.is_active || !verifyPassword(password, user.password_digest)) {
        throw new HttpError(401, 'Incorrect username, password, or deactivated account');
      }
      res.json({access_token: signJwt(user), token_type: 'bearer'});
    } catch (e) {
      next(e);
    }
  });

  router.get('/auth/me', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = authenticateUser(req);
      res.json({
        id: user.id,
        username: user.username,
        full_name_en: user.full_name_en,
        full_name_bn: user.full_name_bn,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        permissions: getEffectivePermissions(user.role),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/auth/change-password', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = authenticateUser(req);
      const currentPassword = String(req.body?.current_password || '');
      const newPassword = String(req.body?.new_password || '');
      if (!verifyPassword(currentPassword, user.password_digest)) {
        throw new HttpError(401, 'Current password is incorrect');
      }
      if (newPassword.length < 10) {
        throw new HttpError(422, 'New password must be at least 10 characters');
      }
      user.password_digest = hashPassword(newPassword);
      recordAudit(user.id, 'user.password_changed_self', 'user', String(user.id), `User '${user.username}' updated own password`);
      persistState();
      res.json({status: 'password_updated'});
    } catch (e) {
      next(e);
    }
  });

  router.get('/users', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'users:manage');
      const sorted = [...state.users].sort((a, b) => a.id - b.id);
      res.json(sorted.map(serializeUser));
    } catch (e) {
      next(e);
    }
  });

  router.post('/users', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'users:manage');
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');
      const role = String(req.body?.role || 'employee') as RoleKey;

      if (!/^[a-zA-Z0-9_.-]{3,80}$/.test(username)) {
        throw new HttpError(422, 'Username must be 3-80 characters (letters, numbers, _ . -)');
      }
      if (password.length < 10) {
        throw new HttpError(422, 'Password must be at least 10 characters');
      }
      if (!VALID_ROLES.includes(role)) {
        throw new HttpError(422, `Invalid role: ${role}`);
      }
      if (state.users.some((u) => u.username === username)) {
        throw new HttpError(409, 'Username already exists');
      }

      const newUser: StoredUser = {
        id: nextId('user'),
        username,
        full_name_en: String(req.body?.full_name_en || ''),
        full_name_bn: String(req.body?.full_name_bn || ''),
        email: String(req.body?.email || ''),
        password_digest: hashPassword(password),
        role,
        is_active: true,
        created_at: new Date().toISOString(),
        deactivated_at: null,
        deactivated_by: null,
      };
      state.users.push(newUser);
      recordAudit(actor.id, 'user.created', 'user', String(newUser.id), `Created user '${username}' with role '${role}'`);
      persistState();
      res.status(201).json(serializeUser(newUser));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/users/:userId/status', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'users:manage');
      const userId = Number(req.params.userId);
      const target = state.users.find((u) => u.id === userId);
      if (!target) throw new HttpError(404, 'User not found');

      const isActive = Boolean(req.body?.is_active);
      if (!isActive && target.id === actor.id) {
        throw new HttpError(422, 'Administrators cannot deactivate their own active session account');
      }
      if (!isActive && target.role === 'admin') {
        const activeAdmins = state.users.filter((u) => u.role === 'admin' && u.is_active).length;
        if (activeAdmins <= 1) {
          throw new HttpError(422, 'Cannot deactivate the last active administrator');
        }
      }

      target.is_active = isActive;
      target.deactivated_at = isActive ? null : new Date().toISOString();
      target.deactivated_by = isActive ? null : actor.id;

      recordAudit(
        actor.id,
        isActive ? 'user.activated' : 'user.deactivated',
        'user',
        String(target.id),
        `Set is_active=${isActive} for '${target.username}'`,
      );
      persistState();
      res.json(serializeUser(target));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/users/:userId/role', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'users:manage');
      const userId = Number(req.params.userId);
      const target = state.users.find((u) => u.id === userId);
      if (!target) throw new HttpError(404, 'User not found');

      const newRole = String(req.body?.role || '') as RoleKey;
      if (!VALID_ROLES.includes(newRole)) {
        throw new HttpError(422, `Invalid role: ${newRole}`);
      }
      if (target.role === 'admin' && newRole !== 'admin') {
        const activeAdmins = state.users.filter((u) => u.role === 'admin' && u.is_active).length;
        if (activeAdmins <= 1) {
          throw new HttpError(422, 'Cannot change role of the last active administrator');
        }
      }

      const oldRole = target.role;
      target.role = newRole;
      recordAudit(
        actor.id,
        'user.role_updated',
        'user',
        String(target.id),
        `Changed role of '${target.username}' from '${oldRole}' to '${newRole}'`,
      );
      persistState();
      res.json(serializeUser(target));
    } catch (e) {
      next(e);
    }
  });

  router.post('/users/:userId/reset-password', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'users:manage');
      const userId = Number(req.params.userId);
      const target = state.users.find((u) => u.id === userId);
      if (!target) throw new HttpError(404, 'User not found');

      const newPassword = String(req.body?.new_password || '');
      if (newPassword.length < 10) {
        throw new HttpError(422, 'Password must be at least 10 characters');
      }
      target.password_digest = hashPassword(newPassword);
      recordAudit(actor.id, 'user.password_reset', 'user', String(target.id), `Administrator reset password for '${target.username}'`);
      persistState();
      res.json(serializeUser(target));
    } catch (e) {
      next(e);
    }
  });

  // --- Permission Matrix ---
  router.get('/permissions/matrix', (req: Request, res: Response, next: NextFunction) => {
    try {
      authenticateUser(req);
      res.json({
        roles: ROLES_META,
        permissions: PERMISSIONS_CATALOG,
        immutable_admin_permissions: Array.from(IMMUTABLE_ADMIN_PERMISSIONS).sort(),
        matrix: state.permission_matrix,
      });
    } catch (e) {
      next(e);
    }
  });

  router.put('/permissions/matrix', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'permissions:manage');
      const incoming = req.body?.matrix as Record<string, Record<string, boolean>> | undefined;
      if (!incoming || typeof incoming !== 'object') {
        throw new HttpError(422, 'Invalid matrix payload');
      }

      for (const [role, perms] of Object.entries(incoming)) {
        if (!VALID_ROLES.includes(role as RoleKey)) {
          throw new HttpError(422, `Unknown role: '${role}'`);
        }
        for (const [pkey, allowed] of Object.entries(perms || {})) {
          if (!ALL_PERMISSION_KEYS.has(pkey)) {
            throw new HttpError(422, `Unknown permission key: '${pkey}'`);
          }
          if (role === 'admin' && IMMUTABLE_ADMIN_PERMISSIONS.has(pkey) && !allowed) {
            throw new HttpError(422, `Administrator role must retain core governance permission '${pkey}'`);
          }
        }
      }

      for (const [role, perms] of Object.entries(incoming)) {
        const r = role as RoleKey;
        state.permission_matrix[r] = state.permission_matrix[r] || {};
        for (const [pkey, allowed] of Object.entries(perms || {})) {
          state.permission_matrix[r][pkey] = Boolean(allowed);
        }
      }

      recordAudit(actor.id, 'permissions.matrix_updated', 'role_permissions', 'matrix', 'Updated configurable role permission matrix');
      persistState();
      res.json({
        roles: ROLES_META,
        permissions: PERMISSIONS_CATALOG,
        immutable_admin_permissions: Array.from(IMMUTABLE_ADMIN_PERMISSIONS).sort(),
        matrix: state.permission_matrix,
      });
    } catch (e) {
      next(e);
    }
  });

  // --- Company & Fiscal Periods ---
  router.get('/company', (req: Request, res: Response, next: NextFunction) => {
    try {
      authenticateUser(req);
      res.json(state.company_profile);
    } catch (e) {
      next(e);
    }
  });

  router.put('/company', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'company:manage');
      const body = req.body || {};
      const nameEn = String(body.name_en || '').trim();
      if (nameEn.length < 2) {
        throw new HttpError(422, 'Company English name is required');
      }

      state.company_profile = {
        ...state.company_profile,
        name_en: nameEn,
        name_bn: String(body.name_bn ?? state.company_profile.name_bn),
        tagline_en: String(body.tagline_en ?? state.company_profile.tagline_en),
        tagline_bn: String(body.tagline_bn ?? state.company_profile.tagline_bn),
        logo_url: String(body.logo_url || '/company-logo.jpg'),
        banner_url: String(body.banner_url || '/company-hq.jpg'),
        registration_no: String(body.registration_no ?? state.company_profile.registration_no),
        tin_no: String(body.tin_no ?? state.company_profile.tin_no),
        bin_no: String(body.bin_no ?? state.company_profile.bin_no),
        address_en: String(body.address_en ?? state.company_profile.address_en),
        address_bn: String(body.address_bn ?? state.company_profile.address_bn),
        phone: String(body.phone ?? state.company_profile.phone),
        email: String(body.email ?? state.company_profile.email),
        website: String(body.website ?? state.company_profile.website),
        currency: String(body.currency || 'BDT'),
        fiscal_year_start_month: Number(body.fiscal_year_start_month || 7),
        updated_at: new Date().toISOString(),
      };

      recordAudit(actor.id, 'company.updated', 'company_profile', '1', `Updated company profile '${nameEn}'`);
      persistState();
      res.json(state.company_profile);
    } catch (e) {
      next(e);
    }
  });

  router.get('/fiscal-periods', (req: Request, res: Response, next: NextFunction) => {
    try {
      authenticateUser(req);
      const sorted = [...state.fiscal_periods].sort((a, b) => b.start_date.localeCompare(a.start_date));
      res.json(sorted);
    } catch (e) {
      next(e);
    }
  });

  router.post('/fiscal-periods', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'company:manage');
      const name = String(req.body?.name || '').trim();
      const startDate = String(req.body?.start_date || '').trim();
      const endDate = String(req.body?.end_date || '').trim();

      if (name.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new HttpError(422, 'Valid fiscal period name, start_date, and end_date are required');
      }
      if (endDate < startDate) {
        throw new HttpError(422, 'end_date must be on or after start_date');
      }
      if (state.fiscal_periods.some((fp) => fp.name === name)) {
        throw new HttpError(409, 'Fiscal period name already exists');
      }

      const fp: StoredFiscalPeriod = {
        id: nextId('period'),
        name,
        start_date: startDate,
        end_date: endDate,
        is_closed: false,
        closed_at: null,
        closed_by: null,
      };
      state.fiscal_periods.push(fp);
      recordAudit(actor.id, 'fiscal_period.created', 'fiscal_period', name, `${startDate} to ${endDate}`);
      persistState();
      res.status(201).json(fp);
    } catch (e) {
      next(e);
    }
  });

  router.post('/fiscal-periods/:periodId/toggle-close', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'company:manage');
      const fp = state.fiscal_periods.find((p) => p.id === Number(req.params.periodId));
      if (!fp) throw new HttpError(404, 'Fiscal period not found');

      fp.is_closed = !fp.is_closed;
      fp.closed_at = fp.is_closed ? new Date().toISOString() : null;
      fp.closed_by = fp.is_closed ? actor.id : null;
      recordAudit(
        actor.id,
        fp.is_closed ? 'fiscal_period.closed' : 'fiscal_period.reopened',
        'fiscal_period',
        String(fp.id),
        `Fiscal period '${fp.name}' is_closed=${fp.is_closed}`,
      );
      persistState();
      res.json(fp);
    } catch (e) {
      next(e);
    }
  });

  router.get('/audit-logs', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'users:manage');
      const limit = Math.min(Number(req.query.limit || 50), 200);
      const logs = [...state.audit_logs].sort((a, b) => b.id - a.id).slice(0, limit);
      res.json(
        logs.map((l) => {
          const u = l.actor_user_id ? state.users.find((x) => x.id === l.actor_user_id) : null;
          return {
            id: l.id,
            actor_user_id: l.actor_user_id,
            actor_username: u?.username || 'system',
            action: l.action,
            entity_type: l.entity_type,
            entity_id: l.entity_id,
            details: l.details,
            created_at: l.created_at,
          };
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  // --- Chart of Accounts ---
  router.get('/accounts', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'accounts:view');
      const includeInactive = String(req.query.include_inactive ?? 'true') !== 'false';
      const list = state.accounts
        .filter((a) => includeInactive || a.is_active)
        .sort((a, b) => a.code.localeCompare(b.code));
      res.json(list);
    } catch (e) {
      next(e);
    }
  });

  router.post('/accounts', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'accounts:manage');
      const code = String(req.body?.code || '').trim();
      const nameEn = String(req.body?.name_en || '').trim();
      const accountType = String(req.body?.account_type || '') as AccountType;

      if (!/^[A-Za-z0-9-]{1,20}$/.test(code) || !nameEn) {
        throw new HttpError(422, 'Valid account code and English name are required');
      }
      if (!(accountType in ACCOUNT_NORMAL_BALANCE_MAP)) {
        throw new HttpError(422, `Invalid account_type: ${accountType}`);
      }
      const od = parseCents(req.body?.opening_debit, 0n);
      const oc = parseCents(req.body?.opening_credit, 0n);
      if (od < 0n || oc < 0n || (od > 0n && oc > 0n)) {
        throw new HttpError(422, 'An account cannot have both opening_debit and opening_credit greater than zero');
      }
      if (state.accounts.some((a) => a.code === code)) {
        throw new HttpError(409, 'Account code already exists');
      }

      const acc: StoredAccount = {
        id: nextId('account'),
        code,
        name_en: nameEn,
        name_bn: String(req.body?.name_bn || ''),
        account_type: accountType,
        normal_balance: ACCOUNT_NORMAL_BALANCE_MAP[accountType],
        parent_code: req.body?.parent_code ? String(req.body.parent_code) : null,
        description_en: String(req.body?.description_en || ''),
        description_bn: String(req.body?.description_bn || ''),
        opening_debit: formatCents(od),
        opening_credit: formatCents(oc),
        is_system: false,
        is_active: true,
      };
      state.accounts.push(acc);
      recordAudit(actor.id, 'account.created', 'account', acc.code, `Created ${acc.account_type} account '${acc.code} - ${acc.name_en}'`);
      persistState();
      res.json(acc);
    } catch (e) {
      next(e);
    }
  });

  router.post('/accounts/reset-opening-balances', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'accounts:manage');
      for (const acc of state.accounts) {
        acc.opening_debit = '0.00';
        acc.opening_credit = '0.00';
      }
      recordAudit(
        actor.id,
        'accounts.opening_zeroed',
        'account',
        'all',
        `Reset opening_debit and opening_credit to 0.00 across ${state.accounts.length} accounts`,
      );
      persistState();
      res.json([...state.accounts].sort((a, b) => a.code.localeCompare(b.code)));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/accounts/:accountId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = requirePerm(req, 'accounts:manage');
      const acc = state.accounts.find((a) => a.id === Number(req.params.accountId));
      if (!acc) throw new HttpError(404, 'Account not found');

      const newOd = req.body?.opening_debit !== undefined ? parseCents(req.body.opening_debit) : parseCents(acc.opening_debit);
      const newOc = req.body?.opening_credit !== undefined ? parseCents(req.body.opening_credit) : parseCents(acc.opening_credit);
      if (newOd < 0n || newOc < 0n || (newOd > 0n && newOc > 0n)) {
        throw new HttpError(422, 'An account cannot simultaneously hold opening_debit and opening_credit');
      }

      if (req.body?.name_en !== undefined) acc.name_en = String(req.body.name_en);
      if (req.body?.name_bn !== undefined) acc.name_bn = String(req.body.name_bn);
      if (req.body?.description_en !== undefined) acc.description_en = String(req.body.description_en);
      if (req.body?.description_bn !== undefined) acc.description_bn = String(req.body.description_bn);
      acc.opening_debit = formatCents(newOd);
      acc.opening_credit = formatCents(newOc);
      if (req.body?.is_active !== undefined) acc.is_active = Boolean(req.body.is_active);

      recordAudit(actor.id, 'account.updated', 'account', acc.code, `Updated account '${acc.code}' (is_active=${acc.is_active})`);
      persistState();
      res.json(acc);
    } catch (e) {
      next(e);
    }
  });

  // --- Journals ---
  router.get('/journals', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'journals:view');
      const statusFilter = req.query.status ? String(req.query.status) : null;
      const list = state.journals
        .filter((j) => !statusFilter || j.status === statusFilter)
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id);
      res.json(list.map(serializeJournal));
    } catch (e) {
      next(e);
    }
  });

  router.get('/journals/:journalId', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'journals:view');
      const entry = state.journals.find((j) => j.id === Number(req.params.journalId));
      if (!entry) throw new HttpError(404, 'Journal entry not found');
      res.json(serializeJournal(entry));
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'journals:create');
      const entryDate = String(req.body?.entry_date || '').trim();
      const memo = String(req.body?.memo || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !memo) {
        throw new HttpError(422, 'Valid entry_date (YYYY-MM-DD) and memo are required');
      }

      const normalizedLines = validateJournalLines(req.body?.lines);
      ensureOpenFiscalPeriod(entryDate);

      const canApprove = hasPermission(user, 'journals:approve');
      let action = req.body?.workflow_action as 'draft' | 'submit' | 'direct_post' | undefined;
      if (!action) {
        action = canApprove ? 'direct_post' : 'submit';
      }
      if (action === 'direct_post' && !canApprove) {
        throw new HttpError(403, "Direct journal posting requires 'journals:approve' permission; submit for approval instead");
      }

      const statusMap: Record<'draft' | 'submit' | 'direct_post', StoredJournalEntry['status']> = {
        draft: 'draft',
        submit: 'pending_approval',
        direct_post: 'posted',
      };
      const targetStatus = statusMap[action] || 'pending_approval';
      const voucherNo = nextVoucherNo(entryDate);
      const nowIso = new Date().toISOString();

      const entry: StoredJournalEntry = {
        id: nextId('journal'),
        voucher_no: voucherNo,
        entry_date: entryDate,
        memo,
        reference: String(req.body?.reference || ''),
        status: targetStatus,
        created_by: user.id,
        submitted_by: targetStatus === 'pending_approval' || targetStatus === 'posted' ? user.id : null,
        approved_by: targetStatus === 'posted' ? user.id : null,
        approved_at: targetStatus === 'posted' ? nowIso : null,
        rejection_reason: null,
        reversed_entry_id: null,
        created_at: nowIso,
        lines: normalizedLines.map((ln) => ({
          id: nextId('journal_line'),
          ...ln,
        })),
      };

      state.journals.push(entry);
      recordAudit(user.id, `journal.${targetStatus}`, 'journal_entry', voucherNo, `${voucherNo}: ${memo}`);
      persistState();
      res.json(serializeJournal(entry));
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals/:journalId/submit', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'journals:create');
      const entry = state.journals.find((j) => j.id === Number(req.params.journalId));
      if (!entry) throw new HttpError(404, 'Journal entry not found');
      if (!['draft', 'rejected'].includes(entry.status)) {
        throw new HttpError(422, `Only draft or rejected journals can be submitted for approval (current: ${entry.status})`);
      }
      ensureOpenFiscalPeriod(entry.entry_date);
      validateJournalLines(entry.lines);

      entry.status = 'pending_approval';
      entry.submitted_by = user.id;
      entry.rejection_reason = null;
      recordAudit(user.id, 'journal.submitted', 'journal_entry', entry.voucher_no || String(entry.id), entry.memo);
      persistState();
      res.json(serializeJournal(entry));
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals/:journalId/approve', (req: Request, res: Response, next: NextFunction) => {
    try {
      const approver = requirePerm(req, 'journals:approve');
      const entry = state.journals.find((j) => j.id === Number(req.params.journalId));
      if (!entry) throw new HttpError(404, 'Journal entry not found');
      if (!['pending_approval', 'draft'].includes(entry.status)) {
        throw new HttpError(422, `Only draft or pending_approval journals can be approved (current: ${entry.status})`);
      }
      ensureOpenFiscalPeriod(entry.entry_date);
      validateJournalLines(entry.lines);

      if (!entry.voucher_no) {
        entry.voucher_no = nextVoucherNo(entry.entry_date);
      }
      entry.status = 'posted';
      entry.approved_by = approver.id;
      entry.approved_at = new Date().toISOString();
      entry.rejection_reason = null;
      recordAudit(approver.id, 'journal.approved', 'journal_entry', entry.voucher_no, `Approved and posted '${entry.memo}'`);
      persistState();
      res.json(serializeJournal(entry));
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals/:journalId/reject', (req: Request, res: Response, next: NextFunction) => {
    try {
      const approver = requirePerm(req, 'journals:approve');
      const entry = state.journals.find((j) => j.id === Number(req.params.journalId));
      if (!entry) throw new HttpError(404, 'Journal entry not found');
      if (entry.status !== 'pending_approval') {
        throw new HttpError(422, 'Only pending_approval journals can be rejected');
      }
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 3) {
        throw new HttpError(422, 'Rejection reason must be at least 3 characters');
      }
      entry.status = 'rejected';
      entry.rejection_reason = reason;
      recordAudit(approver.id, 'journal.rejected', 'journal_entry', entry.voucher_no || String(entry.id), `Rejected: ${reason}`);
      persistState();
      res.json(serializeJournal(entry));
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals/:journalId/reverse', (req: Request, res: Response, next: NextFunction) => {
    try {
      const approver = requirePerm(req, 'journals:approve');
      const original = state.journals.find((j) => j.id === Number(req.params.journalId));
      if (!original) throw new HttpError(404, 'Journal entry not found');
      if (original.status !== 'posted') {
        throw new HttpError(422, 'Only posted journals can be reversed');
      }
      const effDate = req.query.reversal_date ? String(req.query.reversal_date) : original.entry_date;
      ensureOpenFiscalPeriod(effDate);

      const revVoucher = nextVoucherNo(effDate);
      const nowIso = new Date().toISOString();
      const reversal: StoredJournalEntry = {
        id: nextId('journal'),
        voucher_no: revVoucher,
        entry_date: effDate,
        memo: `Reversal of ${original.voucher_no || original.id}: ${original.memo}`,
        reference: original.voucher_no || String(original.id),
        status: 'posted',
        created_by: approver.id,
        submitted_by: approver.id,
        approved_by: approver.id,
        approved_at: nowIso,
        rejection_reason: null,
        reversed_entry_id: original.id,
        created_at: nowIso,
        lines: original.lines.map((ln) => ({
          id: nextId('journal_line'),
          account_id: ln.account_id,
          description: ln.description ? `Reversal: ${ln.description}` : 'Reversal entry',
          debit: ln.credit,
          credit: ln.debit,
        })),
      };
      original.status = 'reversed';
      state.journals.push(reversal);
      recordAudit(approver.id, 'journal.reversed', 'journal_entry', revVoucher, `Reversed ${original.voucher_no || original.id}`);
      persistState();
      res.json(serializeJournal(reversal));
    } catch (e) {
      next(e);
    }
  });

  // --- Reports ---
  router.get('/reports/general-ledger', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'reports:view');
      const accountId = Number(req.query.account_id);
      const account = state.accounts.find((a) => a.id === accountId);
      if (!account) throw new HttpError(404, 'Account not found');

      const startDate = req.query.start_date ? String(req.query.start_date) : null;
      const endDate = req.query.end_date ? String(req.query.end_date) : null;
      const postedStatuses = new Set(['posted', 'reversed']);

      let baseNet = parseCents(account.opening_debit) - parseCents(account.opening_credit);
      if (startDate) {
        for (const je of state.journals) {
          if (!postedStatuses.has(je.status) || je.entry_date >= startDate) continue;
          for (const ln of je.lines) {
            if (ln.account_id === account.id) {
              baseNet += parseCents(ln.debit) - parseCents(ln.credit);
            }
          }
        }
      }

      const formatSigned = (net: bigint): [string, 'DR' | 'CR' | 'ZERO'] => {
        if (net > 0n) return [formatCents(net), 'DR'];
        if (net < 0n) return [formatCents(-net), 'CR'];
        return ['0.00', 'ZERO'];
      };

      const [openingBal, openingSide] = formatSigned(baseNet);
      const matchingEntries = state.journals
        .filter((je) => {
          if (!postedStatuses.has(je.status)) return false;
          if (startDate && je.entry_date < startDate) return false;
          if (endDate && je.entry_date > endDate) return false;
          return true;
        })
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id);

      let runningNet = baseNet;
      let periodDr = 0n;
      let periodCr = 0n;
      const movements = [];

      for (const je of matchingEntries) {
        for (const ln of je.lines) {
          if (ln.account_id !== account.id) continue;
          const dr = parseCents(ln.debit);
          const cr = parseCents(ln.credit);
          periodDr += dr;
          periodCr += cr;
          runningNet += dr - cr;
          const [runAbs, runSide] = formatSigned(runningNet);
          movements.push({
            line_id: ln.id,
            entry_id: je.id,
            voucher_no: je.voucher_no || `JV-${je.id}`,
            entry_date: je.entry_date,
            memo: je.memo,
            line_description: ln.description || '',
            debit: formatCents(dr),
            credit: formatCents(cr),
            running_balance: runAbs,
            balance_side: runSide,
          });
        }
      }

      const [closingBal, closingSide] = formatSigned(runningNet);
      res.json({
        account_id: account.id,
        account_code: account.code,
        account_name_en: account.name_en,
        account_name_bn: account.name_bn,
        account_type: account.account_type,
        normal_balance: account.normal_balance,
        start_date: startDate,
        end_date: endDate,
        opening_balance: openingBal,
        opening_side: openingSide,
        period_debit: formatCents(periodDr),
        period_credit: formatCents(periodCr),
        closing_balance: closingBal,
        closing_side: closingSide,
        movements,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/trial-balance', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'reports:view');
      const startDate = req.query.start_date ? String(req.query.start_date) : undefined;
      const asOfDate = req.query.as_of_date ? String(req.query.as_of_date) : undefined;
      const includeZero = String(req.query.include_zero || 'false') === 'true';
      res.json(computeVerifiedTrialBalance(startDate, asOfDate, includeZero).rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/trial-balance/verified', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'reports:view');
      const startDate = req.query.start_date ? String(req.query.start_date) : undefined;
      const asOfDate = req.query.as_of_date ? String(req.query.as_of_date) : undefined;
      const includeZero = String(req.query.include_zero || 'false') === 'true';
      res.json(computeVerifiedTrialBalance(startDate, asOfDate, includeZero));
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/financial-statements', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'reports:view');
      const startDate = req.query.start_date ? String(req.query.start_date) : undefined;
      const asOfDate = req.query.as_of_date ? String(req.query.as_of_date) : undefined;
      res.json(computeFinancialStatements(startDate, asOfDate));
    } catch (e) {
      next(e);
    }
  });

  // --- Software Projects & Client Contracts ---
  router.get('/projects', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'projects:view');
      const statusFilter = req.query.status ? String(req.query.status) : null;
      const list = state.projects
        .filter((p) => !statusFilter || p.status === statusFilter)
        .sort((a, b) => b.id - a.id);
      res.json(list.map(serializeProject));
    } catch (e) {
      next(e);
    }
  });

  router.post('/projects', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'projects:manage');
      const nameEn = String(req.body?.name_en || '').trim();
      const clientEn = String(req.body?.client_name_en || '').trim();
      const startDate = String(req.body?.start_date || new Date().toISOString().slice(0, 10)).trim();
      if (nameEn.length < 2 || clientEn.length < 2) {
        throw new HttpError(422, 'Project title and client name are required');
      }
      const statusRaw = String(req.body?.status || 'active') as ProjectStatus;
      const status: ProjectStatus = VALID_PROJECT_STATUSES.includes(statusRaw) ? statusRaw : 'active';
      const customCode = String(req.body?.project_code || '').trim();
      const projectCode = customCode || nextProjectCode(startDate);
      if (state.projects.some((p) => p.project_code === projectCode)) {
        throw new HttpError(409, `Project code '${projectCode}' already exists`);
      }

      const contractCents = parseCents(req.body?.contract_value, 0n);
      const billedCents = parseCents(req.body?.billed_amount, 0n);
      const receivedCents = parseCents(req.body?.received_amount, 0n);
      if (contractCents < 0n || billedCents < 0n || receivedCents < 0n) {
        throw new HttpError(422, 'Project financial amounts cannot be negative');
      }

      const proj: StoredSoftwareProject = {
        id: nextId('project'),
        project_code: projectCode,
        name_en: nameEn,
        name_bn: String(req.body?.name_bn || ''),
        client_name_en: clientEn,
        client_name_bn: String(req.body?.client_name_bn || ''),
        client_contact: String(req.body?.client_contact || ''),
        tech_stack: String(req.body?.tech_stack || 'React, TypeScript, Node.js, PostgreSQL'),
        status,
        progress_percent: Math.max(0, Math.min(100, Number(req.body?.progress_percent ?? 0))),
        start_date: startDate,
        deadline: req.body?.deadline ? String(req.body.deadline) : null,
        contract_value: formatCents(contractCents),
        billed_amount: formatCents(billedCents),
        received_amount: formatCents(receivedCents),
        manager_username: String(req.body?.manager_username || user.username),
        notes: String(req.body?.notes || ''),
        created_by: user.id,
        created_at: new Date().toISOString(),
      };
      state.projects.push(proj);
      recordAudit(user.id, 'project.created', 'software_project', proj.project_code, `${proj.name_en} (${proj.client_name_en})`);
      persistState();
      res.status(201).json(serializeProject(proj));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/projects/:projectId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'projects:manage');
      const proj = state.projects.find((p) => p.id === Number(req.params.projectId));
      if (!proj) throw new HttpError(404, 'Project not found');

      if (req.body?.name_en !== undefined) proj.name_en = String(req.body.name_en).trim() || proj.name_en;
      if (req.body?.name_bn !== undefined) proj.name_bn = String(req.body.name_bn);
      if (req.body?.client_name_en !== undefined) proj.client_name_en = String(req.body.client_name_en).trim() || proj.client_name_en;
      if (req.body?.client_name_bn !== undefined) proj.client_name_bn = String(req.body.client_name_bn);
      if (req.body?.client_contact !== undefined) proj.client_contact = String(req.body.client_contact);
      if (req.body?.tech_stack !== undefined) proj.tech_stack = String(req.body.tech_stack);
      if (req.body?.status !== undefined && VALID_PROJECT_STATUSES.includes(req.body.status)) {
        proj.status = req.body.status;
      }
      if (req.body?.progress_percent !== undefined) {
        proj.progress_percent = Math.max(0, Math.min(100, Number(req.body.progress_percent || 0)));
      }
      if (req.body?.deadline !== undefined) {
        proj.deadline = req.body.deadline ? String(req.body.deadline) : null;
      }
      if (req.body?.contract_value !== undefined) {
        proj.contract_value = formatCents(parseCents(req.body.contract_value, 0n));
      }
      if (req.body?.billed_amount !== undefined) {
        proj.billed_amount = formatCents(parseCents(req.body.billed_amount, 0n));
      }
      if (req.body?.received_amount !== undefined) {
        proj.received_amount = formatCents(parseCents(req.body.received_amount, 0n));
      }
      if (req.body?.manager_username !== undefined) {
        proj.manager_username = String(req.body.manager_username);
      }
      if (req.body?.notes !== undefined) {
        proj.notes = String(req.body.notes);
      }

      recordAudit(user.id, 'project.updated', 'software_project', proj.project_code, `Status=${proj.status}, Progress=${proj.progress_percent}%`);
      persistState();
      res.json(serializeProject(proj));
    } catch (e) {
      next(e);
    }
  });

  router.delete('/projects/:projectId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'projects:manage');
      const idx = state.projects.findIndex((p) => p.id === Number(req.params.projectId));
      if (idx < 0) throw new HttpError(404, 'Project not found');
      const [removed] = state.projects.splice(idx, 1);
      recordAudit(user.id, 'project.deleted', 'software_project', removed.project_code, removed.name_en);
      persistState();
      res.json({status: 'deleted', project_code: removed.project_code});
    } catch (e) {
      next(e);
    }
  });

  // --- HR, Attendance & Payroll ---
  router.get('/hr/employees', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'hr:view');
      const includeInactive = String(req.query.include_inactive ?? 'true') !== 'false';
      const list = state.employees
        .filter((e) => includeInactive || e.is_active)
        .sort((a, b) => a.emp_code.localeCompare(b.emp_code));
      res.json(list.map(serializeEmployee));
    } catch (e) {
      next(e);
    }
  });

  router.post('/hr/employees', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'hr:manage');
      const empCode = String(req.body?.emp_code || '').trim();
      const fullNameEn = String(req.body?.full_name_en || '').trim();
      if (!/^[A-Za-z0-9-]{2,30}$/.test(empCode) || fullNameEn.length < 2) {
        throw new HttpError(422, 'Valid employee code and English name are required');
      }
      if (state.employees.some((e) => e.emp_code === empCode)) {
        throw new HttpError(409, 'Employee code already exists');
      }

      const emp: StoredEmployee = {
        id: nextId('employee'),
        emp_code: empCode,
        full_name_en: fullNameEn,
        full_name_bn: String(req.body?.full_name_bn || ''),
        designation_en: String(req.body?.designation_en || 'Software Engineer'),
        designation_bn: String(req.body?.designation_bn || ''),
        department: String(req.body?.department || 'Engineering'),
        phone: String(req.body?.phone || ''),
        email: String(req.body?.email || ''),
        join_date: String(req.body?.join_date || new Date().toISOString().slice(0, 10)),
        basic_salary: formatCents(parseCents(req.body?.basic_salary, 0n)),
        house_rent: formatCents(parseCents(req.body?.house_rent, 0n)),
        medical_allowance: formatCents(parseCents(req.body?.medical_allowance, 0n)),
        transport_allowance: formatCents(parseCents(req.body?.transport_allowance, 0n)),
        payment_method_pref: String(req.body?.payment_method_pref || 'Bank Transfer'),
        bank_account_no: String(req.body?.bank_account_no || ''),
        is_active: true,
      };
      state.employees.push(emp);
      recordAudit(user.id, 'employee.created', 'employee', emp.emp_code, emp.full_name_en);
      persistState();
      res.status(201).json(serializeEmployee(emp));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/hr/employees/:empId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'hr:manage');
      const emp = state.employees.find((e) => e.id === Number(req.params.empId));
      if (!emp) throw new HttpError(404, 'Employee not found');

      if (req.body?.full_name_en !== undefined) emp.full_name_en = String(req.body.full_name_en).trim() || emp.full_name_en;
      if (req.body?.full_name_bn !== undefined) emp.full_name_bn = String(req.body.full_name_bn);
      if (req.body?.designation_en !== undefined) emp.designation_en = String(req.body.designation_en);
      if (req.body?.designation_bn !== undefined) emp.designation_bn = String(req.body.designation_bn);
      if (req.body?.department !== undefined) emp.department = String(req.body.department);
      if (req.body?.phone !== undefined) emp.phone = String(req.body.phone);
      if (req.body?.email !== undefined) emp.email = String(req.body.email);
      if (req.body?.join_date !== undefined) emp.join_date = String(req.body.join_date);
      if (req.body?.basic_salary !== undefined) emp.basic_salary = formatCents(parseCents(req.body.basic_salary, 0n));
      if (req.body?.house_rent !== undefined) emp.house_rent = formatCents(parseCents(req.body.house_rent, 0n));
      if (req.body?.medical_allowance !== undefined) emp.medical_allowance = formatCents(parseCents(req.body.medical_allowance, 0n));
      if (req.body?.transport_allowance !== undefined) emp.transport_allowance = formatCents(parseCents(req.body.transport_allowance, 0n));
      if (req.body?.payment_method_pref !== undefined) emp.payment_method_pref = String(req.body.payment_method_pref);
      if (req.body?.bank_account_no !== undefined) emp.bank_account_no = String(req.body.bank_account_no);
      if (req.body?.is_active !== undefined) emp.is_active = Boolean(req.body.is_active);

      recordAudit(user.id, 'employee.updated', 'employee', emp.emp_code, `${emp.full_name_en} (active=${emp.is_active})`);
      persistState();
      res.json(serializeEmployee(emp));
    } catch (e) {
      next(e);
    }
  });

  function buildDailyAttendance(attendanceDate: string) {
    const activeEmployees = state.employees
      .filter((e) => e.is_active)
      .sort((a, b) => a.emp_code.localeCompare(b.emp_code));
    return activeEmployees.map((emp) => {
      const rec = state.attendance_records.find(
        (r) => r.employee_id === emp.id && r.attendance_date === attendanceDate,
      );
      return {
        employee_id: emp.id,
        emp_code: emp.emp_code,
        full_name_en: emp.full_name_en,
        full_name_bn: emp.full_name_bn,
        designation_en: emp.designation_en,
        department: emp.department,
        attendance_date: attendanceDate,
        status: rec?.status || 'present',
        check_in: rec?.check_in || '09:00',
        check_out: rec?.check_out || '18:00',
        overtime_hours: rec ? formatCents(parseCents(rec.overtime_hours)) : '0.00',
        note: rec?.note || '',
      };
    });
  }

  router.get('/hr/attendance', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'hr:view');
      const attendanceDate = String(req.query.attendance_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
        throw new HttpError(422, 'attendance_date (YYYY-MM-DD) is required');
      }
      res.json(buildDailyAttendance(attendanceDate));
    } catch (e) {
      next(e);
    }
  });

  router.post('/hr/attendance/bulk', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'hr:manage');
      const attendanceDate = String(req.body?.attendance_date || '');
      const entries = req.body?.entries as Array<Record<string, unknown>> | undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate) || !Array.isArray(entries) || entries.length === 0) {
        throw new HttpError(422, 'Valid attendance_date and entries are required');
      }

      for (const item of entries) {
        const empId = Number(item.employee_id);
        const emp = state.employees.find((e) => e.id === empId);
        if (!emp) throw new HttpError(422, `Employee ${empId} does not exist`);

        const existing = state.attendance_records.find(
          (r) => r.employee_id === empId && r.attendance_date === attendanceDate,
        );
        const status = String(item.status || 'present') as AttendanceStatus;
        const checkIn = String(item.check_in || '09:00');
        const checkOut = String(item.check_out || '18:00');
        const ot = formatCents(parseCents(item.overtime_hours, 0n));
        const note = String(item.note || '');

        if (existing) {
          existing.status = status;
          existing.check_in = checkIn;
          existing.check_out = checkOut;
          existing.overtime_hours = ot;
          existing.note = note;
        } else {
          state.attendance_records.push({
            id: nextId('attendance'),
            employee_id: empId,
            attendance_date: attendanceDate,
            status,
            check_in: checkIn,
            check_out: checkOut,
            overtime_hours: ot,
            note,
          });
        }
      }

      recordAudit(
        user.id,
        'attendance.saved',
        'attendance_record',
        attendanceDate,
        `Saved attendance for ${entries.length} employees on ${attendanceDate}`,
      );
      persistState();
      res.json(buildDailyAttendance(attendanceDate));
    } catch (e) {
      next(e);
    }
  });

  router.get('/hr/attendance/monthly', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'hr:view');
      const month = String(req.query.month || '');
      if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new HttpError(422, 'month (YYYY-MM) is required');
      }
      const activeEmployees = state.employees
        .filter((e) => e.is_active)
        .sort((a, b) => a.emp_code.localeCompare(b.emp_code));

      const summary = activeEmployees.map((emp) => {
        const recs = state.attendance_records.filter(
          (r) => r.employee_id === emp.id && r.attendance_date.startsWith(`${month}-`),
        );
        let totalOt = 0n;
        for (const r of recs) totalOt += parseCents(r.overtime_hours);
        return {
          employee_id: emp.id,
          emp_code: emp.emp_code,
          full_name_en: emp.full_name_en,
          full_name_bn: emp.full_name_bn,
          designation_en: emp.designation_en,
          department: emp.department,
          present_days: recs.filter((r) => r.status === 'present').length,
          late_days: recs.filter((r) => r.status === 'late').length,
          half_days: recs.filter((r) => r.status === 'half_day').length,
          leave_days: recs.filter((r) => r.status === 'leave').length,
          absent_days: recs.filter((r) => r.status === 'absent').length,
          holiday_days: recs.filter((r) => r.status === 'holiday').length,
          total_overtime_hours: formatCents(totalOt),
        };
      });
      res.json(summary);
    } catch (e) {
      next(e);
    }
  });

  router.get('/hr/payroll', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'hr:view');
      const salaryMonth = req.query.salary_month ? String(req.query.salary_month) : null;
      const rows = state.salary_payments
        .filter((sp) => !salaryMonth || sp.salary_month === salaryMonth)
        .sort((a, b) => b.salary_month.localeCompare(a.salary_month) || a.payslip_no.localeCompare(b.payslip_no));
      res.json(rows.map(serializeSalary));
    } catch (e) {
      next(e);
    }
  });

  router.post('/hr/payroll/generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'payroll:manage');
      const salaryMonth = String(req.body?.salary_month || '');
      const workingDays = Number(req.body?.working_days || 26);
      if (!/^\d{4}-\d{2}$/.test(salaryMonth)) {
        throw new HttpError(422, 'salary_month (YYYY-MM) is required');
      }

      const activeEmployees = state.employees
        .filter((e) => e.is_active)
        .sort((a, b) => a.emp_code.localeCompare(b.emp_code));
      if (activeEmployees.length === 0) {
        throw new HttpError(422, 'No active employees found to generate payroll');
      }

      const monthCompact = salaryMonth.replace('-', '');
      for (const emp of activeEmployees) {
        const existing = state.salary_payments.find(
          (sp) => sp.employee_id === emp.id && sp.salary_month === salaryMonth,
        );
        if (existing && existing.status === 'paid') continue;

        const recs = state.attendance_records.filter(
          (r) => r.employee_id === emp.id && r.attendance_date.startsWith(`${salaryMonth}-`),
        );
        const presentD = recs.filter((r) => r.status === 'present').length;
        const lateD = recs.filter((r) => r.status === 'late').length;
        const halfD = recs.filter((r) => r.status === 'half_day').length;
        const leaveD = recs.filter((r) => r.status === 'leave').length;
        const absentD = recs.filter((r) => r.status === 'absent').length;
        let otHoursCents = 0n;
        for (const r of recs) otHoursCents += parseCents(r.overtime_hours);

        const basic = parseCents(emp.basic_salary);
        const house = parseCents(emp.house_rent);
        const med = parseCents(emp.medical_allowance);
        const trans = parseCents(emp.transport_allowance);
        const gross = basic + house + med + trans;

        // absent_ded = (absent_d + 0.5 * half_d) * (basic / 30) => ((2 * absent_d + half_d) * basic) / 60
        const absentDed = divRound(BigInt(2 * absentD + halfD) * basic, 60n);
        const otPay = divRound(otHoursCents * basic * 3n, 41600n);
        const bonus = existing ? parseCents(existing.bonus_amount) : 0n;
        const adv = existing ? parseCents(existing.advance_deduction) : 0n;
        const tax = existing ? parseCents(existing.tax_deduction) : 0n;
        const rawNet = gross + otPay + bonus - (absentDed + adv + tax);
        const net = rawNet > 0n ? rawNet : 0n;

        if (existing) {
          existing.working_days = workingDays;
          existing.present_days = presentD;
          existing.late_days = lateD;
          existing.half_days = halfD;
          existing.leave_days = leaveD;
          existing.absent_days = absentD;
          existing.overtime_hours = formatCents(otHoursCents);
          existing.basic_salary = formatCents(basic);
          existing.house_rent = formatCents(house);
          existing.medical_allowance = formatCents(med);
          existing.transport_allowance = formatCents(trans);
          existing.gross_salary = formatCents(gross);
          existing.overtime_pay = formatCents(otPay);
          existing.absent_deduction = formatCents(absentDed);
          existing.net_payable = formatCents(net);
        } else {
          state.salary_payments.push({
            id: nextId('salary'),
            payslip_no: `PAY-${monthCompact}-${String(emp.id).padStart(3, '0')}`,
            employee_id: emp.id,
            salary_month: salaryMonth,
            payment_date: null,
            working_days: workingDays,
            present_days: presentD,
            late_days: lateD,
            half_days: halfD,
            leave_days: leaveD,
            absent_days: absentD,
            overtime_hours: formatCents(otHoursCents),
            basic_salary: formatCents(basic),
            house_rent: formatCents(house),
            medical_allowance: formatCents(med),
            transport_allowance: formatCents(trans),
            gross_salary: formatCents(gross),
            overtime_pay: formatCents(otPay),
            bonus_amount: '0.00',
            absent_deduction: formatCents(absentDed),
            advance_deduction: '0.00',
            tax_deduction: '0.00',
            net_payable: formatCents(net),
            payment_method: emp.payment_method_pref,
            status: 'pending',
            linked_journal_id: null,
            notes: '',
            created_by: user.id,
          });
        }
      }

      recordAudit(user.id, 'payroll.generated', 'salary_payment', salaryMonth, `Generated/recalculated payroll sheet for ${salaryMonth}`);
      persistState();
      const out = state.salary_payments
        .filter((sp) => sp.salary_month === salaryMonth)
        .sort((a, b) => a.payslip_no.localeCompare(b.payslip_no));
      res.json(out.map(serializeSalary));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/hr/payroll/:payslipId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'payroll:manage');
      const sp = state.salary_payments.find((s) => s.id === Number(req.params.payslipId));
      if (!sp) throw new HttpError(404, 'Payslip not found');
      if (sp.status === 'paid') throw new HttpError(422, 'Paid salary slips cannot be modified');

      const bonus = parseCents(req.body?.bonus_amount, 0n);
      const adv = parseCents(req.body?.advance_deduction, 0n);
      const tax = parseCents(req.body?.tax_deduction, 0n);
      sp.bonus_amount = formatCents(bonus);
      sp.advance_deduction = formatCents(adv);
      sp.tax_deduction = formatCents(tax);
      sp.notes = String(req.body?.notes || '');

      const gross = parseCents(sp.gross_salary);
      const ot = parseCents(sp.overtime_pay);
      const absDed = parseCents(sp.absent_deduction);
      const rawNet = gross + ot + bonus - (absDed + adv + tax);
      sp.net_payable = formatCents(rawNet > 0n ? rawNet : 0n);

      recordAudit(user.id, 'payroll.adjusted', 'salary_payment', sp.payslip_no, `Net=${sp.net_payable}`);
      persistState();
      res.json(serializeSalary(sp));
    } catch (e) {
      next(e);
    }
  });

  router.post('/hr/payroll/:payslipId/pay', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'payroll:manage');
      const sp = state.salary_payments.find((s) => s.id === Number(req.params.payslipId));
      if (!sp) throw new HttpError(404, 'Payslip not found');
      if (sp.status === 'paid') throw new HttpError(422, 'This salary slip has already been paid');

      const paymentDate = String(req.body?.payment_date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        throw new HttpError(422, 'Valid payment_date (YYYY-MM-DD) is required');
      }
      ensureOpenFiscalPeriod(paymentDate);

      const paymentMethod = String(req.body?.payment_method || 'Bank Transfer');
      const paymentAccCode = String(req.body?.payment_account_code || '1020');
      const emp = state.employees.find((e) => e.id === sp.employee_id);
      if (!emp) throw new HttpError(404, 'Employee not found');

      const salaryExpAcc =
        state.accounts.find((a) => a.code === '5010') ||
        state.accounts.find((a) => a.account_type === 'expense' && a.is_active);
      const payAcc =
        state.accounts.find((a) => a.code === paymentAccCode) ||
        state.accounts.find((a) => a.account_type === 'asset' && a.is_active);

      const netCents = parseCents(sp.net_payable);
      const netStr = formatCents(netCents);
      let linkedJournalId: number | null = null;
      const nowIso = new Date().toISOString();

      if (salaryExpAcc && payAcc && netCents > 0n) {
        const vno = nextVoucherNo(paymentDate);
        const jeId = nextId('journal');
        state.journals.push({
          id: jeId,
          voucher_no: vno,
          entry_date: paymentDate,
          memo: `Salary Disbursement (${sp.salary_month}) — ${emp.full_name_en} (${sp.payslip_no})`,
          reference: sp.payslip_no,
          status: 'posted',
          created_by: user.id,
          submitted_by: user.id,
          approved_by: user.id,
          approved_at: nowIso,
          rejection_reason: null,
          reversed_entry_id: null,
          created_at: nowIso,
          lines: [
            {
              id: nextId('journal_line'),
              account_id: salaryExpAcc.id,
              description: `Salary ${sp.salary_month} - ${emp.emp_code}`,
              debit: netStr,
              credit: '0.00',
            },
            {
              id: nextId('journal_line'),
              account_id: payAcc.id,
              description: `Paid via ${paymentMethod}`,
              debit: '0.00',
              credit: netStr,
            },
          ],
        });
        linkedJournalId = jeId;

        const pvNo = nextDocNumber('payment_voucher', paymentDate);
        state.documents.push({
          id: nextId('document'),
          doc_type: 'payment_voucher',
          doc_number: pvNo,
          issue_date: paymentDate,
          due_date: null,
          party_name_en: `${emp.full_name_en} (${emp.emp_code})`,
          party_name_bn: emp.full_name_bn,
          party_address: `${emp.designation_en} · ${emp.department}`,
          subject_en: `Monthly Salary Disbursement for ${sp.salary_month} (${sp.payslip_no})`,
          subject_bn: `মাসিক বেতন পরিশোধ — ${sp.salary_month} (${sp.payslip_no})`,
          body_en: '',
          body_bn: '',
          payment_method: paymentMethod,
          currency: 'BDT',
          discount_amount: '0.00',
          tax_rate_percent: '0.00',
          notes_en: `Official salary disbursement voucher linked to ${sp.payslip_no}.`,
          notes_bn: `অফিসিয়াল বেতন পরিশোধ ভাউচার (${sp.payslip_no})।`,
          status: 'issued',
          linked_journal_id: linkedJournalId,
          created_by: user.id,
          created_at: nowIso,
          items: [
            {
              id: nextId('document_item'),
              description_en: `Net Salary Settlement — ${sp.salary_month} (${sp.payslip_no})`,
              description_bn: `নিট বেতন পরিশোধ — ${sp.salary_month}`,
              quantity: '1.00',
              unit_price: netStr,
              amount: netStr,
            },
          ],
        });
      }

      sp.status = 'paid';
      sp.payment_date = paymentDate;
      sp.payment_method = paymentMethod;
      sp.linked_journal_id = linkedJournalId;

      recordAudit(user.id, 'payroll.paid', 'salary_payment', sp.payslip_no, `Disbursed BDT ${netStr} to ${emp.emp_code}`);
      persistState();
      res.json(serializeSalary(sp));
    } catch (e) {
      next(e);
    }
  });

  router.post('/hr/quick-payment', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'payroll:manage');
      const paymentDate = String(req.body?.payment_date || '').trim();
      const payeeEn = String(req.body?.payee_name_en || '').trim();
      const purposeEn = String(req.body?.purpose_en || '').trim();
      const amtCents = parseCents(req.body?.amount, 0n);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || payeeEn.length < 2 || purposeEn.length < 2 || amtCents <= 0n) {
        throw new HttpError(422, 'Valid payment_date, payee_name_en, purpose_en, and positive amount are required');
      }
      ensureOpenFiscalPeriod(paymentDate);

      const expAcc = state.accounts.find((a) => a.id === Number(req.body?.expense_account_id));
      const payAcc = state.accounts.find((a) => a.id === Number(req.body?.paid_from_account_id));
      if (!expAcc || !expAcc.is_active) throw new HttpError(422, 'Selected expense/debit account is invalid or inactive');
      if (!payAcc || !payAcc.is_active) throw new HttpError(422, 'Selected cash/bank payment account is invalid or inactive');
      if (expAcc.id === payAcc.id) throw new HttpError(422, 'Debit and Credit accounts must be distinct');

      const pvNo = nextDocNumber('payment_voucher', paymentDate);
      const vno = nextVoucherNo(paymentDate);
      const nowIso = new Date().toISOString();
      const amtStr = formatCents(amtCents);
      const paymentMethod = String(req.body?.payment_method || 'Bank Transfer');

      const jeId = nextId('journal');
      state.journals.push({
        id: jeId,
        voucher_no: vno,
        entry_date: paymentDate,
        memo: `Payment to ${payeeEn}: ${purposeEn}`,
        reference: pvNo,
        status: 'posted',
        created_by: user.id,
        submitted_by: user.id,
        approved_by: user.id,
        approved_at: nowIso,
        rejection_reason: null,
        reversed_entry_id: null,
        created_at: nowIso,
        lines: [
          {id: nextId('journal_line'), account_id: expAcc.id, description: purposeEn, debit: amtStr, credit: '0.00'},
          {id: nextId('journal_line'), account_id: payAcc.id, description: `Paid via ${paymentMethod}`, debit: '0.00', credit: amtStr},
        ],
      });

      const doc: StoredBusinessDocument = {
        id: nextId('document'),
        doc_type: 'payment_voucher',
        doc_number: pvNo,
        issue_date: paymentDate,
        due_date: null,
        party_name_en: payeeEn,
        party_name_bn: String(req.body?.payee_name_bn || ''),
        party_address: '',
        subject_en: purposeEn,
        subject_bn: String(req.body?.purpose_bn || ''),
        body_en: '',
        body_bn: '',
        payment_method: paymentMethod,
        currency: 'BDT',
        discount_amount: '0.00',
        tax_rate_percent: '0.00',
        notes_en: `Posted to General Ledger under ${vno}.`,
        notes_bn: `জেনারেল লেজারে পোস্টকৃত (${vno})।`,
        status: 'issued',
        linked_journal_id: jeId,
        created_by: user.id,
        created_at: nowIso,
        items: [
          {
            id: nextId('document_item'),
            description_en: purposeEn,
            description_bn: String(req.body?.purpose_bn || ''),
            quantity: '1.00',
            unit_price: amtStr,
            amount: amtStr,
          },
        ],
      };
      state.documents.push(doc);
      recordAudit(user.id, 'payment.quick_voucher', 'business_document', pvNo, `BDT ${amtStr} to ${payeeEn}`);
      persistState();
      res.json({voucher_no: vno, payment_voucher: serializeDocument(doc)});
    } catch (e) {
      next(e);
    }
  });

  // --- Printable Documents ---
  router.get('/documents', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'documents:view');
      const docType = req.query.doc_type ? String(req.query.doc_type) : null;
      const docs = state.documents
        .filter((d) => !docType || d.doc_type === docType)
        .sort((a, b) => b.id - a.id);
      res.json(docs.map(serializeDocument));
    } catch (e) {
      next(e);
    }
  });

  router.post('/documents', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'documents:create');
      const docType = String(req.body?.doc_type || '') as DocType;
      const issueDate = String(req.body?.issue_date || '').trim();
      const rawItems = Array.isArray(req.body?.items) ? (req.body.items as Array<Record<string, unknown>>) : [];

      if (!(docType in DOC_PREFIX_MAP) || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
        throw new HttpError(422, 'Valid doc_type and issue_date (YYYY-MM-DD) are required');
      }
      if (docType !== 'letterhead' && rawItems.length === 0) {
        throw new HttpError(422, `Document type '${docType}' requires at least one line item`);
      }

      const items: StoredDocumentItem[] = rawItems.map((it) => {
        const qty = parseCents(it.quantity, 100n);
        const unit = parseCents(it.unit_price, 0n);
        const amt = mulCents(qty, unit);
        return {
          id: nextId('document_item'),
          description_en: String(it.description_en || ''),
          description_bn: String(it.description_bn || ''),
          quantity: formatCents(qty),
          unit_price: formatCents(unit),
          amount: formatCents(amt),
        };
      });

      const docNumber = nextDocNumber(docType, issueDate);
      const doc: StoredBusinessDocument = {
        id: nextId('document'),
        doc_type: docType,
        doc_number: docNumber,
        issue_date: issueDate,
        due_date: req.body?.due_date ? String(req.body.due_date) : null,
        party_name_en: String(req.body?.party_name_en || ''),
        party_name_bn: String(req.body?.party_name_bn || ''),
        party_address: String(req.body?.party_address || ''),
        subject_en: String(req.body?.subject_en || ''),
        subject_bn: String(req.body?.subject_bn || ''),
        body_en: String(req.body?.body_en || ''),
        body_bn: String(req.body?.body_bn || ''),
        payment_method: String(req.body?.payment_method || 'Bank Transfer'),
        currency: 'BDT',
        discount_amount: formatCents(parseCents(req.body?.discount_amount, 0n)),
        tax_rate_percent: formatCents(parseCents(req.body?.tax_rate_percent, 0n)),
        notes_en: String(req.body?.notes_en ?? ''),
        notes_bn: String(req.body?.notes_bn ?? ''),
        status: 'issued',
        linked_journal_id: null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        items,
      };
      state.documents.push(doc);
      recordAudit(user.id, 'document.created', 'business_document', docNumber, `Issued ${docType} ${docNumber}`);
      persistState();
      res.status(201).json(serializeDocument(doc));
    } catch (e) {
      next(e);
    }
  });

  router.post('/documents/:docId/post-accounting', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'journals:create');
      const docModel = state.documents.find((d) => d.id === Number(req.params.docId));
      if (!docModel) throw new HttpError(404, 'Document not found');
      if (docModel.linked_journal_id) {
        throw new HttpError(409, 'This document is already posted to the accounting ledger');
      }
      if (!['invoice', 'receipt', 'payment_voucher'].includes(docModel.doc_type)) {
        throw new HttpError(422, 'Only Invoices, Money Receipts, and Payment Vouchers create accounting ledger entries');
      }

      const serialized = serializeDocument(docModel);
      const totalCents = parseCents(serialized.grand_total, 0n);
      if (totalCents <= 0n) {
        throw new HttpError(422, 'Document grand total must be greater than 0.00 to post to ledger');
      }
      ensureOpenFiscalPeriod(docModel.issue_date);

      const isCash = /cash|নগদ/i.test(docModel.payment_method || '');
      const findCode = (code: string) => state.accounts.find((a) => a.code === code && a.is_active);

      let drAcc: StoredAccount | undefined;
      let crAcc: StoredAccount | undefined;
      let memoPrefix = '';

      if (docModel.doc_type === 'invoice') {
        drAcc = req.body?.debit_account_id
          ? state.accounts.find((a) => a.id === Number(req.body.debit_account_id) && a.is_active)
          : findCode('1100');
        crAcc = req.body?.credit_account_id
          ? state.accounts.find((a) => a.id === Number(req.body.credit_account_id) && a.is_active)
          : findCode('4010');
        memoPrefix = `Client Invoice ${docModel.doc_number} — ${docModel.party_name_en}`;
      } else if (docModel.doc_type === 'receipt') {
        drAcc = req.body?.debit_account_id
          ? state.accounts.find((a) => a.id === Number(req.body.debit_account_id) && a.is_active)
          : findCode(isCash ? '1010' : '1020');
        crAcc = req.body?.credit_account_id
          ? state.accounts.find((a) => a.id === Number(req.body.credit_account_id) && a.is_active)
          : findCode('1100');
        memoPrefix = `Money Receipt ${docModel.doc_number} from ${docModel.party_name_en}`;
      } else {
        drAcc = req.body?.debit_account_id
          ? state.accounts.find((a) => a.id === Number(req.body.debit_account_id) && a.is_active)
          : findCode('5040');
        crAcc = req.body?.credit_account_id
          ? state.accounts.find((a) => a.id === Number(req.body.credit_account_id) && a.is_active)
          : findCode(isCash ? '1010' : '1020');
        memoPrefix = `Payment Voucher ${docModel.doc_number} to ${docModel.party_name_en}`;
      }

      if (!drAcc || !crAcc || drAcc.id === crAcc.id) {
        throw new HttpError(422, 'Valid distinct active Debit and Credit accounts are required');
      }

      const canApprove = hasPermission(user, 'journals:approve');
      const jeStatus: StoredJournalEntry['status'] = canApprove ? 'posted' : 'pending_approval';
      const vno = nextVoucherNo(docModel.issue_date);
      const nowIso = new Date().toISOString();
      const totalStr = formatCents(totalCents);

      const je: StoredJournalEntry = {
        id: nextId('journal'),
        voucher_no: vno,
        entry_date: docModel.issue_date,
        memo: docModel.subject_en ? `${memoPrefix}: ${docModel.subject_en}` : memoPrefix,
        reference: docModel.doc_number,
        status: jeStatus,
        created_by: user.id,
        submitted_by: user.id,
        approved_by: canApprove ? user.id : null,
        approved_at: canApprove ? nowIso : null,
        rejection_reason: null,
        reversed_entry_id: null,
        created_at: nowIso,
        lines: [
          {
            id: nextId('journal_line'),
            account_id: drAcc.id,
            description: `${docModel.doc_number} (${docModel.party_name_en})`,
            debit: totalStr,
            credit: '0.00',
          },
          {
            id: nextId('journal_line'),
            account_id: crAcc.id,
            description: `${docModel.doc_number} (${docModel.party_name_en})`,
            debit: '0.00',
            credit: totalStr,
          },
        ],
      };

      state.journals.push(je);
      docModel.linked_journal_id = je.id;
      recordAudit(user.id, 'document.posted_ledger', 'business_document', docModel.doc_number, `Created ${vno} (${jeStatus}) for BDT ${totalStr}`);
      persistState();
      res.json({
        document: serializeDocument(docModel),
        journal: serializeJournal(je),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/documents/sample-invoice', (req: Request, res: Response, next: NextFunction) => {
    try {
      authenticateUser(req);
      res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice Template — NEXTGEN TECHNIX LIMITED</title></head><body><h1>NEXTGEN TECHNIX LIMITED</h1><p>Premier IT &amp; Custom Software Engineering Company · Official Service Invoice Template</p></body></html>`);
    } catch (e) {
      next(e);
    }
  });

  router.get('/documents/:docId', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'documents:view');
      const doc = state.documents.find((d) => d.id === Number(req.params.docId));
      if (!doc) throw new HttpError(404, 'Document not found');
      res.json(serializeDocument(doc));
    } catch (e) {
      next(e);
    }
  });

  router.get('/documents/:docId/html', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'documents:view');
      const docModel = state.documents.find((d) => d.id === Number(req.params.docId));
      if (!docModel) throw new HttpError(404, 'Document not found');
      const doc = serializeDocument(docModel);
      const company = state.company_profile;
      const [titleEn, titleBn] = DOC_TITLE_MAP[doc.doc_type] || ['DOCUMENT', 'নথি'];
      const colorMap: Record<string, [string, string]> = {
        letterhead: ['#1d4ed8', '#eff6ff'],
        payment_voucher: ['#b45309', '#fffbeb'],
        receipt: ['#047857', '#ecfdf5'],
        quotation: ['#6d28d9', '#f5f3ff'],
        invoice: ['#0f766e', '#f0fdfa'],
      };
      const [accentHex, tintHex] = colorMap[doc.doc_type] || ['#1d4ed8', '#eff6ff'];

      const rowsHtml = doc.items
        .map(
          (it, idx) =>
            `<tr><td>${idx + 1}</td><td><strong>${escapeHtml(it.description_en)}</strong>${it.description_bn ? `<br><span style="color:#475569;font-size:12px">${escapeHtml(it.description_bn)}</span>` : ''}</td><td style="text-align:right">${formatMoneyDisplay(it.quantity)}</td><td style="text-align:right">${formatMoneyDisplay(it.unit_price)}</td><td style="text-align:right">${formatMoneyDisplay(it.amount)}</td></tr>`,
        )
        .join('');

      res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(doc.doc_number)} — ${escapeHtml(company.name_en)}</title></head><body style="font-family:sans-serif;margin:28px;color:#0f172a"><h1 style="color:${accentHex}">${escapeHtml(company.name_en)}</h1><h2>${escapeHtml(titleEn)} · ${escapeHtml(titleBn)} (${escapeHtml(doc.doc_number)})</h2><div style="background:${tintHex};padding:12px;border-radius:8px;margin-bottom:16px"><strong>Party:</strong> ${escapeHtml(doc.party_name_en)}</div>${doc.doc_type === 'letterhead' ? `<p><strong>Subject:</strong> ${escapeHtml(doc.subject_en)}</p><pre style="white-space:pre-line;font-family:inherit">${escapeHtml(doc.body_en)}</pre>` : `<table border="1" cellspacing="0" cellpadding="8" style="width:100%;border-collapse:collapse"><thead><tr style="background:${accentHex};color:#fff"><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td colspan="4" style="text-align:right"><strong>Grand Total (${escapeHtml(doc.currency)})</strong></td><td style="text-align:right"><strong>${formatMoneyDisplay(doc.grand_total)}</strong></td></tr></tfoot></table>`}</body></html>`);
    } catch (e) {
      next(e);
    }
  });

  // --- Backup & Restore ---
  router.get('/backup/status', (req: Request, res: Response, next: NextFunction) => {
    try {
      requirePerm(req, 'backup:manage');
      let odSum = 0n;
      let ocSum = 0n;
      for (const a of state.accounts) {
        odSum += parseCents(a.opening_debit);
        ocSum += parseCents(a.opening_credit);
      }
      res.json({
        database_dialect: 'SQLite',
        opening_debit_total: formatCents(odSum),
        opening_credit_total: formatCents(ocSum),
        opening_balance_is_zero: odSum === 0n && ocSum === 0n,
        table_counts: {
          users: state.users.length,
          employees: state.employees.length,
          attendance_records: state.attendance_records.length,
          salary_payments: state.salary_payments.length,
          accounts: state.accounts.length,
          journal_entries: state.journals.length,
          business_documents: state.documents.length,
          software_projects: state.projects.length,
        },
        snapshots: listSnapshots(),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/backup/snapshots', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'backup:manage');
      fs.mkdirSync(snapshotDir, {recursive: true});
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '_');
      const filename = `nextgen_technix_erp_snapshot_${stamp}.json`;
      const fullPath = path.join(snapshotDir, filename);
      const archive = buildFullBackupArchive();
      const buf = Buffer.from(JSON.stringify(archive, null, 2), 'utf8');
      fs.writeFileSync(fullPath, buf);

      recordAudit(user.id, 'backup.snapshot_created', 'backup', filename, `Size=${buf.length} bytes`);
      persistState();
      res.status(201).json({
        filename,
        created_at: new Date().toISOString(),
        size_bytes: buf.length,
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/backup/export-json', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'backup:manage');
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      const archive = buildFullBackupArchive();
      const buf = Buffer.from(JSON.stringify(archive, null, 2), 'utf8');
      recordAudit(user.id, 'backup.exported_json', 'backup', `export_${stamp}.json`, 'Downloaded JSON backup');
      persistState();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="NextGen_Technix_ERP_Backup_${stamp}.json"`);
      res.send(buf);
    } catch (e) {
      next(e);
    }
  });

  router.get('/backup/export-sqlite', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'backup:manage');
      const archive = buildFullBackupArchive();
      const tmpDbFile = path.join(os.tmpdir(), `NextGen_ERP_HotBackup_${Date.now()}_${process.pid}.db`);

      try {
        const sqliteMod = (await import('node:sqlite')) as {
          DatabaseSync: new (p: string) => {
            exec: (sql: string) => void;
            prepare: (sql: string) => {run: (...args: unknown[]) => void};
            close: () => void;
          };
        };
        const db = new sqliteMod.DatabaseSync(tmpDbFile);
        db.exec(`
          CREATE TABLE erp_backup_metadata (
            id INTEGER PRIMARY KEY,
            schema_version TEXT NOT NULL,
            exported_at TEXT NOT NULL,
            checksum_sha256 TEXT NOT NULL,
            archive_json TEXT NOT NULL
          );
          CREATE TABLE accounts (
            id INTEGER PRIMARY KEY,
            code TEXT NOT NULL,
            name_en TEXT NOT NULL,
            account_type TEXT NOT NULL,
            opening_debit TEXT NOT NULL,
            opening_credit TEXT NOT NULL
          );
          CREATE TABLE employees (
            id INTEGER PRIMARY KEY,
            emp_code TEXT NOT NULL,
            full_name_en TEXT NOT NULL,
            designation_en TEXT NOT NULL,
            department TEXT NOT NULL,
            basic_salary TEXT NOT NULL
          );
        `);
        db.prepare(
          'INSERT INTO erp_backup_metadata (id, schema_version, exported_at, checksum_sha256, archive_json) VALUES (?, ?, ?, ?, ?)',
        ).run(
          1,
          archive.data.schema_version,
          archive.data.exported_at,
          archive.checksum_sha256,
          JSON.stringify(archive),
        );
        const insAcc = db.prepare(
          'INSERT INTO accounts (id, code, name_en, account_type, opening_debit, opening_credit) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const a of state.accounts) {
          insAcc.run(a.id, a.code, a.name_en, a.account_type, a.opening_debit, a.opening_credit);
        }
        const insEmp = db.prepare(
          'INSERT INTO employees (id, emp_code, full_name_en, designation_en, department, basic_salary) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const e of state.employees) {
          insEmp.run(e.id, e.emp_code, e.full_name_en, e.designation_en, e.department, e.basic_salary);
        }
        db.close();
      } catch {
        fs.writeFileSync(tmpDbFile, JSON.stringify(archive, null, 2), 'utf8');
      }

      const dbBytes = fs.readFileSync(tmpDbFile);
      fs.rmSync(tmpDbFile, {force: true});

      recordAudit(user.id, 'backup.exported_sqlite', 'backup', 'NextGen_Technix_ERP_Database_Backup.db', 'Downloaded consistent SQLite DB file');
      persistState();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="NextGen_Technix_ERP_Database_Backup.db"');
      res.send(dbBytes);
    } catch (e) {
      next(e);
    }
  });

  router.post('/backup/restore', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'backup:manage');
      let archive: Record<string, unknown>;
      if (req.body?.snapshot_filename) {
        const safeName = path.basename(String(req.body.snapshot_filename));
        const fullPath = path.join(snapshotDir, safeName);
        if (!fs.existsSync(fullPath)) throw new HttpError(404, 'Snapshot file not found');
        archive = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
      } else if (req.body?.backup_data && typeof req.body.backup_data === 'object') {
        archive = req.body.backup_data as Record<string, unknown>;
      } else {
        throw new HttpError(422, 'Provide either snapshot_filename or backup_data');
      }

      if (!archive.data || typeof archive.data !== 'object') {
        throw new HttpError(422, 'Invalid backup archive structure');
      }
      const body = archive.data as Record<string, unknown>;
      const expectedHash = typeof archive.checksum_sha256 === 'string' ? archive.checksum_sha256 : null;
      if (expectedHash) {
        const actualHash = crypto.createHash('sha256').update(canonicalJsonString(body), 'utf8').digest('hex');
        if (actualHash !== expectedHash) {
          throw new HttpError(422, 'Backup SHA-256 checksum verification failed');
        }
      }

      if (body.company_profile && typeof body.company_profile === 'object') {
        state.company_profile = {
          ...state.company_profile,
          ...(body.company_profile as Partial<StoredCompanyProfile>),
          updated_at: new Date().toISOString(),
        };
      }

      const accIdMap = new Map<number, number>();
      state.accounts = [];
      for (const a of (body.accounts as Array<Record<string, unknown>>) || []) {
        const newId = nextId('account');
        accIdMap.set(Number(a.id), newId);
        const atype = String(a.account_type || 'asset') as AccountType;
        state.accounts.push({
          id: newId,
          code: String(a.code),
          name_en: String(a.name_en),
          name_bn: String(a.name_bn || ''),
          account_type: atype,
          normal_balance: (a.normal_balance as 'debit' | 'credit') || ACCOUNT_NORMAL_BALANCE_MAP[atype] || 'debit',
          parent_code: a.parent_code ? String(a.parent_code) : null,
          description_en: String(a.description_en || ''),
          description_bn: String(a.description_bn || ''),
          opening_debit: formatCents(parseCents(a.opening_debit, 0n)),
          opening_credit: formatCents(parseCents(a.opening_credit, 0n)),
          is_system: Boolean(a.is_system ?? false),
          is_active: Boolean(a.is_active ?? true),
        });
      }

      const empIdMap = new Map<number, number>();
      state.employees = [];
      for (const e of (body.employees as Array<Record<string, unknown>>) || []) {
        const newId = nextId('employee');
        empIdMap.set(Number(e.id), newId);
        state.employees.push({
          id: newId,
          emp_code: String(e.emp_code),
          full_name_en: String(e.full_name_en),
          full_name_bn: String(e.full_name_bn || ''),
          designation_en: String(e.designation_en || ''),
          designation_bn: String(e.designation_bn || ''),
          department: String(e.department || 'Engineering'),
          phone: String(e.phone || ''),
          email: String(e.email || ''),
          join_date: String(e.join_date || '2026-01-01'),
          basic_salary: formatCents(parseCents(e.basic_salary, 0n)),
          house_rent: formatCents(parseCents(e.house_rent, 0n)),
          medical_allowance: formatCents(parseCents(e.medical_allowance, 0n)),
          transport_allowance: formatCents(parseCents(e.transport_allowance, 0n)),
          payment_method_pref: String(e.payment_method_pref || 'Bank Transfer'),
          bank_account_no: String(e.bank_account_no || ''),
          is_active: Boolean(e.is_active ?? true),
        });
      }

      state.attendance_records = [];
      for (const r of (body.attendance_records as Array<Record<string, unknown>>) || []) {
        const mappedEmp = empIdMap.get(Number(r.employee_id));
        if (mappedEmp) {
          state.attendance_records.push({
            id: nextId('attendance'),
            employee_id: mappedEmp,
            attendance_date: String(r.attendance_date),
            status: String(r.status || 'present') as AttendanceStatus,
            check_in: String(r.check_in || '09:00'),
            check_out: String(r.check_out || '18:00'),
            overtime_hours: formatCents(parseCents(r.overtime_hours, 0n)),
            note: String(r.note || ''),
          });
        }
      }

      const journalIdMap = new Map<number, number>();
      state.journals = [];
      const nowIso = new Date().toISOString();
      for (const j of (body.journal_entries as Array<Record<string, unknown>>) || []) {
        const newId = nextId('journal');
        journalIdMap.set(Number(j.id), newId);
        const st = String(j.status || 'posted') as StoredJournalEntry['status'];
        const rawLines = Array.isArray(j.lines) ? (j.lines as Array<Record<string, unknown>>) : [];
        state.journals.push({
          id: newId,
          voucher_no: j.voucher_no ? String(j.voucher_no) : null,
          entry_date: String(j.entry_date),
          memo: String(j.memo),
          reference: String(j.reference || ''),
          status: st,
          created_by: user.id,
          submitted_by: user.id,
          approved_by: st === 'posted' ? user.id : null,
          approved_at: st === 'posted' ? nowIso : null,
          rejection_reason: null,
          reversed_entry_id: null,
          created_at: nowIso,
          lines: rawLines
            .filter((ln) => accIdMap.has(Number(ln.account_id)))
            .map((ln) => ({
              id: nextId('journal_line'),
              account_id: accIdMap.get(Number(ln.account_id))!,
              description: String(ln.description || ''),
              debit: formatCents(parseCents(ln.debit, 0n)),
              credit: formatCents(parseCents(ln.credit, 0n)),
            })),
        });
      }

      state.salary_payments = [];
      for (const s of (body.salary_payments as Array<Record<string, unknown>>) || []) {
        const mappedEmp = empIdMap.get(Number(s.employee_id));
        if (mappedEmp) {
          state.salary_payments.push({
            id: nextId('salary'),
            payslip_no: String(s.payslip_no),
            employee_id: mappedEmp,
            salary_month: String(s.salary_month),
            payment_date: s.payment_date ? String(s.payment_date) : null,
            working_days: Number(s.working_days || 26),
            present_days: Number(s.present_days || 0),
            late_days: Number(s.late_days || 0),
            half_days: Number(s.half_days || 0),
            leave_days: Number(s.leave_days || 0),
            absent_days: Number(s.absent_days || 0),
            overtime_hours: formatCents(parseCents(s.overtime_hours, 0n)),
            basic_salary: formatCents(parseCents(s.basic_salary, 0n)),
            house_rent: formatCents(parseCents(s.house_rent, 0n)),
            medical_allowance: formatCents(parseCents(s.medical_allowance, 0n)),
            transport_allowance: formatCents(parseCents(s.transport_allowance, 0n)),
            gross_salary: formatCents(parseCents(s.gross_salary, 0n)),
            overtime_pay: formatCents(parseCents(s.overtime_pay, 0n)),
            bonus_amount: formatCents(parseCents(s.bonus_amount, 0n)),
            absent_deduction: formatCents(parseCents(s.absent_deduction, 0n)),
            advance_deduction: formatCents(parseCents(s.advance_deduction, 0n)),
            tax_deduction: formatCents(parseCents(s.tax_deduction, 0n)),
            net_payable: formatCents(parseCents(s.net_payable, 0n)),
            payment_method: String(s.payment_method || 'Bank Transfer'),
            status: (s.status as 'pending' | 'paid') || 'pending',
            linked_journal_id: s.linked_journal_id ? journalIdMap.get(Number(s.linked_journal_id)) || null : null,
            notes: String(s.notes || ''),
            created_by: user.id,
          });
        }
      }

      state.documents = [];
      for (const d of (body.business_documents as Array<Record<string, unknown>>) || []) {
        const rawItems = Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : [];
        state.documents.push({
          id: nextId('document'),
          doc_type: String(d.doc_type) as DocType,
          doc_number: String(d.doc_number),
          issue_date: String(d.issue_date),
          due_date: d.due_date ? String(d.due_date) : null,
          party_name_en: String(d.party_name_en || ''),
          party_name_bn: String(d.party_name_bn || ''),
          party_address: String(d.party_address || ''),
          subject_en: String(d.subject_en || ''),
          subject_bn: String(d.subject_bn || ''),
          body_en: String(d.body_en || ''),
          body_bn: String(d.body_bn || ''),
          payment_method: String(d.payment_method || 'Bank Transfer'),
          currency: String(d.currency || 'BDT'),
          discount_amount: formatCents(parseCents(d.discount_amount, 0n)),
          tax_rate_percent: formatCents(parseCents(d.tax_rate_percent, 0n)),
          notes_en: String(d.notes_en || ''),
          notes_bn: String(d.notes_bn || ''),
          status: String(d.status || 'issued'),
          linked_journal_id: null,
          created_by: user.id,
          created_at: nowIso,
          items: rawItems.map((it) => ({
            id: nextId('document_item'),
            description_en: String(it.description_en || ''),
            description_bn: String(it.description_bn || ''),
            quantity: formatCents(parseCents(it.quantity, 100n)),
            unit_price: formatCents(parseCents(it.unit_price, 0n)),
            amount: formatCents(parseCents(it.amount, 0n)),
          })),
        });
      }

      state.projects = [];
      for (const p of (body.projects as Array<Record<string, unknown>>) || []) {
        const stRaw = String(p.status || 'active') as ProjectStatus;
        state.projects.push({
          id: nextId('project'),
          project_code: String(p.project_code || nextProjectCode(String(p.start_date || '2026-01-01'))),
          name_en: String(p.name_en || ''),
          name_bn: String(p.name_bn || ''),
          client_name_en: String(p.client_name_en || ''),
          client_name_bn: String(p.client_name_bn || ''),
          client_contact: String(p.client_contact || ''),
          tech_stack: String(p.tech_stack || ''),
          status: VALID_PROJECT_STATUSES.includes(stRaw) ? stRaw : 'active',
          progress_percent: Math.max(0, Math.min(100, Number(p.progress_percent || 0))),
          start_date: String(p.start_date || new Date().toISOString().slice(0, 10)),
          deadline: p.deadline ? String(p.deadline) : null,
          contract_value: formatCents(parseCents(p.contract_value, 0n)),
          billed_amount: formatCents(parseCents(p.billed_amount, 0n)),
          received_amount: formatCents(parseCents(p.received_amount, 0n)),
          manager_username: String(p.manager_username || user.username),
          notes: String(p.notes || ''),
          created_by: user.id,
          created_at: String(p.created_at || nowIso),
        });
      }

      recordAudit(
        user.id,
        'backup.restored',
        'backup',
        String(req.body?.snapshot_filename || 'uploaded_json'),
        'Restored ERP database state',
      );
      persistState();
      res.json({status: 'restored', checksum_verified: Boolean(expectedHash)});
    } catch (e) {
      next(e);
    }
  });

  router.post('/backup/factory-reset', (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requirePerm(req, 'backup:manage');
      if (!hasPermission(user, 'users:manage')) {
        throw new HttpError(403, 'Factory zero-reset requires Administrator privileges');
      }
      const confirmText = String(req.body?.confirm_text || req.body?.confirm_phrase || '').trim();
      if (confirmText !== 'RESET') {
        throw new HttpError(422, "Type 'RESET' to authorize resetting operational records to 0.00");
      }

      state.journals = [];
      state.employees = [];
      state.attendance_records = [];
      state.salary_payments = [];
      state.documents = [];
      state.projects = [];
      for (const acc of state.accounts) {
        acc.opening_debit = '0.00';
        acc.opening_credit = '0.00';
      }
      state.counters.journal = 0;
      state.counters.journal_line = 0;
      state.counters.employee = 0;
      state.counters.attendance = 0;
      state.counters.salary = 0;
      state.counters.document = 0;
      state.counters.document_item = 0;
      state.counters.project = 0;

      recordAudit(
        user.id,
        'system.factory_zero_reset',
        'erp_state',
        'all_operational_tables',
        'Reset all operational transactions, projects, HR/payroll, documents, and opening balances to 0.00',
      );
      persistState();
      res.json({status: 'reset_to_zero'});
    } catch (e) {
      next(e);
    }
  });

  router.use((_req: Request, res: Response) => {
    res.status(404).json({detail: 'API endpoint not found'});
  });

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({detail: err.message});
      return;
    }
    const msg = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({detail: msg});
  });

  return router;
}
