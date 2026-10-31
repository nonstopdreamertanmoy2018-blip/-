import React, {createContext, useContext, useState} from 'react';
import {AccountType, DocType, Language, RoleKey} from './types';

const translations = {
  en: {
    brandTitle: 'NEXTGEN TECHNIX ERP',
    companyFull: 'NEXTGEN TECHNIX LIMITED',
    demoBanner: 'NEXTGEN TECHNIX LIMITED — Enterprise IT Operations, HR Payroll & Financial ERP',
    signOut: 'Sign Out',
    signIn: 'Sign In to ERP Workspace',
    username: 'Username',
    password: 'Password',
    navOverview: 'Executive Center',
    navProjects: 'IT Projects & Contracts',
    navDocuments: 'Commercial Billing & Print',
    navAttendance: 'Staff & Attendance',
    navSalary: 'Payroll & Disbursements',
    navAccounts: 'Chart of Accounts',
    navJournals: 'Journal Vouchers',
    navLedger: 'Ledger & Trial Balance',
    navFinancials: 'Financial Statements',
    navBackup: 'Backup & Data Vault',
    navUsers: 'Users, Roles & Security',
    role_admin: 'Administrator',
    role_accountant: 'Accountant',
    role_hr: 'HR & Payroll',
    role_project_manager: 'Project Manager',
    role_sales: 'Sales Executive',
    role_employee: 'Employee',
    type_asset: 'Asset',
    type_liability: 'Liability',
    type_equity: 'Equity',
    type_revenue: 'Revenue',
    type_expense: 'Expense',
    status_draft: 'Draft',
    status_pending_approval: 'Pending Approval',
    status_posted: 'Posted',
    status_rejected: 'Rejected',
    status_reversed: 'Reversed',
    doc_letterhead: 'Company Letterhead',
    doc_payment_voucher: 'Payment Voucher',
    doc_receipt: 'Money Receipt',
    doc_quotation: 'Commercial Quotation',
    doc_invoice: 'Service Invoice',
    debit: 'Debit',
    credit: 'Credit',
    save: 'Save Changes',
    cancel: 'Cancel',
    create: 'Create',
    printPdf: 'Print / Export PDF',
    downloadHtml: 'Download Print HTML',
    refresh: 'Refresh',
    searchPlaceholder: 'Filter by code or name...',
    balanced: 'Mathematically Balanced',
    unbalanced: 'Unbalanced Discrepancy',
  },
  bn: {
    brandTitle: 'নেক্সটজেন টেকনিক্স ইআরপি',
    companyFull: 'নেক্সটজেন টেকনিক্স লিমিটেড',
    demoBanner: 'নেক্সটজেন টেকনিক্স লিমিটেড — সফটওয়্যার প্রজেক্ট, মানবসম্পদ পেরোল ও ফিন্যান্সিয়াল ইআরপি',
    signOut: 'লগ আউট',
    signIn: 'ইআরপি পোর্টালে প্রবেশ করুন',
    username: 'ব্যবহারকারীর নাম',
    password: 'পাসওয়ার্ড',
    navOverview: 'নির্বাহী ড্যাশবোর্ড',
    navProjects: 'সফটওয়্যার প্রজেক্ট ও চুক্তি',
    navDocuments: 'বিলিং ও প্রিন্ট স্টুডিও',
    navAttendance: 'কর্মী ও উপস্থিতি',
    navSalary: 'বেতন ও পেমেন্ট ডিসবার্সমেন্ট',
    navAccounts: 'চার্ট অফ অ্যাকাউন্টস',
    navJournals: 'জার্নাল ভাউচার',
    navLedger: 'লেজার ও ট্রায়াল ব্যালেন্স',
    navFinancials: 'আর্থিক বিবরণী (P&L / BS)',
    navBackup: 'ব্যাকআপ ও ডাটা ভল্ট',
    navUsers: 'ব্যবহারকারী ও নিরাপত্তা',
    role_admin: 'প্রশাসক (Administrator)',
    role_accountant: 'হিসাবরক্ষক (Accountant)',
    role_hr: 'মানবসম্পদ ও পেরোল (HR & Payroll)',
    role_project_manager: 'প্রজেক্ট ম্যানেজার',
    role_sales: 'বিক্রয় কর্মকর্তা (Sales Executive)',
    role_employee: 'কর্মী (Employee)',
    type_asset: 'সম্পদ (Asset)',
    type_liability: 'দায় (Liability)',
    type_equity: 'মূলধন (Equity)',
    type_revenue: 'আয় (Revenue)',
    type_expense: 'ব্যয় (Expense)',
    status_draft: 'খসড়া (Draft)',
    status_pending_approval: 'অনুমোদনের অপেক্ষায়',
    status_posted: 'পোস্টকৃত (Posted)',
    status_rejected: 'প্রত্যাখ্যাত (Rejected)',
    status_reversed: 'রিভার্সকৃত (Reversed)',
    doc_letterhead: 'কোম্পানি লেটারহেড',
    doc_payment_voucher: 'পেমেন্ট ভাউচার',
    doc_receipt: 'মানি রসিদ',
    doc_quotation: 'ব্যবসায়িক কোটেশন',
    doc_invoice: 'সার্ভিস ইনভয়েস / চালান',
    debit: 'ডেবিট (DR)',
    credit: 'ক্রেডিট (CR)',
    save: 'পরিবর্তন সংরক্ষণ করুন',
    cancel: 'বাতিল',
    create: 'তৈরি করুন',
    printPdf: 'প্রিন্ট / পিডিএফ',
    downloadHtml: 'প্রিন্ট ফাইল ডাউনলোড',
    refresh: 'রিফ্রেশ',
    searchPlaceholder: 'কোড বা নাম দিয়ে খুঁজুন...',
    balanced: 'গাণিতিকভাবে সুষম',
    unbalanced: 'অসমতা বিদ্যমান',
  },
} as const;

