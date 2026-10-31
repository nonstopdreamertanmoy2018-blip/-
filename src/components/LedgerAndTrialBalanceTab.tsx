import React, {useCallback, useEffect, useState} from 'react';
import {AlertTriangle, BookOpen, CheckCircle2, Download, Printer, Scale} from 'lucide-react';
import {apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {Account, CompanyProfile, GeneralLedgerReport, VerifiedTrialBalance} from '../types';
import {
  buildGeneralLedgerHtml,
  buildTrialBalanceHtml,
  downloadColorfulHtml,
  printColorfulHtml,
} from '../utils/printEngine';

interface LedgerAndTrialBalanceTabProps {
  company?: CompanyProfile | null;
}

export function LedgerAndTrialBalanceTab({company}: LedgerAndTrialBalanceTabProps) {
  const {bi, t, accountTypeLabel} = useI18n();
  const [subView, setSubView] = useState<'trial_balance' | 'general_ledger'>('trial_balance');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [includeZero, setIncludeZero] = useState<boolean>(true);

  const [tb, setTb] = useState<VerifiedTrialBalance | null>(null);
  const [gl, setGl] = useState<GeneralLedgerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Account[]>('/accounts')
      .then((list) => {
        setAccounts(list);
        if (list.length > 0) {
          const bankOrFirst = list.find((a) => a.code === '1020') || list[0];
          setSelectedAccountId(bankOrFirst.id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load accounts'));
  }, []);

  const loadTrialBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('as_of_date', endDate);
      params.set('include_zero', includeZero ? 'true' : 'false');
      const res = await apiRequest<VerifiedTrialBalance>(`/reports/trial-balance/verified?${params.toString()}`);
      setTb(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute Trial Balance');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, includeZero]);

  const loadGeneralLedger = useCallback(
    async (accId: number) => {
      if (!accId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({account_id: String(accId)});
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);
        const res = await apiRequest<GeneralLedgerReport>(`/reports/general-ledger?${params.toString()}`);
        setGl(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load General Ledger');
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate],
  );

  useEffect(() => {
    if (subView === 'trial_balance') {
      loadTrialBalance();
    } else if (selectedAccountId) {
      loadGeneralLedger(selectedAccountId);
    }
  }, [subView, selectedAccountId, includeZero, loadTrialBalance, loadGeneralLedger]);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (subView === 'trial_balance') {
      loadTrialBalance();
    } else {
      loadGeneralLedger(selectedAccountId);
    }
  };

  const handlePrintCurrentReport = () => {
    if (subView === 'trial_balance' && tb) {
      printColorfulHtml(buildTrialBalanceHtml(tb, company));
    } else if (subView === 'general_ledger' && gl) {
      printColorfulHtml(buildGeneralLedgerHtml(gl, company));
    }
  };

  const handleDownloadCurrentHtml = () => {
    if (subView === 'trial_balance' && tb) {
      downloadColorfulHtml(buildTrialBalanceHtml(tb, company), 'Verified_Trial_Balance.html');
    } else if (subView === 'general_ledger' && gl) {
      downloadColorfulHtml(buildGeneralLedgerHtml(gl, company), `General_Ledger_${gl.account_code}.html`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Royal Blue Audit & Reconciliation Header */}
      <section className="rounded-2xl bg-gradient-to-r from-blue-950 via-blue-900 to-slate-900 text-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 no-print">
        <div className="space-y-1">
          <div className="text-xs text-sky-300 font-medium">
            {bi(
              'Accounting & Audit Engine · Double-Entry Mathematical Verification',
              'হিসাব ও নিরীক্ষা ইঞ্জিন · ডাবল-এন্ট্রি গাণিতিক যাচাই',
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {bi('General Ledger & Verified Trial Balance', 'জেনারেল লেজার ও গাণিতিক ট্রায়াল ব্যালেন্স')}
          </h1>
          <p className="text-xs text-blue-100/90 max-w-2xl">
            {bi(
              'Starts cleanly at BDT 0.00 across all ledger accounts and updates strictly from approved & posted vouchers.',
              'সকল হিসাব খাতে ০.০০ টাকা প্রারম্ভিক জের হতে শুরু এবং শুধুমাত্র অনুমোদিত ও পোস্টকৃত ভাউচার হতে গণনাকৃত।',
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-white/10 border border-white/15 rounded-xl">
            <button
              type="button"
              onClick={() => setSubView('trial_balance')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'trial_balance'
                  ? 'bg-white text-blue-950'
                  : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{bi('Verified Trial Balance', 'ট্রায়াল ব্যালেন্স')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('general_ledger')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subView === 'general_ledger'
                  ? 'bg-white text-blue-950'
                  : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{bi('General Ledger', 'জেনারেল লেজার')}</span>
            </button>
          </div>

          <button
            type="button"
            disabled={(subView === 'trial_balance' && !tb) || (subView === 'general_ledger' && !gl)}
            onClick={handlePrintCurrentReport}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-300 hover:bg-sky-200 disabled:opacity-50 rounded-xl whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('printPdf')}</span>
          </button>

          <button
            type="button"
            disabled={(subView === 'trial_balance' && !tb) || (subView === 'general_ledger' && !gl)}
            onClick={handleDownloadCurrentHtml}
            title="Download Printable HTML"
            className="p-2 text-white bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Filter Bar */}
      <form
        onSubmit={handleApplyFilter}
        className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end justify-between gap-4 no-print"
      >
        <div className="flex flex-wrap items-end gap-4 flex-1">
          {subView === 'general_ledger' && (
            <div className="min-w-64 flex-1 max-w-md">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Ledger Account', 'লেজার হিসাব খাত')}
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {bi(a.name_en, a.name_bn)} ({a.normal_balance.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {bi('From Date', 'শুরুর তারিখ')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {bi('To / As-Of Date', 'শেষ তারিখ')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>

          {subView === 'trial_balance' && (
            <label className="inline-flex items-center gap-2 pb-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeZero}
                onChange={(e) => setIncludeZero(e.target.checked)}
                className="w-4 h-4 accent-blue-800 rounded cursor-pointer"
              />
              <span>{bi('Show 0.00 Active Accounts', '০.০০ জেরযুক্ত সক্রিয় হিসাব দেখান')}</span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-950 cursor-pointer"
          >
            {bi('Run Statement', 'বিবরণী দেখুন')}
          </button>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-3 py-2 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {bi('All Dates', 'সব তারিখ')}
            </button>
          )}
        </div>
      </form>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* VIEW 1: MATHEMATICALLY VERIFIED TRIAL BALANCE */}
      {subView === 'trial_balance' && tb && (
        <div className="space-y-4 print-only-sheet">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {tb.verification.ledger_reconciled && tb.verification.is_closing_balanced ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />
              )}
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {tb.verification.ledger_reconciled && tb.verification.is_closing_balanced
                    ? bi(
                        'Ledger Verified: Opening, Period Movements & Closing Balances Match',
                        'গাণিতিক যাচাই সফল: প্রারম্ভিক, চলতি লেনদেন এবং সমাপনী জের সম্পূর্ণ সুষম',
                      )
                    : bi('Reconciliation Discrepancy Detected', 'সমন্বয় অসামঞ্জস্যতা শনাক্ত হয়েছে')}
                </div>
                <div className="text-xs text-slate-500">
                  {bi(
                    `${tb.rows.length} ledger accounts displayed · Independent journal sum cross-checked`,
                    `${tb.rows.length} টি হিসাব প্রদর্শিত · স্বতন্ত্র জার্নাল যোগফল যাচাইকৃত`,
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs font-mono tabular-nums text-blue-950 font-semibold">
              DR {formatMoney(tb.verification.raw_journal_debit_sum)} = CR{' '}
              {formatMoney(tb.verification.raw_journal_credit_sum)} · Diff {formatMoney(tb.verification.reconciliation_discrepancy)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {bi('Verifying ledger balances...', 'লেজার ব্যালেন্স যাচাই করা হচ্ছে...')}
              </div>
            ) : tb.rows.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {bi('No non-zero movements recorded yet.', 'এখনও কোনো অশূন্য লেনদেন পোস্ট করা হয়নি।')}
                </div>
                <p className="text-xs text-slate-500">
                  {bi(
                    'Enable "Show 0.00 Active Accounts" above to inspect all 16 Chart of Accounts at 0.00 BDT.',
                    'সকল ১৬টি হিসাব খাত ০.০০ টাকায় দেখতে উপরের "০.০০ জেরযুক্ত সক্রিয় হিসাব দেখান" নির্বাচন করুন।',
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-blue-950 text-white">
                      <th className="py-3 px-4 font-semibold">{bi('Code', 'কোড')}</th>
                      <th className="py-3 px-4 font-semibold">{bi('Account Name', 'হিসাবের নাম')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Classification', 'শ্রেণি')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Opening DR', 'প্রারম্ভিক DR')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Opening CR', 'প্রারম্ভিক CR')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Movement DR', 'চলতি DR')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Movement CR', 'চলতি CR')}</th>
                      <th className="py-3 px-3 font-semibold text-right bg-blue-900">{bi('Closing DR', 'সমাপনী DR')}</th>
                      <th className="py-3 px-4 font-semibold text-right bg-blue-900">{bi('Closing CR', 'সমাপনী CR')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {tb.rows.map((row) => (
                      <tr key={row.account_code} className="hover:bg-sky-50/50">
                        <td className="py-2.5 px-4 font-mono font-bold text-blue-950 whitespace-nowrap">
                          {row.account_code}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {bi(row.account_name, row.account_name_bn)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {accountTypeLabel(row.account_type)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatMoney(row.opening_debit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatMoney(row.opening_credit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatMoney(row.period_debit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatMoney(row.period_credit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-blue-950 bg-sky-50/40">
                          {formatMoney(row.debit)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-blue-950 bg-sky-50/40">
                          {formatMoney(row.credit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-950 text-white font-bold">
                      <td colSpan={3} className="py-3 px-4">
                        {bi('Verified Totals (BDT)', 'সর্বমোট যাচাইকৃত যোগফল (BDT)')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatMoney(tb.total_opening_debit)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatMoney(tb.total_opening_credit)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatMoney(tb.total_period_debit)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {formatMoney(tb.total_period_credit)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-300">
                        {formatMoney(tb.total_closing_debit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-sky-300">
                        {formatMoney(tb.total_closing_credit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: GENERAL LEDGER RUNNING STATEMENT */}
      {subView === 'general_ledger' && gl && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden print-only-sheet">
          <div className="p-5 bg-blue-950 text-white flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-sky-300">
                {gl.account_code} · {accountTypeLabel(gl.account_type)} · {bi('Normal Balance', 'নরমাল জের')}:{' '}
                {gl.normal_balance.toUpperCase()}
              </div>
              <h2 className="text-lg font-bold mt-0.5">{bi(gl.account_name_en, gl.account_name_bn)}</h2>
            </div>

            <div className="text-right font-mono tabular-nums">
              <div className="text-xs text-blue-200">{bi('Closing Running Balance', 'সমাপনী চলমান জের')}</div>
              <div className="text-lg font-bold text-sky-300">
                BDT {formatMoney(gl.closing_balance)} {gl.closing_side !== 'ZERO' ? gl.closing_side : ''}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                  <th className="py-3 px-4 font-semibold">{bi('Date', 'তারিখ')}</th>
                  <th className="py-3 px-3 font-semibold">{bi('Voucher No', 'ভাউচার নং')}</th>
                  <th className="py-3 px-3 font-semibold">{bi('Particulars / Narration', 'বিবরণ')}</th>
                  <th className="py-3 px-3 font-semibold text-right">{t('debit')}</th>
                  <th className="py-3 px-3 font-semibold text-right">{t('credit')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{bi('Running Balance', 'চলমান জের')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="bg-sky-50/40 font-medium text-slate-700">
                  <td className="py-2.5 px-4 font-mono">{gl.start_date || '—'}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-900">OPENING</td>
                  <td className="py-2.5 px-3">{bi('Opening Balance', 'প্রারম্ভিক জের')}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {gl.opening_side === 'DR' ? formatMoney(gl.opening_balance) : '0.00'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {gl.opening_side === 'CR' ? formatMoney(gl.opening_balance) : '0.00'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-blue-950">
                    {formatMoney(gl.opening_balance)} {gl.opening_side !== 'ZERO' ? gl.opening_side : ''}
                  </td>
                </tr>

                {gl.movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      {bi(
                        '0 posted transactions in this ledger account. Post a Journal Voucher, Payroll, or Commercial Document to record movements.',
                        'এই লেজার হিসাবে এখনও কোনো পোস্টকৃত লেনদেন নেই।',
                      )}
                    </td>
                  </tr>
                ) : (
                  gl.movements.map((m) => (
                    <tr key={m.line_id} className="hover:bg-sky-50/40">
                      <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">{m.entry_date}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-950 whitespace-nowrap">
                        {m.voucher_no}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        <div>{m.memo}</div>
                        {m.line_description && <div className="text-slate-500">{m.line_description}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {Number(m.debit) > 0 ? formatMoney(m.debit) : '0.00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {Number(m.credit) > 0 ? formatMoney(m.credit) : '0.00'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-blue-950 whitespace-nowrap">
                        {formatMoney(m.running_balance)} {m.balance_side !== 'ZERO' ? m.balance_side : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-blue-950 text-white font-bold">
                  <td colSpan={3} className="py-3 px-4">
                    {bi('Period Totals & Closing Balance', 'মোট লেনদেন ও সমাপনী জের')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{formatMoney(gl.period_debit)}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{formatMoney(gl.period_credit)}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-sky-300">
                    {formatMoney(gl.closing_balance)} {gl.closing_side !== 'ZERO' ? gl.closing_side : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
