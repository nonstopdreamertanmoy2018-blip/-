from __future__ import annotations

from typing import TypedDict


class PermissionDefinition(TypedDict):
    key: str
    module: str
    label_en: str
    label_bn: str
    description_en: str
    description_bn: str


ROLES_META: list[dict[str, str]] = [
    {"role": "admin", "label_en": "Administrator", "label_bn": "প্রশাসক (Administrator)"},
    {"role": "accountant", "label_en": "Accountant", "label_bn": "হিসাবরক্ষক (Accountant)"},
    {"role": "hr", "label_en": "HR & Payroll", "label_bn": "মানবসম্পদ ও পেরোল (HR & Payroll)"},
    {"role": "project_manager", "label_en": "Project Manager", "label_bn": "প্রজেক্ট ম্যানেজার"},
    {"role": "sales", "label_en": "Sales Executive", "label_bn": "বিক্রয় কর্মকর্তা (Sales Executive)"},
    {"role": "employee", "label_en": "Employee", "label_bn": "কর্মী (Employee)"},
]

PERMISSIONS_CATALOG: list[PermissionDefinition] = [
    {
        "key": "users:manage",
        "module": "Foundation",
        "label_en": "Manage Users & Deactivation",
        "label_bn": "ব্যবহারকারী তৈরি ও নিষ্ক্রিয়করণ",
        "description_en": "Create user accounts, assign roles, and activate or deactivate access.",
        "description_bn": "নতুন ব্যবহারকারী তৈরি, ভূমিকা নির্ধারণ এবং অ্যাকাউন্ট সক্রিয়/নিষ্ক্রিয় করা।",
    },
    {
        "key": "permissions:manage",
        "module": "Foundation",
        "label_en": "Configure Permission Matrix",
        "label_bn": "অনুমতি ম্যাট্রিক্স কনফিগারেশন",
        "description_en": "Modify role-based access permissions across ERP modules.",
        "description_bn": "ভূমিকা অনুযায়ী ইআরপি মডিউলের অনুমতি পরিবর্তন করা।",
    },
    {
        "key": "company:manage",
        "module": "Foundation",
        "label_en": "Manage Company & Fiscal Periods",
        "label_bn": "কোম্পানি প্রোফাইল ও অর্থবছর ব্যবস্থাপনা",
        "description_en": "Edit company letterhead, pictures, and open or lock fiscal periods.",
        "description_bn": "কোম্পানির লেটারহেড, ছবি ও হিসাবকাল খোলা বা বন্ধ করা।",
    },
    {
        "key": "backup:manage",
        "module": "Foundation",
        "label_en": "Backup & Restore Database",
        "label_bn": "ডাটাবেস ব্যাকআপ ও পুনরুদ্ধার",
        "description_en": "Create encrypted/JSON & SQLite snapshots, download backups, and restore state.",
        "description_bn": "ডাটাবেস ব্যাকআপ তৈরি, ডাউনলোড এবং পুনরুদ্ধার পরিচালনা করা।",
    },
    {
        "key": "hr:view",
        "module": "Attendance & Salary",
        "label_en": "View Staff & Attendance",
        "label_bn": "কর্মী ও উপস্থিতি দেখা",
        "description_en": "View employee directory, daily attendance register, and monthly attendance summary.",
        "description_bn": "কর্মীদের তালিকা, দৈনিক উপস্থিতি এবং মাসিক হাজিরা প্রতিবেদন দেখা।",
    },
    {
        "key": "hr:manage",
        "module": "Attendance & Salary",
        "label_en": "Manage Staff & Mark Attendance",
        "label_bn": "কর্মী তথ্য ও হাজিরা এন্ট্রি",
        "description_en": "Add/update employees and record daily check-in, check-out, leave, and overtime.",
        "description_bn": "কর্মী যুক্ত করা এবং দৈনিক উপস্থিতি, ছুটি ও ওভারটাইম সংরক্ষণ করা।",
    },
    {
        "key": "payroll:manage",
        "module": "Attendance & Salary",
        "label_en": "Process Salary & Payments",
        "label_bn": "বেতন প্রস্তুত ও পেমেন্ট পরিশোধ",
        "description_en": "Generate monthly salary sheets, disburse salaries, and post quick expense payments.",
        "description_bn": "মাসিক বেতন শীট তৈরি, বেতন পরিশোধ এবং পেমেন্ট ভাউচার ইস্যু করা।",
    },
    {
        "key": "accounts:view",
        "module": "Accounting",
        "label_en": "View Chart of Accounts",
        "label_bn": "চার্ট অফ অ্যাকাউন্টস দেখা",
        "description_en": "Inspect ledger account hierarchy, codes, and normal balances.",
        "description_bn": "হিসাবের তালিকা, কোড এবং নরমাল ব্যালেন্স দেখা।",
    },
    {
        "key": "accounts:manage",
        "module": "Accounting",
        "label_en": "Manage Chart of Accounts",
        "label_bn": "চার্ট অফ অ্যাকাউন্টস ব্যবস্থাপনা",
        "description_en": "Create ledger accounts, reset opening balances to zero, or toggle active status.",
        "description_bn": "নতুন হিসাব খাত তৈরি, প্রারম্ভিক জের শূন্যকরণ ও স্থিতি পরিবর্তন।",
    },
    {
        "key": "journals:view",
        "module": "Accounting",
        "label_en": "View Journal Vouchers",
        "label_bn": "জার্নাল ভাউচার দেখা",
        "description_en": "View draft, pending approval, posted, and rejected journal entries.",
        "description_bn": "খসড়া, অনুমোদনের অপেক্ষায় থাকা এবং পোস্টকৃত জার্নাল দেখা।",
    },
    {
        "key": "journals:create",
        "module": "Accounting",
        "label_en": "Draft & Submit Journals",
        "label_bn": "জার্নাল খসড়া ও জমা দেওয়া",
        "description_en": "Prepare balanced double-entry journal vouchers and submit for approval.",
        "description_bn": "সুষম ডেবিট-ক্রেডিট জার্নাল তৈরি ও অনুমোদনের জন্য জমা দেওয়া।",
    },
    {
        "key": "journals:approve",
        "module": "Accounting",
        "label_en": "Approve, Post & Reverse Journals",
        "label_bn": "জার্নাল অনুমোদন, পোস্টিং ও রিভার্সাল",
        "description_en": "Approve pending journals into the General Ledger, reject, or post reversals.",
        "description_bn": "অপেক্ষমাণ জার্নাল জেনারেল লেজারে পোস্ট, প্রত্যাখ্যান বা রিভার্স করা।",
    },
    {
        "key": "reports:view",
        "module": "Accounting",
        "label_en": "View General Ledger & Trial Balance",
        "label_bn": "জেনারেল লেজার ও ট্রায়াল ব্যালেন্স দেখা",
        "description_en": "Run General Ledger statements and mathematically verified Trial Balance.",
        "description_bn": "জেনারেল লেজার বিবরণী এবং গাণিতিকভাবে যাচাইকৃত ট্রায়াল ব্যালেন্স দেখা।",
    },
    {
        "key": "documents:view",
        "module": "Printing",
        "label_en": "View & Print Documents",
        "label_bn": "মুদ্রণযোগ্য নথিপত্র দেখা ও প্রিন্ট",
        "description_en": "Preview and print letterhead, payment vouchers, receipts, quotations, and invoices.",
        "description_bn": "লেটারহেড, পেমেন্ট ভাউচার, রসিদ, কোটেশন ও চালান প্রিন্ট করা।",
    },
    {
        "key": "documents:create",
        "module": "Printing",
        "label_en": "Create Printable Documents",
        "label_bn": "মুদ্রণযোগ্য নথিপত্র তৈরি",
        "description_en": "Issue numbered company letterheads, vouchers, receipts, quotations, and invoices.",
        "description_bn": "নতুন লেটারহেড, পেমেন্ট ভাউচার, মানি রসিদ, কোটেশন ও ইনভয়েস তৈরি করা।",
    },
    {
        "key": "projects:view",
        "module": "Operations",
        "label_en": "View Client & Project Operations",
        "label_bn": "গ্রাহক ও সফটওয়্যার প্রজেক্ট দেখা",
        "description_en": "Access software delivery milestones, client contracts, and project status.",
        "description_bn": "সফটওয়্যার প্রজেক্ট, মাইলস্টোন ও গ্রাহকের চুক্তির তথ্য দেখা।",
    },
    {
        "key": "projects:manage",
        "module": "Operations",
        "label_en": "Create & Manage Software Projects",
        "label_bn": "সফটওয়্যার প্রজেক্ট ও চুক্তি পরিচালনা",
        "description_en": "Create client software projects, update delivery progress, and track contract billing.",
        "description_bn": "নতুন সফটওয়্যার প্রজেক্ট তৈরি, অগ্রগতি হালনাগাদ এবং চুক্তিমূল্য ট্র্যাক করা।",
    },
]

ALL_PERMISSION_KEYS: set[str] = {p["key"] for p in PERMISSIONS_CATALOG}
IMMUTABLE_ADMIN_PERMISSIONS: set[str] = {"users:manage", "permissions:manage"}

DEFAULT_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": set(ALL_PERMISSION_KEYS),
    "accountant": {
        "hr:view",
        "payroll:manage",
        "accounts:view",
        "accounts:manage",
        "journals:view",
        "journals:create",
        "journals:approve",
        "reports:view",
        "documents:view",
        "documents:create",
        "projects:view",
        "backup:manage",
    },
    "hr": {
        "hr:view",
        "hr:manage",
        "payroll:manage",
        "documents:view",
        "documents:create",
        "accounts:view",
        "projects:view",
    },
    "project_manager": {
        "hr:view",
        "projects:view",
        "projects:manage",
        "documents:view",
        "documents:create",
        "journals:view",
        "accounts:view",
    },
    "sales": {
        "projects:view",
        "projects:manage",
        "documents:view",
        "documents:create",
        "accounts:view",
    },
    "employee": {
        "hr:view",
        "projects:view",
        "documents:view",
    },
}