type TranslationKeys = keyof typeof translations.en;

interface I18nContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: TranslationKeys) => string;
  bi: (enText: string, bnText?: string) => string;
  roleLabel: (role: RoleKey) => string;
  accountTypeLabel: (t: AccountType) => string;
  docTypeLabel: (d: DocType) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({children}: {children: React.ReactNode}) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('ng_erp_lang');
    return saved === 'bn' ? 'bn' : 'en';
  });

  const setLang = (next: Language) => {
    setLangState(next);
    localStorage.setItem('ng_erp_lang', next);
  };

  const t = (key: TranslationKeys): string => translations[lang][key] || translations.en[key];

  const bi = (enText: string, bnText?: string): string => {
    if (lang === 'bn' && bnText && bnText.trim().length > 0) {
      return bnText;
    }
    return enText;
  };

  const roleLabel = (role: RoleKey): string => t(`role_${role}` as TranslationKeys);
  const accountTypeLabel = (at: AccountType): string => t(`type_${at}` as TranslationKeys);
  const docTypeLabel = (dt: DocType): string => t(`doc_${dt}` as TranslationKeys);

  return (
    <I18nContext.Provider value={{lang, setLang, t, bi, roleLabel, accountTypeLabel, docTypeLabel}}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return ctx;
}

export function formatMoney(val: string | number | undefined | null): string {
  const num = Number(val ?? 0);
  if (Number.isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function amountToWordsEn(amountStr: string | number): string {
  const num = Math.round(Number(amountStr || 0));
  if (num === 0) return 'Zero Taka Only';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function belowThousand(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + belowThousand(n % 100) : ''}`;
  }

  let rem = Math.abs(num);
  const parts: string[] = [];
  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  if (crore > 0) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh > 0) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rem > 0) parts.push(belowThousand(rem));

  return `${parts.join(' ')} Taka Only`;
}
