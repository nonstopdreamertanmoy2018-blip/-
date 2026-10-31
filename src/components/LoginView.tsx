import React, {useState} from 'react';
import {CheckCircle2, Eye, EyeOff, KeyRound, Lock, ShieldCheck} from 'lucide-react';
import {loginWithPassword} from '../api';
import {useI18n} from '../i18n';
import {COMPANY_HQ_URL, COMPANY_LOGO_URL} from '../utils/printEngine';

interface LoginViewProps {
  onAuthenticated: () => void;
}

const ROLE_WORKSPACES = [
  {
    username: 'admin',
    pw: 'ChangeThis-Immediately-123!',
    roleEn: 'Administrator',
    roleBn: 'প্রশাসক (Administrator)',
    scopeEn: 'Full Company, Users, Permissions, Finance & HR',
  },
  {
    username: 'accountant',
    pw: 'NextGen-Acc-2026!',
    roleEn: 'Accountant',
    roleBn: 'হিসাবরক্ষক (Accountant)',
    scopeEn: 'COA, Journals, Ledger, P&L, Balance Sheet & Payroll',
  },
  {
    username: 'hr_payroll',
    pw: 'NextGen-HR-2026!',
    roleEn: 'HR & Payroll',
    roleBn: 'মানবসম্পদ ও পেরোল (HR)',
    scopeEn: 'Staff Onboarding, Attendance, Leave & Salary Sheets',
  },
  {
    username: 'project_manager',
    pw: 'NextGen-PM-2026!',
    roleEn: 'Project Manager',
    roleBn: 'প্রজেক্ট ম্যানেজার',
    scopeEn: 'Software Projects, Milestones, Tech Stack & UAT',
  },
  {
    username: 'sales_exec',
    pw: 'NextGen-Sales-2026!',
    roleEn: 'Sales Executive',
    roleBn: 'বিক্রয় কর্মকর্তা (Sales)',
    scopeEn: 'Client Contracts, Quotations, Invoices & Receipts',
  },
  {
    username: 'employee',
    pw: 'NextGen-Staff-2026!',
    roleEn: 'Employee',
    roleBn: 'কর্মী (Employee)',
    scopeEn: 'Attendance View, Assigned Projects & Company Notices',
  },
];

export function LoginView({onAuthenticated}: LoginViewProps) {
  const {lang, setLang, t, bi} = useI18n();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('ChangeThis-Immediately-123!');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(username.trim(), password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex flex-col">
      <header className="flex items-center justify-between gap-6 px-6 py-4 bg-[#0b1120] text-white border-b border-slate-800">
        <div className="flex items-center gap-3 shrink-0">
          <img
            src={COMPANY_LOGO_URL}
            alt="NEXTGEN TECHNIX LIMITED Logo"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-white"
          />
          <div>
            <div className="text-base sm:text-lg font-bold tracking-tight text-white">
              {t('companyFull')}
            </div>
            <div className="text-xs text-slate-400 hidden sm:block">
              {bi(
                'Premier IT Company & Custom Software Engineering Studio · Enterprise ERP',
                'শীর্ষস্থানীয় আইটি ও সফটওয়্যার নির্মাতা প্রতিষ্ঠান · এন্টারপ্রাইজ ইআরপি',
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              lang === 'en' ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang('bn')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              lang === 'bn' ? 'bg-white text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            বাংলা
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Corporate Identity & 6-Role Architecture Panel */}
        <div className="lg:col-span-7 space-y-6">
          <div className="relative rounded-2xl overflow-hidden shadow-md border border-slate-200 bg-slate-900">
            <img
              src={COMPANY_HQ_URL}
              alt="NEXTGEN TECHNIX LIMITED Headquarters"
              referrerPolicy="no-referrer"
              className="w-full h-56 sm:h-64 object-cover opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-transparent p-6 flex flex-col justify-end text-white">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                {bi('Production-Ready Corporate ERP · Starting at BDT 0.00', 'ব্যবহারযোগ্য কর্পোরেট ইআরপি · প্রারম্ভিক স্থিতি ০.০০ টাকা')}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                {bi('NEXTGEN TECHNIX LIMITED', 'নেক্সটজেন টেকনিক্স লিমিটেড')}
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 mt-1.5 max-w-xl leading-relaxed">
                {bi(
                  'Unified IT Project Delivery, Staff Attendance, Monthly Payroll, Commercial Invoicing, and Double-Entry Financial Statements.',
                  'সফটওয়্যার প্রজেক্ট, কর্মীদের উপস্থিতি, মাসিক বেতন, কমার্শিয়াল ইনভয়েসিং এবং ডাবল-এন্ট্রি ফিন্যান্সিয়াল অ্যাকাউন্টিং সিস্টেম।',
                )}
              </p>
            </div>
          </div>

          {/* 6-Role Initial Access Selector */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  {bi('6 Departmental Role Logins (Select to Fill Credentials)', '৬টি বিভাগীয় রোল লগইন (ক্লিক করে নির্বাচন করুন)')}
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">
                {bi('Passwords changeable anytime after sign-in', 'লগইন শেষে পাসওয়ার্ড পরিবর্তনযোগ্য')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ROLE_WORKSPACES.map((acct) => {
                const selected = username === acct.username;
                return (
                  <button
                    key={acct.username}
                    type="button"
                    onClick={() => {
                      setUsername(acct.username);
                      setPassword(acct.pw);
                      setError(null);
                    }}
                    className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      selected
                        ? 'border-indigo-600 bg-indigo-50/70 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {bi(acct.roleEn, acct.roleBn)}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-100 px-2 py-0.5 rounded">
                        {acct.username}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">{acct.scopeEn}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Sign-In Card */}
        <div className="lg:col-span-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{t('signIn')}</h2>
                <p className="text-xs text-slate-500">
                  {bi('Role-based authenticated ERP session', 'ভূমিকা-ভিত্তিক সুরক্ষিত ইআরপি সেশন')}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('username')}
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {t('password')}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 pl-3.5 pr-10 py-2.5 text-sm font-mono focus:outline-none focus:border-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 text-sm font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Lock className="w-4 h-4 text-emerald-400" />
                {loading
                  ? bi('Signing in...', 'লগইন হচ্ছে...')
                  : bi('Sign In to NEXTGEN TECHNIX ERP', 'ইআরপি ওয়ার্কস্পেসে প্রবেশ করুন')}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 space-y-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {bi(
                    'All accounts, ledgers, payroll, projects, and invoices start strictly at 0.00 BDT.',
                    'সকল হিসাব, লেজার, পেরোল, প্রজেক্ট এবং চালান সম্পূর্ণ শূন্য (০.০০ টাকা) থেকে শুরু।',
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {bi(
                    'Administrators can create named staff accounts and update role permissions anytime.',
                    'প্রশাসক যেকোনো সময় নতুন কর্মী লগইন তৈরি ও রোল পারমিশন কাস্টমাইজ করতে পারবেন।',
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
