import React, {useCallback, useEffect, useState} from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Landmark,
  PieChart,
  Printer,
  RefreshCw,
  Scale,
  Wallet,
} from 'lucide-react';
import {api} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {CompanyProfile, FinancialStatementsReport} from '../types';
import {
  buildFinancialStatementsHtml,
  downloadStandaloneHtml,
  printColorfulHtml,
} from '../utils/printEngine';

export function FinancialStatementsTab() {
  const {bi} = useI18n();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState('');
  const [asOfDate, setAsOfDate] = useState(todayIso);
  const [report, setReport] = useState<FinancialStatementsReport | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (startDate) qs.set('start_date', startDate);
      if (asOfDate) qs.set('as_of_date', asOfDate);
      const query = qs.toString() ? `?${qs.toString()}` : '';
      const [finData, compData] = await Promise.all([
        api.get<FinancialStatementsReport>(`/reports/financial-statements${query}`),
        api.get<CompanyProfile>('/company'),
      ]);
      setReport(finData);
      setCompany(compData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load financial statements');
    } finally {
      setLoading(false);
    }
  }, [startDate, asOfDate]);

  useEffect(() => {
    void loadStatements();
  }, [loadStatements]);

  const netIncomeNum = Number(report?.net_income || 0);
  const unclosedSurplus =
    Number(report?.total_equity_with_net_income || 0) - Number(report?.posted_equity || 0);

  return (
    <div className="space-y-6">
      {/* Distinct Domain Header: Executive Financial Statements Boardroom (Forest Emerald / Deep Slate) */}
      <div className="rounded-2xl bg-gradient-to-r from-[#091e1a] via-[#064e3b] to-[#0f172a] text-white p-6 shadow-md border border-emerald-950">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-400/15 border border-emerald-300/25 flex items-center justify-center shrink-0">
              <PieChart className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-300 font-semibold">
                {bi('Corporate Financial Reporting & Treasury Position', 'কর্পোরেট আর্থিক প্রতিবেদন ও ট্রেজারি স্থিতি')}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                {bi(
                  'Income Statement (P&L), Balance Sheet & Working Capital',
                  'লাভ-ক্ষতি বিবরণী (P&L), ব্যালেন্স শিট ও চলতি মূলধন',
                )}
              </h2>
              <p className="text-xs text-emerald-100/80 mt-1 max-w-2xl">
                {bi(
                  'Real-time double-entry financial statements derived directly from posted General Ledger vouchers, starting cleanly at BDT 0.00.',
                  'পোস্টকৃত জেনারেল লেজার ভাউচার থেকে সরাসরি প্রস্তুতকৃত রিয়েল-টাইম আর্থিক বিবরণী (প্রারম্ভিক স্থিতি ০.০০ টাকা)।',
                )}
              </p>
            </div>
          </div>

          {report && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => printColorfulHtml(buildFinancialStatementsHtml(report, company))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 text-slate-950 hover:bg-emerald-300 px-4 py-2 text-xs font-bold shadow-xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                {bi('Print Financial Statements (A4)', 'আর্থিক বিবরণী প্রিন্ট (A4)')}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadStandaloneHtml(
                    buildFinancialStatementsHtml(report, company),
                    `NextGen_Technix_Financial_Statements_${asOfDate || todayIso}`,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 text-xs font-semibold text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                HTML
              </button>
            </div>
          )}
        </div>

        {/* Date Filter Bar inside Boardroom Header */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-emerald-200 mb-1">
              {bi('P&L Period Start (Optional)', 'লাভ-ক্ষতি শুরুর তারিখ')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-300"
            />
          </div>
          <div>
            <label className="block text-[11px] text-emerald-200 mb-1">
              {bi('Statement As-Of Date', 'বিবরণীর শেষ তারিখ')}
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-300"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setStartDate('');
              setAsOfDate(todayIso);
            }}
            className="rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-1.5 text-xs font-medium text-emerald-100"
          >
            {bi('Cumulative to Today', 'আজ পর্যন্ত সামগ্রিক')}
          </button>
          <button
            type="button"
            onClick={() => void loadStatements()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {bi('Recalculate', 'পুনঃগণনা')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {report && (
        <>
          {/* 6-Card Cash, Bank & Working Capital Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>{bi('Petty Cash (1010)', 'খুচরা নগদ (১০১০)')}</span>
                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                BDT {formatMoney(report.cash_and_bank.petty_cash)}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>{bi('Operating Bank (1020)', 'ব্যাংক ব্যালেন্স (১০২০)')}</span>
                <Landmark className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                BDT {formatMoney(report.cash_and_bank.bank_balance)}
              </div>
            </div>

            <div className="bg-emerald-50/70 rounded-xl border border-emerald-200 p-3.5 shadow-xs">
              <div className="text-[11px] text-emerald-800 font-semibold">
                {bi('Total Liquid Cash', 'মোট তরল তহবিল')}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-950 mt-1.5">
                BDT {formatMoney(report.cash_and_bank.total_liquid_cash)}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>{bi('Client Receivables', 'গ্রাহক প্রাপ্য (১১০০)')}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                BDT {formatMoney(report.cash_and_bank.accounts_receivable)}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>{bi('Vendor & Accrued Payables', 'প্রদেয় দায় (২০১০+২২০০)')}</span>
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                BDT{' '}
                {formatMoney(
                  Number(report.cash_and_bank.accounts_payable) +
                    Number(report.cash_and_bank.accrued_liabilities),
                )}
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-xl border border-slate-800 p-3.5 shadow-xs">
              <div className="text-[11px] text-slate-300 font-medium">
                {bi('Net Equity / Net Worth', 'নিট সম্পদ (Assets − Liab.)')}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-300 mt-1.5">
                BDT {formatMoney(report.cash_and_bank.net_working_capital)}
              </div>
            </div>
          </div>

          {/* Accounting Equation Proof Banner */}
          <div
            className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs ${
              report.is_balance_sheet_balanced
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {report.is_balance_sheet_balanced ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              )}
              <span>
                {bi(
                  'Accounting Equation Proof: Assets = Liabilities + Shareholders’ Equity',
                  'হিসাববিজ্ঞান সমীকরণ যাচাই: মোট সম্পদ = মোট দায় + মালিকানা তহবিল',
                )}
              </span>
            </div>
            <div className="font-mono tabular-nums font-bold">
              BDT {formatMoney(report.total_assets)} = BDT {formatMoney(report.total_liabilities)} + BDT{' '}
              {formatMoney(report.total_equity_with_net_income)} (Δ {formatMoney(report.accounting_equation_difference)})
            </div>
          </div>

          {/* Side-by-Side Formal Statements */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* LEFT: INCOME STATEMENT (PROFIT & LOSS) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {bi('1. Income Statement (Profit & Loss)', '১. লাভ-ক্ষতি বিবরণী (Income Statement)')}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {startDate ? `${startDate} → ${asOfDate}` : bi(`Cumulative through ${asOfDate}`, `${asOfDate} পর্যন্ত সামগ্রিক`)}
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Margin: {report.profit_margin_percent}%
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {/* Operating Revenue Section */}
                <div className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 mb-2">
                    {bi('Operating Revenue (পরিচালন আয়)', 'পরিচালন আয় (Operating Revenue)')}
                  </div>
                  <div className="space-y-1.5">
                    {report.revenue_lines.map((r) => (
                      <div key={r.account_id} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 w-10 shrink-0">
                            {r.account_code}
                          </span>
                          <span className="text-slate-800 truncate">{bi(r.account_name_en, r.account_name_bn)}</span>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 ml-3">
                          {formatMoney(r.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-emerald-900">
                    <span>{bi('Total Operating Revenue', 'মোট পরিচালন আয়')}</span>
                    <span className="font-mono tabular-nums">BDT {formatMoney(report.total_revenue)}</span>
                  </div>
                </div>

                {/* Operating Expense Section */}
                <div className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-800 mb-2">
                    {bi('Operating Expenses (পরিচালন ব্যয়)', 'পরিচালন ব্যয় (Operating Expenses)')}
                  </div>
                  <div className="space-y-1.5">
                    {report.expense_lines.map((r) => (
                      <div key={r.account_id} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 w-10 shrink-0">
                            {r.account_code}
                          </span>
                          <span className="text-slate-800 truncate">{bi(r.account_name_en, r.account_name_bn)}</span>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 ml-3">
                          {formatMoney(r.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-rose-900">
                    <span>{bi('Total Operating Expenses', 'মোট পরিচালন ব্যয়')}</span>
                    <span className="font-mono tabular-nums">BDT {formatMoney(report.total_expenses)}</span>
                  </div>
                </div>

                {/* Net Profit / Loss Footer */}
                <div
                  className={`px-5 py-4 flex items-center justify-between ${
                    netIncomeNum >= 0 ? 'bg-emerald-950 text-white' : 'bg-rose-950 text-white'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">
                      {netIncomeNum >= 0
                        ? bi('Net Operating Profit', 'নিট পরিচালন মুনাফা')
                        : bi('Net Operating Loss', 'নিট পরিচালন ক্ষতি')}
                    </div>
                    <div className="text-[11px] text-white/70">
                      {bi('Revenue minus Operating Expenses', 'মোট আয় বিয়োগ মোট ব্যয়')}
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums">
                    BDT {formatMoney(report.net_income)}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: STATEMENT OF FINANCIAL POSITION (BALANCE SHEET) */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {bi('2. Statement of Financial Position (Balance Sheet)', '২. আর্থিক অবস্থার বিবরণী (Balance Sheet)')}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {bi(`As of ${asOfDate}`, `${asOfDate} তারিখের স্থিতি`)}
                  </p>
                </div>
                <Scale className="w-4 h-4 text-slate-500" />
              </div>

              <div className="divide-y divide-slate-100">
                {/* Assets */}
                <div className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 mb-2">
                    {bi('Assets (সম্পদসমূহ)', 'সম্পদসমূহ (Assets)')}
                  </div>
                  <div className="space-y-1.5">
                    {report.asset_lines.map((r) => (
                      <div key={r.account_id} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 w-10 shrink-0">
                            {r.account_code}
                          </span>
                          <span className="text-slate-800 truncate">{bi(r.account_name_en, r.account_name_bn)}</span>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 ml-3">
                          {formatMoney(r.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-blue-950">
                    <span>{bi('Total Assets', 'মোট সম্পদ')}</span>
                    <span className="font-mono tabular-nums">BDT {formatMoney(report.total_assets)}</span>
                  </div>
                </div>

                {/* Liabilities */}
                <div className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 mb-2">
                    {bi('Liabilities (দায়সমূহ)', 'দায়সমূহ (Liabilities)')}
                  </div>
                  <div className="space-y-1.5">
                    {report.liability_lines.map((r) => (
                      <div key={r.account_id} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 w-10 shrink-0">
                            {r.account_code}
                          </span>
                          <span className="text-slate-800 truncate">{bi(r.account_name_en, r.account_name_bn)}</span>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 ml-3">
                          {formatMoney(r.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-amber-950">
                    <span>{bi('Total Liabilities', 'মোট দায়')}</span>
                    <span className="font-mono tabular-nums">BDT {formatMoney(report.total_liabilities)}</span>
                  </div>
                </div>

                {/* Shareholders' Equity */}
                <div className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-violet-800 mb-2">
                    {bi("Shareholders' Equity (মালিকানা তহবিল)", 'মালিকানা তহবিল (Equity)')}
                  </div>
                  <div className="space-y-1.5">
                    {report.equity_lines.map((r) => (
                      <div key={r.account_id} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 w-10 shrink-0">
                            {r.account_code}
                          </span>
                          <span className="text-slate-800 truncate">{bi(r.account_name_en, r.account_name_bn)}</span>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 ml-3">
                          {formatMoney(r.balance)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs py-1 text-emerald-900 bg-emerald-50/70 px-2 rounded">
                      <span className="font-medium">
                        {bi('Current Unclosed Net Surplus / (Deficit)', 'চলতি হিসাবকালের নিট উদ্বৃত্ত / (ঘাটতি)')}
                      </span>
                      <span className="font-mono tabular-nums font-bold">{formatMoney(unclosedSurplus)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-violet-950">
                    <span>{bi('Total Equity (Incl. Current Surplus)', 'মোট মালিকানা তহবিল')}</span>
                    <span className="font-mono tabular-nums">
                      BDT {formatMoney(report.total_equity_with_net_income)}
                    </span>
                  </div>
                </div>

                {/* Total Liabilities & Equity Footer */}
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">
                      {bi('Total Liabilities & Equity', 'মোট দায় ও মালিকানা তহবিল')}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {bi('Matches Total Assets in balanced ledger', 'সুষম লেজারে মোট সম্পদের সমান')}
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono tabular-nums text-emerald-300">
                    BDT {formatMoney(report.total_liabilities_and_equity)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
