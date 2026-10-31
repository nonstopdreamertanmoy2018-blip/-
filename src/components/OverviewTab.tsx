import React, {useCallback, useEffect, useState} from 'react';
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Circle,
  Database,
  Edit3,
  FolderKanban,
  Landmark,
  Lock,
  PieChart,
  Printer,
  Unlock,
  Users,
  Wallet,
} from 'lucide-react';
import {apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {
  BusinessDocument,
  CompanyProfile,
  CurrentUser,
  Employee,
  FinancialStatementsReport,
  FiscalPeriod,
  JournalEntry,
  SoftwareProject,
} from '../types';
import {COMPANY_HQ_URL, COMPANY_LOGO_URL} from '../utils/printEngine';

interface OverviewTabProps {
  user: CurrentUser;
  company: CompanyProfile | null;
  onCompanyUpdated: (c: CompanyProfile) => void;
  onNavigate: (tab: string) => void;
}

export function OverviewTab({user, company, onCompanyUpdated, onNavigate}: OverviewTabProps) {
  const {bi, roleLabel} = useI18n();
  const [financials, setFinancials] = useState<FinancialStatementsReport | null>(null);
  const [pendingJournals, setPendingJournals] = useState<JournalEntry[]>([]);
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [editingCompany, setEditingCompany] = useState(false);
  const [formState, setFormState] = useState<Partial<CompanyProfile>>({});
  const nextYear = new Date().getFullYear() + 1;
  const [newPeriod, setNewPeriod] = useState({
    name: '',
    start_date: `${nextYear}-07-01`,
    end_date: `${nextYear + 1}-06-30`,
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canViewReports = user.permissions.includes('reports:view');
  const canViewJournals = user.permissions.includes('journals:view');
  const canApproveJournals = user.permissions.includes('journals:approve');
  const canManageCompany = user.permissions.includes('company:manage');
  const canViewHr = user.permissions.includes('hr:view');
  const canViewProjects = user.permissions.includes('projects:view');
  const canViewDocs = user.permissions.includes('documents:view');
  const canManageBackup = user.permissions.includes('backup:manage');

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [fpData, finData, jData, empData, projData, docData] = await Promise.all([
        apiRequest<FiscalPeriod[]>('/fiscal-periods'),
        canViewReports
          ? apiRequest<FinancialStatementsReport>('/reports/financial-statements')
          : Promise.resolve(null),
        canViewJournals
          ? apiRequest<JournalEntry[]>('/journals?status=pending_approval')
          : Promise.resolve([]),
        canViewHr ? apiRequest<Employee[]>('/hr/employees') : Promise.resolve([]),
        canViewProjects ? apiRequest<SoftwareProject[]>('/projects') : Promise.resolve([]),
        canViewDocs ? apiRequest<BusinessDocument[]>('/documents') : Promise.resolve([]),
      ]);
      setPeriods(fpData);
      setFinancials(finData);
      setPendingJournals(jData);
      setEmployees(empData);
      setProjects(projData);
      setDocuments(docData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load company overview');
    }
  }, [canViewReports, canViewJournals, canViewHr, canViewProjects, canViewDocs]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const startEditingCompany = () => {
    if (!company) return;
    setFormState({...company});
    setEditingCompany(true);
  };

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiRequest<CompanyProfile>('/company', {
        method: 'PUT',
        body: JSON.stringify(formState),
      });
      onCompanyUpdated(updated);
      setEditingCompany(false);
      setFeedback(
        bi('Company legal profile updated across all ERP modules and print templates.', 'কোম্পানি প্রোফাইল সফলভাবে সংরক্ষিত হয়েছে।'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleTogglePeriod = async (periodId: number) => {
    setError(null);
    try {
      await apiRequest(`/fiscal-periods/${periodId}/toggle-close`, {method: 'POST'});
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update fiscal period');
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/fiscal-periods', {
        method: 'POST',
        body: JSON.stringify(newPeriod),
      });
      setNewPeriod({name: '', start_date: `${nextYear}-07-01`, end_date: `${nextYear + 1}-06-30`});
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create period');
    }
  };

  const handleQuickApprove = async (journalId: number) => {
    setError(null);
    try {
      await apiRequest(`/journals/${journalId}/approve`, {method: 'POST'});
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const activeEmployees = employees.filter((e) => e.is_active);
  const monthlySalaryCommitment = activeEmployees.reduce((s, e) => s + Number(e.gross_salary || 0), 0);
  const activeProjects = projects.filter((p) => ['planning', 'active', 'uat'].includes(p.status));
  const totalContractValue = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0);

  const setupSteps = [
    {
      done: Boolean(company?.name_en && !company.is_demo_environment),
      titleEn: '1. Verify Company Profile & Legal Registration',
      titleBn: '১. কোম্পানির তথ্য ও নিবন্ধন যাচাই করুন',
      descEn: 'Confirm RJSC, TIN, BIN, Dhaka address, phone, and official logo for A4 print headers.',
      actionLabel: canManageCompany ? bi('Edit Profile', 'প্রোফাইল সম্পাদনা') : null,
      onClick: () => startEditingCompany(),
    },
    {
      done: activeEmployees.length > 0,
      titleEn: '2. Onboard Company Staff & Set Salary Structure',
      titleBn: '২. কর্মকর্তা-কর্মচারী যুক্ত ও বেতন কাঠামো নির্ধারণ করুন',
      descEn: `Currently ${activeEmployees.length} active staff registered (Monthly Gross: BDT ${formatMoney(monthlySalaryCommitment)}).`,
      actionLabel: canViewHr ? bi('Open Staff & Attendance', 'কর্মী ও উপস্থিতি') : null,
      onClick: () => onNavigate('attendance'),
    },
    {
      done: projects.length > 0 || documents.length > 0,
      titleEn: '3. Register Client Software Projects & Issue Invoices',
      titleBn: '৩. সফটওয়্যার প্রজেক্ট নিবন্ধন ও ইনভয়েস ইস্যু করুন',
      descEn: `Currently ${projects.length} software projects and ${documents.length} commercial documents issued.`,
      actionLabel: canViewProjects ? bi('Open IT Projects', 'প্রজেক্ট দেখুন') : null,
      onClick: () => onNavigate('projects'),
    },
    {
      done:
        Number(financials?.total_assets || 0) > 0 ||
        Number(financials?.total_revenue || 0) > 0 ||
        Number(financials?.total_expenses || 0) > 0,
      titleEn: '4. Record Opening Capital or First Journal Voucher',
      titleBn: '৪. প্রারম্ভিক মূলধন বা প্রথম জার্নাল ভাউচার পোস্ট করুন',
      descEn: 'All 16 Chart of Accounts start at 0.00 BDT. Post share capital or bank deposit when ready.',
      actionLabel: canViewJournals ? bi('Open Journal Vouchers', 'জার্নাল ভাউচার') : null,
      onClick: () => onNavigate('journals'),
    },
    {
      done: false,
      titleEn: '5. Export Encrypted JSON / SQLite Backup Regularly',
      titleBn: '৫. নিয়মিত ডাটাবেস ব্যাকআপ সংরক্ষণ করুন',
      descEn: 'Download verified SHA-256 JSON or SQLite backups to your local computer.',
      actionLabel: canManageBackup ? bi('Open Data Vault', 'ব্যাকআপ ভল্ট') : null,
      onClick: () => onNavigate('backup'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Corporate Banner */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-sm relative">
        <img
          src={company?.banner_url || COMPANY_HQ_URL}
          alt="NEXTGEN TECHNIX LIMITED Headquarters"
          referrerPolicy="no-referrer"
          className="w-full h-44 sm:h-52 object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-900/50 p-6 flex flex-col justify-between text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={company?.logo_url || COMPANY_LOGO_URL}
                alt="Company Logo"
                referrerPolicy="no-referrer"
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-white/25 bg-white shrink-0"
              />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">
                  {bi('Executive Command Center', 'নির্বাহী কমান্ড সেন্টার')} · {roleLabel(user.role)}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                  {bi(company?.name_en || 'NEXTGEN TECHNIX LIMITED', company?.name_bn)}
                </h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  {bi(
                    company?.tagline_en || 'Premier IT Company & Custom Software Engineering Studio',
                    company?.tagline_bn,
                  )}
                </p>
              </div>
            </div>

            {canManageCompany && (
              <button
                type="button"
                onClick={startEditingCompany}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                {bi('Edit Company Profile', 'কোম্পানি তথ্য সম্পাদনা')}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-300 pt-3 border-t border-white/10 font-mono">
            <span>RJSC: {company?.registration_no || '—'}</span>
            <span>TIN: {company?.tin_no || '—'}</span>
            <span>BIN: {company?.bin_no || '—'}</span>
            <span>{company?.phone || ''}</span>
            <span>{company?.email || ''}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-medium text-emerald-900">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-medium text-rose-900">
          {error}
        </div>
      )}

      {/* 4-Pillar Real-Time Company Pulse (Starts strictly at 0 / 0.00) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{bi('Cash & Bank Balance', 'নগদ ও ব্যাংক স্থিতি')}</span>
            <Landmark className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            BDT {formatMoney(financials?.cash_and_bank.total_liquid_cash || '0.00')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 font-mono">
            {canViewReports
              ? `Cash: ${formatMoney(financials?.cash_and_bank.petty_cash || '0.00')} · Bank: ${formatMoney(financials?.cash_and_bank.bank_balance || '0.00')}`
              : bi('Managed by Finance & Accounts', 'হিসাব বিভাগ কর্তৃক পরিচালিত')}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{bi('Net Operating Profit (P&L)', 'নিট পরিচালন মুনাফা')}</span>
            <PieChart className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            BDT {formatMoney(financials?.net_income || '0.00')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 font-mono">
            {canViewReports
              ? `Rev: ${formatMoney(financials?.total_revenue || '0.00')} · Exp: ${formatMoney(financials?.total_expenses || '0.00')}`
              : bi('Financial Statements protected by role', 'রোল অনুমতি দ্বারা নিয়ন্ত্রিত')}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{bi('Active IT Projects', 'চলমান সফটওয়্যার প্রজেক্ট')}</span>
            <FolderKanban className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {activeProjects.length}{' '}
            <span className="text-xs font-normal text-slate-400">
              ({bi('BDT', 'টাকা')} {formatMoney(totalContractValue)})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5">
            {bi(`${documents.length} commercial documents issued`, `${documents.length}টি ব্যবসায়িক নথি ইস্যুকৃত`)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>{bi('Active Staff & Payroll', 'সক্রিয় কর্মী ও মাসিক বেতন')}</span>
            <Users className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {activeEmployees.length}{' '}
            <span className="text-xs font-normal text-slate-400">
              {bi('Employees', 'জন কর্মী')}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 font-mono">
            {bi('Monthly Gross:', 'মাসিক বেতন কাঠামো:')} BDT {formatMoney(monthlySalaryCommitment)}
          </div>
        </div>
      </div>

      {/* Departmental Quick Launchers (Distinct Color Per Module) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {canViewProjects && (
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="bg-white hover:bg-violet-50/60 border border-slate-200 hover:border-violet-300 rounded-xl p-3.5 text-left transition-colors cursor-pointer"
          >
            <FolderKanban className="w-5 h-5 text-violet-600 mb-2" />
            <div className="text-xs font-bold text-slate-900">{bi('IT Projects', 'আইটি প্রজেক্ট')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{bi('Contracts & UAT', 'চুক্তি ও মাইলস্টোন')}</div>
          </button>
        )}
        {canViewDocs && (
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="bg-white hover:bg-amber-50/60 border border-slate-200 hover:border-amber-300 rounded-xl p-3.5 text-left transition-colors cursor-pointer"
          >
            <Printer className="w-5 h-5 text-amber-600 mb-2" />
            <div className="text-xs font-bold text-slate-900">{bi('Billing & Print', 'বিলিং ও প্রিন্ট')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{bi('Invoices & Vouchers', 'ইনভয়েস ও রসিদ')}</div>
          </button>
        )}
        {canViewHr && (
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="bg-white hover:bg-teal-50/60 border border-slate-200 hover:border-teal-300 rounded-xl p-3.5 text-left transition-colors cursor-pointer"
          >
            <CalendarCheck2 className="w-5 h-5 text-teal-600 mb-2" />
            <div className="text-xs font-bold text-slate-900">{bi('Attendance', 'উপস্থিতি ও কর্মী')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{bi('Staff & Daily Roster', 'দৈনিক হাজিরা')}</div>
          </button>
        )}
        {canViewHr && (
          <button
            type="button"
            onClick={() => onNavigate('salary')}
            className="bg-white hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 rounded-xl p-3.5 text-left transition-colors cursor-pointer"
          >
            <Wallet className="w-5 h-5 text-emerald-600 mb-2" />
            <div className="text-xs font-bold text-slate-900">{bi('Payroll Desk', 'বেতন ও পেমেন্ট')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{bi('Payslips & Expense', 'বেতন শীট ও ভাউচার')}</div>
          </button>
        )}
        {canViewReports && (
          <button
            type="button"
            onClick={() => onNavigate('financials')}
            className="bg-white hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 rounded-xl p-3.5 text-left transition-colors cursor-pointer"
          >
            <PieChart className="w-5 h-5 text-emerald-700 mb-2" />
            <div className="text-xs font-bold text-slate-900">{bi('P&L & Balance Sheet', 'আর্থিক বিবরণী')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{bi('Live Statements', 'লাভ-ক্ষতি ও ব্যালেন্স')}</div>
          </button>
        )}
        {canManageBackup && (
          <button
            type="button"
            onClick={() => onNavigate('backup')}
            className="bg-white hover:bg-cyan-50/60 border border-slate-200 hover:border-cyan-300 rounded-xl p-3.5 text-left transition-colors cursor-pointer"
          >
            <Database className="w-5 h-5 text-cyan-600 mb-2" />
            <div className="text-xs font-bold text-slate-900">{bi('Backup Vault', 'ব্যাকআপ ভল্ট')}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{bi('JSON, SQLite & Reset', 'ব্যাকআপ ও রিস্টোর')}</div>
          </button>
        )}
      </div>

      {/* Edit Company Legal Profile Form (Inline Drawer) */}
      {editingCompany && canManageCompany && (
        <form
          onSubmit={saveCompany}
          className="bg-white rounded-2xl border border-blue-200 p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-700" />
              <h2 className="text-base font-bold text-slate-900">
                {bi('Company Legal Identity & Print Letterhead Configuration', 'কোম্পানির আইনি তথ্য ও লেটারহেড কনফিগারেশন')}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Company Name (English)', 'কোম্পানির নাম (ইংরেজি)')}
              </label>
              <input
                type="text"
                required
                value={formState.name_en || ''}
                onChange={(e) => setFormState({...formState, name_en: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Company Name (Bangla)', 'কোম্পানির নাম (বাংলা)')}
              </label>
              <input
                type="text"
                value={formState.name_bn || ''}
                onChange={(e) => setFormState({...formState, name_bn: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('RJSC Registration No.', 'আরজেএসসি নিবন্ধন নম্বর')}
              </label>
              <input
                type="text"
                value={formState.registration_no || ''}
                onChange={(e) => setFormState({...formState, registration_no: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">TIN</label>
              <input
                type="text"
                value={formState.tin_no || ''}
                onChange={(e) => setFormState({...formState, tin_no: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">BIN / VAT Reg.</label>
              <input
                type="text"
                value={formState.bin_no || ''}
                onChange={(e) => setFormState({...formState, bin_no: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Official Phone', 'অফিসিয়াল ফোন')}
              </label>
              <input
                type="text"
                value={formState.phone || ''}
                onChange={(e) => setFormState({...formState, phone: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Official Email', 'অফিসিয়াল ইমেইল')}
              </label>
              <input
                type="email"
                value={formState.email || ''}
                onChange={(e) => setFormState({...formState, email: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Website URL', 'ওয়েবসাইট')}
              </label>
              <input
                type="text"
                value={formState.website || ''}
                onChange={(e) => setFormState({...formState, website: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Tagline (English)', 'ট্যাগলাইন (ইংরেজি)')}
              </label>
              <input
                type="text"
                value={formState.tagline_en || ''}
                onChange={(e) => setFormState({...formState, tagline_en: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Registered Office Address (English)', 'অফিসের ঠিকানা (ইংরেজি)')}
              </label>
              <input
                type="text"
                value={formState.address_en || ''}
                onChange={(e) => setFormState({...formState, address_en: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {bi('Address (Bangla)', 'অফিসের ঠিকানা (বাংলা)')}
              </label>
              <input
                type="text"
                value={formState.address_bn || ''}
                onChange={(e) => setFormState({...formState, address_bn: e.target.value})}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditingCompany(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {bi('Cancel', 'বাতিল')}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 text-xs font-bold"
            >
              {bi('Save Company Profile', 'সংরক্ষণ করুন')}
            </button>
          </div>
        </form>
      )}

      {/* Main Split: Fresh Company Setup Checklist (Left) + Fiscal Periods & Pending Approvals (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {bi('Fresh Company Operational Readiness Guide', 'নতুন কোম্পানি পরিচালনা নির্দেশিকা')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {bi(
                  'Every module starts cleanly from 0.00. Follow these steps as your company begins live operations.',
                  'প্রতিটি মডিউল সম্পূর্ণ ০.০০ স্থিতি থেকে শুরু হয়েছে। দৈনন্দিন কার্যক্রম শুরু করতে ধাপগুলো অনুসরণ করুন।',
                )}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {setupSteps.map((st, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200/80 p-3.5 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {st.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-slate-900">{bi(st.titleEn, st.titleBn)}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{st.descEn}</div>
                  </div>
                </div>
                {st.actionLabel && (
                  <button
                    type="button"
                    onClick={st.onClick}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-900 hover:text-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shrink-0 transition-colors cursor-pointer"
                  >
                    {st.actionLabel}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Pending Journal Approvals + Fiscal Period Control */}
        <div className="lg:col-span-5 space-y-6">
          {canViewJournals && (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {bi('Journals Awaiting Approval', 'অনুমোদনের অপেক্ষায় থাকা জার্নাল')}
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {pendingJournals.length}
                </span>
              </div>

              {pendingJournals.length === 0 ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500 text-center">
                  {bi('0 pending journal vouchers in queue.', 'অনুমোদনের অপেক্ষায় কোনো জার্নাল নেই (০)।')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pendingJournals.slice(0, 4).map((je) => (
                    <div
                      key={je.id}
                      className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {je.voucher_no || `JV-${je.id}`} · {je.entry_date}
                        </div>
                        <div className="text-xs text-slate-600 truncate">{je.memo}</div>
                        <div className="font-mono text-xs font-semibold text-amber-900 mt-0.5">
                          BDT {formatMoney(je.total_debit)}
                        </div>
                      </div>
                      {canApproveJournals && (
                        <button
                          type="button"
                          onClick={() => void handleQuickApprove(je.id)}
                          className="rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-xs font-bold shrink-0 cursor-pointer"
                        >
                          {bi('Approve', 'অনুমোদন')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {bi('Fiscal Periods & Posting Locks', 'অর্থবছর ও পোস্টিং নিয়ন্ত্রণ')}
            </h3>
            <div className="space-y-2">
              {periods.map((fp) => (
                <div
                  key={fp.id}
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{fp.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {fp.start_date} → {fp.end_date}
                    </div>
                  </div>
                  {canManageCompany ? (
                    <button
                      type="button"
                      onClick={() => void handleTogglePeriod(fp.id)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold border cursor-pointer ${
                        fp.is_closed
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {fp.is_closed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                      {fp.is_closed ? bi('Closed', 'বন্ধ') : bi('Open', 'খোলা')}
                    </button>
                  ) : (
                    <span className="font-mono text-[11px] text-slate-600">
                      {fp.is_closed ? bi('Closed', 'বন্ধ') : bi('Open', 'খোলা')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {canManageCompany && (
              <form onSubmit={handleCreatePeriod} className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-slate-600">
                  {bi('Open Additional Fiscal Period', 'নতুন হিসাবকাল যুক্ত করুন')}
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. FY 2027-2028"
                  value={newPeriod.name}
                  onChange={(e) => setNewPeriod({...newPeriod, name: e.target.value})}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    required
                    value={newPeriod.start_date}
                    onChange={(e) => setNewPeriod({...newPeriod, start_date: e.target.value})}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="date"
                    required
                    value={newPeriod.end_date}
                    onChange={(e) => setNewPeriod({...newPeriod, end_date: e.target.value})}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white py-1.5 text-xs font-semibold cursor-pointer"
                >
                  {bi('Add Fiscal Period', 'হিসাবকাল যুক্ত করুন')}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
