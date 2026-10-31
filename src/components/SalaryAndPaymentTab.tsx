import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Banknote,
  Calculator,
  CheckCircle2,
  Download,
  Edit3,
  Printer,
  Send,
  Wallet,
} from 'lucide-react';
import {apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {
  Account,
  BusinessDocument,
  CompanyProfile,
  CurrentUser,
  Employee,
  SalaryPayment,
} from '../types';
import {
  COMPANY_LOGO_URL,
  COMPANY_WORKSPACE_URL,
  buildBusinessDocumentHtml,
  buildMasterSalarySheetHtml,
  buildSalaryPayslipHtml,
  downloadColorfulHtml,
  printColorfulHtml,
} from '../utils/printEngine';

interface SalaryAndPaymentTabProps {
  user: CurrentUser;
  company: CompanyProfile | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

export function SalaryAndPaymentTab({user, company}: SalaryAndPaymentTabProps) {
  const {bi} = useI18n();
  const [subMode, setSubMode] = useState<'payroll' | 'quick_payment'>('payroll');
  const [salaryMonth, setSalaryMonth] = useState(currentMonthIso());
  const [workingDays, setWorkingDays] = useState(26);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState('Corporate Bank Transfer');
  const [paymentAccountCode, setPaymentAccountCode] = useState('1020');

  const [slips, setSlips] = useState<SalaryPayment[]>([]);
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentVouchers, setRecentVouchers] = useState<BusinessDocument[]>([]);
  const [editingSlip, setEditingSlip] = useState<SalaryPayment | null>(null);
  const [adjForm, setAdjForm] = useState({
    bonus_amount: '0.00',
    advance_deduction: '0.00',
    tax_deduction: '0.00',
    notes: '',
  });

  const [qpForm, setQpForm] = useState({
    payment_date: todayIso(),
    payee_name_en: '',
    payee_name_bn: '',
    expense_account_id: 0,
    paid_from_account_id: 0,
    amount: '',
    payment_method: 'Corporate Bank Transfer',
    purpose_en: '',
    purpose_bn: '',
  });
  const [lastQuickVoucher, setLastQuickVoucher] = useState<BusinessDocument | null>(null);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canManagePayroll = user.permissions.includes('payroll:manage');
  const canViewDocs = user.permissions.includes('documents:view');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payrollData, empData, accData, docData] = await Promise.all([
        apiRequest<SalaryPayment[]>(`/hr/payroll?salary_month=${salaryMonth}`),
        user.permissions.includes('hr:view')
          ? apiRequest<Employee[]>('/hr/employees')
          : Promise.resolve([]),
        user.permissions.includes('accounts:view')
          ? apiRequest<Account[]>('/accounts?include_inactive=false')
          : Promise.resolve([]),
        canViewDocs
          ? apiRequest<BusinessDocument[]>('/documents?doc_type=payment_voucher')
          : Promise.resolve([]),
      ]);
      setSlips(payrollData);
      setEmployeeCount(empData.length);
      setAccounts(accData);
      setRecentVouchers(docData.slice(0, 8));

      if (accData.length > 0) {
        const defaultExp =
          accData.find((a) => a.code === '5020' || a.account_type === 'expense') || accData[0];
        const defaultBank =
          accData.find((a) => a.code === '1020' || a.code === '1010') || accData[0];
        setQpForm((prev) => ({
          ...prev,
          expense_account_id: prev.expense_account_id || defaultExp.id,
          paid_from_account_id: prev.paid_from_account_id || defaultBank.id,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load salary & payment workspace');
    } finally {
      setLoading(false);
    }
  }, [salaryMonth, user.permissions, canViewDocs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const totalGross = slips.reduce((s, x) => s + Number(x.gross_salary), 0);
    const totalBonusOt = slips.reduce((s, x) => s + Number(x.bonus_amount) + Number(x.overtime_pay), 0);
    const totalDed = slips.reduce((s, x) => s + Number(x.total_deductions), 0);
    const totalNet = slips.reduce((s, x) => s + Number(x.net_payable), 0);
    const paidNet = slips
      .filter((x) => x.status === 'paid')
      .reduce((s, x) => s + Number(x.net_payable), 0);
    const pendingSlips = slips.filter((x) => x.status !== 'paid');
    return {totalGross, totalBonusOt, totalDed, totalNet, paidNet, pendingSlips};
  }, [slips]);

  const handleGeneratePayroll = async () => {
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiRequest<SalaryPayment[]>('/hr/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({salary_month: salaryMonth, working_days: Number(workingDays || 26)}),
      });
      setSlips(updated);
      if (updated.length === 0) {
        setFeedback(
          bi(
            '0 active employees found. Please onboard employees in the HR & Attendance section first.',
            'কোনো সক্রিয় কর্মী পাওয়া যায়নি। অনুগ্রহ করে প্রথমে হাজিরা ও কর্মী বিভাগে কর্মী যুক্ত করুন।',
          ),
        );
      } else {
        setFeedback(
          bi(
            `Payroll sheet calculated from attendance for ${salaryMonth} (${updated.length} employees).`,
            `${salaryMonth} মাসের উপস্থিতি অনুযায়ী বেতন শীট প্রস্তুত করা হয়েছে (${updated.length} জন কর্মী)।`,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payroll calculation failed');
    }
  };

  const openAdjustment = (sp: SalaryPayment) => {
    setEditingSlip(sp);
    setAdjForm({
      bonus_amount: sp.bonus_amount,
      advance_deduction: sp.advance_deduction,
      tax_deduction: sp.tax_deduction,
      notes: sp.notes || '',
    });
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlip) return;
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<SalaryPayment>(`/hr/payroll/${editingSlip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          bonus_amount: Number(adjForm.bonus_amount || 0).toFixed(2),
          advance_deduction: Number(adjForm.advance_deduction || 0).toFixed(2),
          tax_deduction: Number(adjForm.tax_deduction || 0).toFixed(2),
          notes: adjForm.notes,
        }),
      });
      setEditingSlip(null);
      setFeedback(bi('Payslip bonus & deductions updated.', 'পে-স্লিপ বোনাস ও কর্তন হালনাগাদ হয়েছে।'));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed');
    }
  };

  const handlePaySingle = async (sp: SalaryPayment) => {
    setError(null);
    setFeedback(null);
    setBusyId(sp.id);
    try {
      const paid = await apiRequest<SalaryPayment>(`/hr/payroll/${sp.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          payment_date: paymentDate,
          payment_method: paymentMethod,
          payment_account_code: paymentAccountCode,
        }),
      });
      setFeedback(
        bi(
          `Disbursed BDT ${formatMoney(paid.net_payable)} to ${paid.full_name_en}. Auto-posted Double-Entry Journal & Payment Voucher.`,
          `${paid.full_name_en}-কে ${formatMoney(paid.net_payable)} টাকা পরিশোধ করা হয়েছে এবং স্বয়ংক্রিয় ভাউচার পোস্ট হয়েছে।`,
        ),
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salary disbursement failed');
    } finally {
      setBusyId(null);
    }
  };

  const handlePayAllPending = async () => {
    if (metrics.pendingSlips.length === 0) return;
    setError(null);
    setFeedback(null);
    try {
      for (const sp of metrics.pendingSlips) {
        await apiRequest<SalaryPayment>(`/hr/payroll/${sp.id}/pay`, {
          method: 'POST',
          body: JSON.stringify({
            payment_date: paymentDate,
            payment_method: paymentMethod,
            payment_account_code: paymentAccountCode,
          }),
        });
      }
      setFeedback(
        bi(
          `All ${metrics.pendingSlips.length} pending salaries disbursed and posted to General Ledger.`,
          `বাকি থাকা ${metrics.pendingSlips.length} জন কর্মীর বেতন পরিশোধ ও লেজারে পোস্ট সম্পন্ন হয়েছে।`,
        ),
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch salary disbursement encountered an error');
    }
  };

  const handleQuickPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{voucher_no: string; payment_voucher: BusinessDocument}>(
        '/hr/quick-payment',
        {
          method: 'POST',
          body: JSON.stringify({
            ...qpForm,
            expense_account_id: Number(qpForm.expense_account_id),
            paid_from_account_id: Number(qpForm.paid_from_account_id),
            amount: Number(qpForm.amount || 0).toFixed(2),
          }),
        },
      );
      setLastQuickVoucher(res.payment_voucher);
      setQpForm((prev) => ({
        ...prev,
        payee_name_en: '',
        payee_name_bn: '',
        amount: '',
        purpose_en: '',
        purpose_bn: '',
      }));
      setFeedback(
        bi(
          `Payment posted (${res.voucher_no}) and Payment Voucher ${res.payment_voucher.doc_number} is ready to print.`,
          `পেমেন্ট পোস্ট হয়েছে (${res.voucher_no}) এবং পেমেন্ট ভাউচার ${res.payment_voucher.doc_number} প্রিন্টের জন্য প্রস্তুত।`,
        ),
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick payment failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Emerald / Pine Monthly Payroll & Treasury Disbursements Header */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white">
        <img
          src={COMPANY_WORKSPACE_URL}
          alt="NEXTGEN TECHNIX LIMITED Payroll & Treasury"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-luminosity"
        />
        <div className="relative z-10 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <img
              src={company?.logo_url || COMPANY_LOGO_URL}
              alt="NEXTGEN TECHNIX LIMITED Emblem"
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-xl object-cover border-2 border-white/80 bg-white shrink-0"
            />
            <div>
              <div className="text-xs font-medium text-emerald-200">
                {bi(
                  'Payroll & Treasury Disbursements · Auto-Synced with General Ledger',
                  'মাসিক বেতন ও ট্রেজারি পরিশোধ · জেনারেল লেজারের সাথে স্বয়ংক্রিয় সমন্বিত',
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-0.5">
                {bi('Salary Disbursement & Expense Payment Desk', 'বেতন পরিশোধ ও তাৎক্ষণিক পেমেন্ট কেন্দ্র')}
              </h1>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl">
                {bi(
                  'Starts cleanly at BDT 0.00. Generates monthly payslips from staff attendance, posts double-entry accounting vouchers, and prints official Payslips & Payment Vouchers.',
                  '০.০০ টাকা হতে শুরু। উপস্থিতি অনুযায়ী বেতন গণনা, ডাবল-এন্ট্রি ভাউচার পোস্টিং এবং পে-স্লিপ ও পেমেন্ট ভাউচার প্রিন্ট।',
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-white/15 rounded-xl border border-white/20">
              <button
                type="button"
                onClick={() => setSubMode('payroll')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  subMode === 'payroll' ? 'bg-white text-emerald-950' : 'text-white hover:bg-white/10'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{bi('Monthly Salary Sheet', 'মাসিক বেতন শীট')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSubMode('quick_payment')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  subMode === 'quick_payment' ? 'bg-amber-400 text-slate-950' : 'text-white hover:bg-white/10'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>{bi('Quick Bill / Vendor Payment', 'তাৎক্ষণিক বিল ও পেমেন্ট')}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900">
          {error}
        </div>
      )}
      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
          {feedback}
        </div>
      )}

      {subMode === 'payroll' ? (
        <>
          {/* Summary Metric Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">
                {bi(`Gross Salary (${salaryMonth})`, `মোট মূল ও ভাতা (${salaryMonth})`)}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                BDT {formatMoney(metrics.totalGross)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {bi(`${slips.length} Payslips · ${employeeCount} Active Staff`, `${slips.length} টি স্লিপ · ${employeeCount} জন কর্মী`)}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">
                {bi('Overtime + Bonus — Deductions', 'ওভারটাইম ও বোনাস — কর্তন')}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                +{formatMoney(metrics.totalBonusOt)} / -{formatMoney(metrics.totalDed)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {bi('Synced from attendance logs', 'হাজিরা রেকর্ড হতে সমন্বিত')}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">
                {bi('Total Net Payable', 'সর্বমোট নিট প্রদেয় বেতন')}
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-950 mt-1">
                BDT {formatMoney(metrics.totalNet)}
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1 font-mono tabular-nums">
                {bi(`Disbursed: BDT ${formatMoney(metrics.paidNet)}`, `পরিশোধিত: ${formatMoney(metrics.paidNet)} টাকা`)}
              </div>
            </div>

            <div className="bg-white border border-emerald-200 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-emerald-800">
                  {bi('Master Salary Sheet Print', 'মাস্টার বেতন শীট প্রিন্ট')}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {bi(
                    `${metrics.pendingSlips.length} pending · ${slips.length - metrics.pendingSlips.length} paid`,
                    `${metrics.pendingSlips.length} বাকি · ${slips.length - metrics.pendingSlips.length} পরিশোধিত`,
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  disabled={slips.length === 0}
                  onClick={() => printColorfulHtml(buildMasterSalarySheetHtml(salaryMonth, slips, company))}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{bi('Print Sheet', 'প্রিন্ট শীট')}</span>
                </button>
                <button
                  type="button"
                  disabled={slips.length === 0}
                  onClick={() =>
                    downloadColorfulHtml(
                      buildMasterSalarySheetHtml(salaryMonth, slips, company),
                      `Master_Salary_Sheet_${salaryMonth}.html`,
                    )
                  }
                  title="Download Printable HTML"
                  className="p-2 text-emerald-800 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>

          {/* Payroll Control Bar */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Salary Month', 'বেতনের মাস')}
                </label>
                <input
                  type="month"
                  value={salaryMonth}
                  onChange={(e) => setSalaryMonth(e.target.value)}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Working Days', 'কর্মদিবস')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={workingDays}
                  onChange={(e) => setWorkingDays(Number(e.target.value))}
                  className="w-20 px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>

              {canManagePayroll && (
                <button
                  type="button"
                  onClick={handleGeneratePayroll}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg cursor-pointer"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>{bi('Generate / Recalculate from Attendance', 'উপস্থিতি হতে বেতন গণনা করুন')}</span>
                </button>
              )}
            </div>

            {canManagePayroll && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Disbursement Date', 'পরিশোধের তারিখ')}
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Paid From Account', 'প্রদানকারী হিসাব খাত')}
                  </label>
                  <select
                    value={paymentAccountCode}
                    onChange={(e) => setPaymentAccountCode(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="1020">1020 — Corporate Bank Account</option>
                    <option value="1010">1010 — Petty Cash in Hand</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Payment Mode', 'পরিশোধ মাধ্যম')}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Corporate Bank Transfer">Bank Transfer</option>
                    <option value="Cash Disbursement">Cash in Hand</option>
                    <option value="bKash / Nagad Corporate">bKash / Nagad</option>
                    <option value="Account Payee Cheque">Cheque</option>
                  </select>
                </div>

                {metrics.pendingSlips.length > 0 && (
                  <button
                    type="button"
                    onClick={handlePayAllPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {bi(
                        `Pay All Pending (${metrics.pendingSlips.length})`,
                        `সকল বকেয়া বেতন পরিশোধ (${metrics.pendingSlips.length})`,
                      )}
                    </span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Bonus / Advance / Tax Adjustment Editor */}
          {editingSlip && (
            <form
              onSubmit={handleSaveAdjustment}
              className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-emerald-950">
                  {bi(
                    `Adjust Bonus & Deductions — ${editingSlip.full_name_en} (${editingSlip.payslip_no})`,
                    `বোনাস ও কর্তন সমন্বয় — ${editingSlip.full_name_bn || editingSlip.full_name_en}`,
                  )}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingSlip(null)}
                  className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {bi('Close', 'বন্ধ করুন')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Bonus Amount (BDT)', 'বোনাস (টাকা)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjForm.bonus_amount}
                    onChange={(e) => setAdjForm({...adjForm, bonus_amount: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Advance Recovery (BDT)', 'অগ্রিম কর্তন (টাকা)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjForm.advance_deduction}
                    onChange={(e) => setAdjForm({...adjForm, advance_deduction: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Tax Deduction (BDT)', 'আয়কর কর্তন (টাকা)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjForm.tax_deduction}
                    onChange={(e) => setAdjForm({...adjForm, tax_deduction: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Payslip Note', 'মন্তব্য')}
                  </label>
                  <input
                    type="text"
                    value={adjForm.notes}
                    onChange={(e) => setAdjForm({...adjForm, notes: e.target.value})}
                    placeholder="e.g. Festival / Performance bonus"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSlip(null)}
                  className="px-3.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  {bi('Cancel', 'বাতিল')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-emerald-800 text-white rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  {bi('Save Payslip Adjustment', 'সমন্বয় সংরক্ষণ করুন')}
                </button>
              </div>
            </form>
          )}

          {/* Payslips Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {bi('Loading monthly salary sheet...', 'মাসিক বেতন শীট লোড হচ্ছে...')}
              </div>
            ) : slips.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="text-sm font-bold text-slate-900">
                  {bi(`0 Payslips Generated for ${salaryMonth}`, `${salaryMonth} মাসে ০ টি পে-স্লিপ প্রস্তুত`)}
                </div>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  {employeeCount === 0
                    ? bi(
                        'Your company starts at 0 employees and BDT 0.00 payroll liability. First onboard staff in HR & Attendance, then generate the monthly payroll sheet.',
                        'আপনার কোম্পানি বর্তমানে ০ জন কর্মী ও ০.০০ টাকা বেতন দায় হতে শুরু হয়েছে। প্রথমে হাজিরা ও কর্মী বিভাগে কর্মী যুক্ত করুন।',
                      )
                    : bi(
                        `You have ${employeeCount} active staff registered. Click "Generate / Recalculate from Attendance" above to prepare ${salaryMonth} payslips.`,
                        `${employeeCount} জন সক্রিয় কর্মী নিবন্ধিত আছেন। ${salaryMonth} মাসের পে-স্লিপ তৈরি করতে উপরের গণনা বাটনে ক্লিক করুন।`,
                      )}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-emerald-950 text-white">
                      <th className="py-3 px-4 font-semibold">{bi('Payslip', 'পে-স্লিপ নং')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Employee', 'কর্মীর নাম ও পদবি')}</th>
                      <th className="py-3 px-3 font-semibold text-center">{bi('Attendance', 'উপস্থিতি')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Gross', 'মোট বেতন')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('OT + Bonus', 'ওভারটাইম+বোনাস')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Deductions', 'কর্তন')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Net Payable', 'নিট প্রদেয়')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('State', 'অবস্থা')}</th>
                      <th className="py-3 px-4 font-semibold text-right">{bi('Pay & Print Actions', 'পরিশোধ ও প্রিন্ট')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {slips.map((sp) => (
                      <tr key={sp.id} className="hover:bg-emerald-50/40">
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-950 whitespace-nowrap">
                          {sp.payslip_no}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">
                            {bi(sp.full_name_en, sp.full_name_bn)} ·{' '}
                            <span className="font-mono text-slate-500">{sp.emp_code}</span>
                          </div>
                          <div className="text-slate-500">
                            {bi(sp.designation_en, sp.designation_bn)} · {sp.department}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono whitespace-nowrap text-slate-700">
                          P:{sp.present_days} · L:{sp.late_days} · A:{sp.absent_days}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {formatMoney(sp.gross_salary)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-teal-700 whitespace-nowrap">
                          +{formatMoney(Number(sp.overtime_pay) + Number(sp.bonus_amount))}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                          -{formatMoney(sp.total_deductions)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-950 whitespace-nowrap">
                          {formatMoney(sp.net_payable)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={
                              sp.status === 'paid' ? 'text-emerald-700 font-bold' : 'text-amber-700 font-semibold'
                            }
                          >
                            {sp.status === 'paid'
                              ? bi(`Paid (${sp.payment_date})`, `পরিশোধিত (${sp.payment_date})`)
                              : bi('Pending', 'অপরিশোধিত')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {sp.status !== 'paid' && canManagePayroll && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openAdjustment(sp)}
                                  title={bi('Adjust Bonus / Deduction', 'বোনাস বা কর্তন সমন্বয়')}
                                  className="p-1.5 text-slate-600 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === sp.id}
                                  onClick={() => handlePaySingle(sp)}
                                  className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-md cursor-pointer"
                                >
                                  {busyId === sp.id ? '...' : bi('Pay Now', 'বেতন দিন')}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => printColorfulHtml(buildSalaryPayslipHtml(sp, company))}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-md cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{bi('Payslip', 'পে-স্লিপ')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        /* SUB-MODE 2: QUICK EXPENSE / VENDOR PAYMENT & VOUCHER PRINTING */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleQuickPaymentSubmit}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {bi('Issue Instant Payment & Post Double-Entry Voucher', 'তাৎক্ষণিক বিল/খরচ পরিশোধ ও ভাউচার তৈরি')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {bi(
                  'Debits the selected Expense/Asset account, credits Cash/Bank, and issues a numbered Payment Voucher (PV).',
                  'ব্যয় খাতে ডেবিট ও ব্যাংক/নগদ খাতে ক্রেডিট করে স্বয়ংক্রিয়ভাবে পেমেন্ট ভাউচার প্রস্তুত করে।',
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Payment Date', 'পরিশোধের তারিখ')}
                </label>
                <input
                  type="date"
                  required
                  value={qpForm.payment_date}
                  onChange={(e) => setQpForm({...qpForm, payment_date: e.target.value})}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Payment Amount (BDT)', 'পরিমাণ (টাকা)')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  placeholder="0.00"
                  value={qpForm.amount}
                  onChange={(e) => setQpForm({...qpForm, amount: e.target.value})}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Payee / Vendor Name (EN)', 'প্রাপকের নাম (ইংরেজি)')}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cloud Hosting Provider / Utility Vendor"
                  value={qpForm.payee_name_en}
                  onChange={(e) => setQpForm({...qpForm, payee_name_en: e.target.value})}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Payee Name (Bangla)', 'প্রাপকের নাম (বাংলা)')}
                </label>
                <input
                  type="text"
                  placeholder="ঐচ্ছিক বাংলা নাম"
                  value={qpForm.payee_name_bn}
                  onChange={(e) => setQpForm({...qpForm, payee_name_bn: e.target.value})}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Debit Expense / Asset Account', 'খরচ / ডেবিট হিসাব খাত')}
                </label>
                <select
                  value={qpForm.expense_account_id}
                  onChange={(e) => setQpForm({...qpForm, expense_account_id: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {bi(a.name_en, a.name_bn)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Credit Cash / Bank Account', 'ব্যাংক বা নগদ প্রদানকারী খাত')}
                </label>
                <select
                  value={qpForm.paid_from_account_id}
                  onChange={(e) => setQpForm({...qpForm, paid_from_account_id: Number(e.target.value)})}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {bi(a.name_en, a.name_bn)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Payment Mode', 'পরিশোধ মাধ্যম')}
                </label>
                <select
                  value={qpForm.payment_method}
                  onChange={(e) => setQpForm({...qpForm, payment_method: e.target.value})}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Corporate Bank Transfer">Corporate Bank Transfer</option>
                  <option value="Petty Cash">Petty Cash</option>
                  <option value="bKash / Nagad Business">bKash / Nagad Business</option>
                  <option value="Account Payee Cheque">Account Payee Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Purpose / Particulars (EN)', 'পেমেন্টের বিবরণ (ইংরেজি)')}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Cloud Server & Fiber Bandwidth"
                  value={qpForm.purpose_en}
                  onChange={(e) => setQpForm({...qpForm, purpose_en: e.target.value})}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {lastQuickVoucher ? (
                <button
                  type="button"
                  onClick={() => printColorfulHtml(buildBusinessDocumentHtml(lastQuickVoucher, company))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {bi(
                      `Print Latest (${lastQuickVoucher.doc_number})`,
                      `সর্বশেষ ভাউচার প্রিন্ট (${lastQuickVoucher.doc_number})`,
                    )}
                  </span>
                </button>
              ) : (
                <span />
              )}

              {canManagePayroll && (
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{bi('Post Payment & Issue Voucher', 'পেমেন্ট পোস্ট ও ভাউচার তৈরি করুন')}</span>
                </button>
              )}
            </div>
          </form>

          {/* Recent Payment Vouchers */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">
              {bi('Recent Payment Vouchers (PV)', 'সাম্প্রতিক পেমেন্ট ভাউচারসমূহ')}
            </h2>

            {recentVouchers.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                {bi(
                  '0 Payment Vouchers issued yet. Post a salary disbursement or quick vendor payment to generate numbered vouchers.',
                  'এখনও কোনো পেমেন্ট ভাউচার ইস্যু করা হয়নি।',
                )}
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {recentVouchers.map((pv) => (
                  <div key={pv.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold text-emerald-950">
                        {pv.doc_number} · {pv.issue_date}
                      </div>
                      <div className="text-xs font-medium text-slate-800 truncate">{pv.party_name_en}</div>
                      <div className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                        {pv.currency} {formatMoney(pv.grand_total)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => printColorfulHtml(buildBusinessDocumentHtml(pv, company))}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg hover:bg-emerald-100 shrink-0 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>{bi('Print', 'প্রিন্ট')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
