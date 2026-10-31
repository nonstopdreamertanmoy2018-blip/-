import React, {useCallback, useEffect, useState} from 'react';
import {
  BookOpen,
  Building2,
  CalendarCheck2,
  Database,
  FileSpreadsheet,
  FolderKanban,
  LogOut,
  Menu,
  PieChart,
  Printer,
  Scale,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import {apiRequest, getStoredToken, setStoredToken} from './api';
import {AttendanceTab} from './components/AttendanceTab';
import {BackupTab} from './components/BackupTab';
import {ChartOfAccountsTab} from './components/ChartOfAccountsTab';
import {FinancialStatementsTab} from './components/FinancialStatementsTab';
import {JournalsTab} from './components/JournalsTab';
import {LedgerAndTrialBalanceTab} from './components/LedgerAndTrialBalanceTab';
import {LoginView} from './components/LoginView';
import {OverviewTab} from './components/OverviewTab';
import {PrintableDocumentsTab} from './components/PrintableDocumentsTab';
import {ProjectsTab} from './components/ProjectsTab';
import {SalaryAndPaymentTab} from './components/SalaryAndPaymentTab';
import {UsersAndPermissionsTab} from './components/UsersAndPermissionsTab';
import {I18nProvider, useI18n} from './i18n';
import {CompanyProfile, CurrentUser} from './types';
import {COMPANY_LOGO_URL} from './utils/printEngine';

interface NavItem {
  id: string;
  sectionEn: string;
  sectionBn: string;
  label: string;
  icon: React.ComponentType<{className?: string}>;
  activeClass: string;
  visible: boolean;
}

function WorkspaceApp() {
  const {lang, setLang, t, bi, roleLabel} = useI18n();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setBootstrapping(false);
      return;
    }
    try {
      const [me, comp] = await Promise.all([
        apiRequest<CurrentUser>('/auth/me'),
        apiRequest<CompanyProfile>('/company'),
      ]);
      setUser(me);
      setCompany(comp);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const corpName = company?.name_en || 'NEXTGEN TECHNIX LIMITED';
    document.title = `${corpName} — Enterprise ERP`;
  }, [company?.name_en]);

  const handleSignOut = () => {
    setStoredToken(null);
    setUser(null);
    setActiveTab('overview');
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sm text-slate-200">
        {bi('Loading NEXTGEN TECHNIX LIMITED ERP...', 'নেক্সটজেন টেকনিক্স লিমিটেড ইআরপি লোড হচ্ছে...')}
      </div>
    );
  }

  if (!user) {
    return <LoginView onAuthenticated={loadSession} />;
  }

  const navItems: NavItem[] = [
    {
      id: 'overview',
      sectionEn: 'Executive',
      sectionBn: 'নির্বাহী কেন্দ্র',
      label: t('navOverview'),
      icon: Building2,
      activeClass: 'bg-blue-600 text-white shadow-xs',
      visible: true,
    },
    {
      id: 'projects',
      sectionEn: 'Software & Commercial',
      sectionBn: 'সফটওয়্যার ও বিক্রয়',
      label: t('navProjects'),
      icon: FolderKanban,
      activeClass: 'bg-violet-600 text-white shadow-xs',
      visible: user.permissions.includes('projects:view') || user.permissions.includes('projects:manage'),
    },
    {
      id: 'documents',
      sectionEn: 'Software & Commercial',
      sectionBn: 'সফটওয়্যার ও বিক্রয়',
      label: t('navDocuments'),
      icon: Printer,
      activeClass: 'bg-amber-500 text-slate-950 shadow-xs',
      visible: user.permissions.includes('documents:view'),
    },
    {
      id: 'attendance',
      sectionEn: 'HR & Payroll',
      sectionBn: 'মানবসম্পদ ও পেরোল',
      label: t('navAttendance'),
      icon: CalendarCheck2,
      activeClass: 'bg-teal-600 text-white shadow-xs',
      visible: user.permissions.includes('hr:view'),
    },
    {
      id: 'salary',
      sectionEn: 'HR & Payroll',
      sectionBn: 'মানবসম্পদ ও পেরোল',
      label: t('navSalary'),
      icon: Wallet,
      activeClass: 'bg-emerald-600 text-white shadow-xs',
      visible: user.permissions.includes('hr:view') || user.permissions.includes('payroll:manage'),
    },
    {
      id: 'accounts',
      sectionEn: 'Accounting & Finance',
      sectionBn: 'হিসাবরক্ষণ ও অর্থ',
      label: t('navAccounts'),
      icon: BookOpen,
      activeClass: 'bg-sky-600 text-white shadow-xs',
      visible: user.permissions.includes('accounts:view'),
    },
    {
      id: 'journals',
      sectionEn: 'Accounting & Finance',
      sectionBn: 'হিসাবরক্ষণ ও অর্থ',
      label: t('navJournals'),
      icon: FileSpreadsheet,
      activeClass: 'bg-indigo-600 text-white shadow-xs',
      visible: user.permissions.includes('journals:view'),
    },
    {
      id: 'ledger',
      sectionEn: 'Accounting & Finance',
      sectionBn: 'হিসাবরক্ষণ ও অর্থ',
      label: t('navLedger'),
      icon: Scale,
      activeClass: 'bg-blue-700 text-white shadow-xs',
      visible: user.permissions.includes('reports:view'),
    },
    {
      id: 'financials',
      sectionEn: 'Accounting & Finance',
      sectionBn: 'হিসাবরক্ষণ ও অর্থ',
      label: t('navFinancials'),
      icon: PieChart,
      activeClass: 'bg-emerald-700 text-white shadow-xs',
      visible: user.permissions.includes('reports:view'),
    },
    {
      id: 'backup',
      sectionEn: 'System & Governance',
      sectionBn: 'সিস্টেম ও নিরাপত্তা',
      label: t('navBackup'),
      icon: Database,
      activeClass: 'bg-cyan-600 text-white shadow-xs',
      visible: user.permissions.includes('backup:manage'),
    },
    {
      id: 'users',
      sectionEn: 'System & Governance',
      sectionBn: 'সিস্টেম ও নিরাপত্তা',
      label: t('navUsers'),
      icon: ShieldCheck,
      activeClass: 'bg-amber-400 text-slate-950 shadow-xs',
      visible: true,
    },
  ].filter((item) => item.visible);

  const activeNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  const sectionOrder: Array<{en: string; bn: string}> = [];
  for (const item of navItems) {
    if (!sectionOrder.some((s) => s.en === item.sectionEn)) {
      sectionOrder.push({en: item.sectionEn, bn: item.sectionBn});
    }
  }

  const renderSidebarNav = (closeOnSelect = false) => (
    <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
      {sectionOrder.map((sec) => {
        const groupItems = navItems.filter((i) => i.sectionEn === sec.en);
        return (
          <div key={sec.en}>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              {bi(sec.en, sec.bn)}
            </div>
            <div className="space-y-0.5">
              {groupItems.map((item) => {
                const Icon = item.icon;
                const active = activeNav.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      if (closeOnSelect) setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      active ? item.activeClass : 'text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex">
      {/* Structured Departmental Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-[#0b1120] text-slate-100 border-r border-slate-800 shrink-0 no-print">
        <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
          <img
            src={company?.logo_url || COMPANY_LOGO_URL}
            alt="NEXTGEN TECHNIX LIMITED Logo"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover border border-slate-700 bg-white shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-tight text-white truncate">
              {bi(company?.name_en || 'NEXTGEN TECHNIX LIMITED', company?.name_bn)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
              {bi('Enterprise IT & Financial ERP', 'আইটি ও ফিন্যান্সিয়াল ইআরপি')}
            </div>
          </div>
        </div>

        {renderSidebarNav(false)}

        <div className="p-4 border-t border-slate-800 bg-slate-900/70 space-y-1 text-xs">
          <div className="font-semibold text-white truncate">
            {bi(user.full_name_en || user.username, user.full_name_bn || user.username)}
          </div>
          <div className="text-slate-400 truncate flex items-center justify-between gap-2">
            <span>{roleLabel(user.role)}</span>
            <span className="font-mono text-[11px] text-emerald-400">{user.username}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 w-64 bg-[#0b1120] text-slate-100 flex flex-col">
            <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={company?.logo_url || COMPANY_LOGO_URL}
                  alt="Logo"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg object-cover border border-slate-700 bg-white"
                />
                <span className="text-xs font-bold text-white truncate">{t('brandTitle')}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarNav(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 px-6 py-3 bg-white border-b border-slate-200/90 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-1.5 text-slate-700 hover:bg-slate-100 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate flex items-center gap-2">
              <span className="font-bold text-slate-900">
                {bi(company?.name_en || t('companyFull'), company?.name_bn)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-700">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {roleLabel(user.role)}
            </span>

            <div className="flex items-center gap-1 p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  lang === 'en' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  lang === 'bn' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                }`}
              >
                বাংলা
              </button>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-rose-50 hover:text-rose-800 hover:border-rose-200 whitespace-nowrap cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('signOut')}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-5 sm:px-6 py-6">
          {activeNav.id === 'overview' && (
            <OverviewTab
              user={user}
              company={company}
              onCompanyUpdated={setCompany}
              onNavigate={setActiveTab}
            />
          )}
          {activeNav.id === 'projects' && <ProjectsTab user={user} />}
          {activeNav.id === 'documents' && <PrintableDocumentsTab user={user} company={company} />}
          {activeNav.id === 'attendance' && <AttendanceTab user={user} company={company} />}
          {activeNav.id === 'salary' && <SalaryAndPaymentTab user={user} company={company} />}
          {activeNav.id === 'accounts' && <ChartOfAccountsTab user={user} company={company} />}
          {activeNav.id === 'journals' && <JournalsTab user={user} company={company} />}
          {activeNav.id === 'ledger' && <LedgerAndTrialBalanceTab company={company} />}
          {activeNav.id === 'financials' && <FinancialStatementsTab />}
          {activeNav.id === 'backup' && <BackupTab user={user} />}
          {activeNav.id === 'users' && (
            <UsersAndPermissionsTab currentUser={user} onPermissionsChanged={loadSession} />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <WorkspaceApp />
    </I18nProvider>
  );
}
