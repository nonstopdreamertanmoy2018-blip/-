import React, {useEffect, useMemo, useState} from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Plus,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {Account, CompanyProfile, CurrentUser, JournalEntry} from '../types';
import {buildJournalVoucherHtml, printColorfulHtml} from '../utils/printEngine';

interface JournalsTabProps {
  user: CurrentUser;
  company?: CompanyProfile | null;
}

interface DraftLine {
  account_id: number;
  description: string;
  debit: string;
  credit: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function JournalsTab({user, company}: JournalsTabProps) {
  const {bi, t} = useI18n();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [entryDate, setEntryDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    {account_id: 0, description: '', debit: '0.00', credit: '0.00'},
    {account_id: 0, description: '', debit: '0.00', credit: '0.00'},
  ]);

  const canCreate = user.permissions.includes('journals:create');
  const canApprove = user.permissions.includes('journals:approve');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jRes, aRes] = await Promise.all([
        apiRequest<JournalEntry[]>('/journals'),
        apiRequest<Account[]>('/accounts?include_inactive=false'),
      ]);
      setJournals(jRes);
      setAccounts(aRes);
      if (aRes.length >= 2 && lines[0].account_id === 0) {
        const bankAcc = aRes.find((a) => a.code === '1020') || aRes[0];
        const equityOrRev = aRes.find((a) => a.code === '3010' || a.code === '4010') || aRes[1];
        setLines([
          {account_id: bankAcc.id, description: '', debit: '0.00', credit: '0.00'},
          {account_id: equityOrRev.id, description: '', debit: '0.00', credit: '0.00'},
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filteredJournals = useMemo(() => {
    if (statusFilter === 'all') return journals;
    return journals.filter((j) => j.status === statusFilter);
  }, [journals, statusFilter]);

  const composerTotals = useMemo(() => {
    const drCents = lines.reduce((acc, l) => acc + Math.round(Number(l.debit || 0) * 100), 0);
    const crCents = lines.reduce((acc, l) => acc + Math.round(Number(l.credit || 0) * 100), 0);
    const diffCents = Math.abs(drCents - crCents);
    return {
      dr: (drCents / 100).toFixed(2),
      cr: (crCents / 100).toFixed(2),
      diff: (diffCents / 100).toFixed(2),
      balanced: drCents > 0 && drCents === crCents,
    };
  }, [lines]);

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = {...item, ...patch};
        if (patch.debit !== undefined && Number(patch.debit) > 0) {
          next.credit = '0.00';
        }
        if (patch.credit !== undefined && Number(patch.credit) > 0) {
          next.debit = '0.00';
        }
        return next;
      }),
    );
  };

  const submitComposer = async (workflowAction: 'draft' | 'submit' | 'direct_post') => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<JournalEntry>('/journals', {
        method: 'POST',
        body: JSON.stringify({
          entry_date: entryDate,
          memo,
          reference,
          workflow_action: workflowAction,
          lines: lines.map((l) => ({
            account_id: Number(l.account_id),
            description: l.description,
            debit: Number(l.debit || 0).toFixed(2),
            credit: Number(l.credit || 0).toFixed(2),
          })),
        }),
      });
      setMemo('');
      setReference('');
      setLines((prev) => prev.map((l) => ({...l, description: '', debit: '0.00', credit: '0.00'})));
      setShowComposer(false);
      setFeedback(
        workflowAction === 'draft'
          ? bi('Journal saved as draft.', 'জার্নাল খসড়া হিসেবে সংরক্ষিত হয়েছে।')
          : workflowAction === 'submit'
            ? bi('Journal submitted for approval.', 'জার্নাল অনুমোদনের জন্য জমা দেওয়া হয়েছে।')
            : bi('Journal approved and posted directly to General Ledger.', 'জার্নাল সরাসরি জেনারেল লেজারে পোস্ট হয়েছে।'),
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save journal');
    }
  };

  const handleAction = async (id: number, action: 'submit' | 'approve' | 'reverse') => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest(`/journals/${id}/${action}`, {method: 'POST'});
      setFeedback(bi(`Journal ${action} completed.`, `জার্নাল কার্যক্রম (${action}) সম্পন্ন হয়েছে।`));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Journal workflow action failed');
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId) return;
    setError(null);
    try {
      await apiRequest(`/journals/${rejectingId}/reject`, {
        method: 'POST',
        body: JSON.stringify({reason: rejectReason}),
      });
      setRejectingId(null);
      setRejectReason('');
      setFeedback(bi('Journal rejected with audit note.', 'কারণ উল্লেখসহ জার্নাল প্রত্যাখ্যান করা হয়েছে।'));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject journal');
    }
  };

  const statusLabel = (s: JournalEntry['status']) => {
    switch (s) {
      case 'draft':
        return t('status_draft');
      case 'pending_approval':
        return t('status_pending_approval');
      case 'posted':
        return t('status_posted');
      case 'rejected':
        return t('status_rejected');
      case 'reversed':
        return t('status_reversed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Indigo Double-Entry Accounting Voucher Pad Header */}
      <section className="rounded-2xl bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-indigo-300">
            {bi(
              'Double-Entry Accounting Engine · Maker-Checker Approval Workflow',
              'ডাবল-এন্ট্রি ভাউচার ইঞ্জিন · প্রস্তুতকারক ও অনুমোদন প্রবাহ',
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {bi('Journal Vouchers & Ledger Posting', 'জার্নাল ভাউচার ও লেজার পোস্টিং')}
          </h1>
          <p className="text-xs text-indigo-100/90 max-w-2xl">
            {bi(
              'Starts at 0 vouchers. Every entry strictly enforces Total Debit = Total Credit > 0.00 before General Ledger posting.',
              'শূন্য (০) ভাউচার হতে শুরু। প্রতিটি ভাউচারে মোট ডেবিট = মোট ক্রেডিট > ০.০০ নিশ্চিত করে লেজারে পোস্ট করা হয়।',
            )}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setShowComposer((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-white text-indigo-950 rounded-xl hover:bg-indigo-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{showComposer ? t('cancel') : bi('New Journal Voucher', 'নতুন জার্নাল ভাউচার')}</span>
          </button>
        )}
      </section>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}
      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium">
          {feedback}
        </div>
      )}

      {/* Multi-line Journal Voucher Composer */}
      {showComposer && canCreate && (
        <section className="bg-white border border-indigo-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-indigo-950">
              {bi('Prepare Double-Entry Voucher', 'ডাবল-এন্ট্রি জার্নাল ভাউচার প্রস্তুত করুন')}
            </h2>
            <div className="text-xs font-mono tabular-nums">
              <span className={composerTotals.balanced ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                DR {formatMoney(composerTotals.dr)} · CR {formatMoney(composerTotals.cr)} ·{' '}
                {composerTotals.balanced
                  ? t('balanced')
                  : `${bi('Difference', 'পার্থক্য')}: ${formatMoney(composerTotals.diff)}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Entry Date', 'ভাউচারের তারিখ')}
              </label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Reference / Doc No', 'সূত্র / নথি নং')}
              </label>
              <input
                type="text"
                placeholder="e.g. CAP-001 / INV-0001"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Narration / Memo', 'ব্যাখ্যা / বিবরণ')}
              </label>
              <input
                type="text"
                required
                placeholder={bi('Describe the business transaction clearly...', 'লেনদেনের সুস্পষ্ট বিবরণ লিখুন...')}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="overflow-x-auto border-t border-slate-200 pt-4">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">{bi('Ledger Account', 'হিসাব খাত')}</th>
                  <th className="py-2 px-3 font-medium">{bi('Line Note', 'লাইন নোট')}</th>
                  <th className="py-2 px-3 font-medium text-right w-36">{t('debit')}</th>
                  <th className="py-2 px-3 font-medium text-right w-36">{t('credit')}</th>
                  <th className="py-2 pl-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-3">
                      <select
                        value={line.account_id}
                        onChange={(e) => updateLine(idx, {account_id: Number(e.target.value)})}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value={0}>-- {bi('Select Account', 'হিসাব নির্বাচন করুন')} --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {bi(a.name_en, a.name_bn)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(idx, {description: e.target.value})}
                        placeholder={bi('Optional line note', 'ঐচ্ছিক নোট')}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debit}
                        onChange={(e) => updateLine(idx, {debit: e.target.value})}
                        className="w-full px-2.5 py-2 text-xs text-right font-mono tabular-nums border border-slate-300 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.credit}
                        onChange={(e) => updateLine(idx, {credit: e.target.value})}
                        className="w-full px-2.5 py-2 text-xs text-right font-mono tabular-nums border border-slate-300 rounded-lg"
                      />
                    </td>
                    <td className="py-2 pl-2 text-right">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove journal line"
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {account_id: accounts[0]?.id || 0, description: '', debit: '0.00', credit: '0.00'},
                ])
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{bi('Add Journal Line', 'নতুন লাইন যুক্ত করুন')}</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!composerTotals.balanced || !memo.trim()}
                onClick={() => submitComposer('draft')}
                className="px-3.5 py-2 text-xs font-medium text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {bi('Save as Draft', 'খসড়া সংরক্ষণ')}
              </button>
              <button
                type="button"
                disabled={!composerTotals.balanced || !memo.trim()}
                onClick={() => submitComposer('submit')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{bi('Submit for Approval', 'অনুমোদনের জন্য জমা')}</span>
              </button>
              {canApprove && (
                <button
                  type="button"
                  disabled={!composerTotals.balanced || !memo.trim()}
                  onClick={() => submitComposer('direct_post')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{bi('Approve & Post Immediately', 'অনুমোদন ও সরাসরি পোস্ট')}</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Reject Reason Inline Bar */}
      {rejectingId !== null && (
        <form onSubmit={handleReject} className="bg-white border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            required
            minLength={3}
            placeholder={bi('Enter rejection reason for audit trail...', 'প্রত্যাখ্যানের কারণ উল্লেখ করুন...')}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="flex-1 w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setRejectingId(null);
                setRejectReason('');
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-3.5 py-2 text-xs font-semibold bg-rose-700 text-white rounded-lg hover:bg-rose-800 cursor-pointer"
            >
              {bi('Confirm Rejection', 'প্রত্যাখ্যান নিশ্চিত করুন')}
            </button>
          </div>
        </form>
      )}

      {/* Segmented Workflow Filter */}
      <div className="flex items-center gap-1 p-1 bg-indigo-100/70 rounded-lg w-fit overflow-x-auto max-w-full">
        {[
          {k: 'all', label: `${bi('All Vouchers', 'সকল ভাউচার')} (${journals.length})`},
          {k: 'pending_approval', label: t('status_pending_approval')},
          {k: 'draft', label: t('status_draft')},
          {k: 'posted', label: t('status_posted')},
          {k: 'rejected', label: t('status_rejected')},
        ].map((tab) => (
          <button
            key={tab.k}
            type="button"
            onClick={() => setStatusFilter(tab.k)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              statusFilter === tab.k ? 'bg-indigo-800 text-white' : 'text-indigo-950 hover:bg-indigo-200/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Journals Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {bi('Loading journal vouchers...', 'জার্নাল ভাউচার লোড হচ্ছে...')}
          </div>
        ) : filteredJournals.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="text-sm font-bold text-slate-900">
              {journals.length === 0
                ? bi('0 Journal Vouchers Recorded Yet', 'এখনও কোনো জার্নাল ভাউচার পোস্ট করা হয়নি (০)')
                : bi('No journal vouchers match the selected workflow state.', 'নির্বাচিত অবস্থায় কোনো জার্নাল ভাউচার নেই।')}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {bi(
                'Record capital injections, client receipts, operating expenses, or accounting adjustments using balanced double-entry vouchers.',
                'মূলধন জমা, গ্রাহক প্রাপ্তি, অফিস খরচ বা সমন্বয় এন্ট্রি রেকর্ড করতে নতুন জার্নাল ভাউচার তৈরি করুন।',
              )}
            </p>
            {journals.length === 0 && canCreate && !showComposer && (
              <button
                type="button"
                onClick={() => setShowComposer(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-800 hover:bg-indigo-900 text-white rounded-lg cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>{bi('Prepare First Journal Voucher', 'প্রথম জার্নাল ভাউচার তৈরি করুন')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-indigo-950 text-xs text-white">
                  <th className="py-3 pl-4 pr-2 w-8"></th>
                  <th className="py-3 px-3 font-semibold">{bi('Voucher', 'ভাউচার নং')}</th>
                  <th className="py-3 px-3 font-semibold">{bi('Date', 'তারিখ')}</th>
                  <th className="py-3 px-3 font-semibold">{bi('Memo & Audit Trail', 'বিবরণ ও অডিট তথ্য')}</th>
                  <th className="py-3 px-3 font-semibold">{bi('Workflow State', 'অবস্থা')}</th>
                  <th className="py-3 px-3 font-semibold text-right">{bi('Total DR / CR', 'মোট ডেবিট / ক্রেডিট')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{bi('Actions & Print', 'কার্যক্রম ও প্রিন্ট')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredJournals.map((j) => {
                  const isOpen = expandedId === j.id;
                  return (
                    <React.Fragment key={j.id}>
                      <tr className="hover:bg-indigo-50/40">
                        <td className="py-3 pl-4 pr-2">
                          <button
                            type="button"
                            onClick={() => setExpandedId(isOpen ? null : j.id)}
                            aria-label="Toggle voucher lines"
                            className="p-1 text-slate-500 hover:text-indigo-900 cursor-pointer"
                          >
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs font-bold text-indigo-950 whitespace-nowrap">
                          {j.voucher_no || `JV-${j.id}`}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {j.entry_date}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-900">{j.memo}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {bi('Prepared by', 'প্রস্তুতকারক')}: {j.created_by_username || `#${j.created_by}`}
                            {j.reference ? ` · Ref: ${j.reference}` : ''}
                            {j.approved_by_username ? ` · ${bi('Approved by', 'অনুমোদনকারী')}: ${j.approved_by_username}` : ''}
                            {j.rejection_reason ? ` · ${bi('Rejected', 'কারণ')}: ${j.rejection_reason}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">
                          <span
                            className={
                              j.status === 'posted'
                                ? 'text-emerald-700 font-bold'
                                : j.status === 'pending_approval'
                                  ? 'text-amber-700 font-semibold'
                                  : j.status === 'rejected'
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-slate-600 font-medium'
                            }
                          >
                            {statusLabel(j.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-bold text-slate-900 whitespace-nowrap">
                          {formatMoney(j.total_debit)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {(j.status === 'draft' || j.status === 'rejected') && canCreate && (
                              <button
                                type="button"
                                onClick={() => handleAction(j.id, 'submit')}
                                className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                              >
                                {bi('Submit', 'জমা দিন')}
                              </button>
                            )}
                            {j.status === 'pending_approval' && canApprove && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAction(j.id, 'approve')}
                                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800 cursor-pointer"
                                >
                                  {bi('Approve', 'অনুমোদন')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingId(j.id)}
                                  className="p-1 text-xs text-rose-700 border border-rose-200 rounded-md hover:bg-rose-50 cursor-pointer"
                                  title={bi('Reject', 'প্রত্যাখ্যান')}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {j.status === 'posted' && canApprove && (
                              <button
                                type="button"
                                onClick={() => handleAction(j.id, 'reverse')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{bi('Reverse', 'রিভার্স')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => printColorfulHtml(buildJournalVoucherHtml(j, company))}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-indigo-700 hover:bg-indigo-800 text-white rounded-md cursor-pointer"
                            >
                              <Printer className="w-3 h-3" />
                              <span>{bi('Print', 'প্রিন্ট')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-indigo-50/40">
                          <td colSpan={7} className="px-8 py-4">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 border-b border-slate-200">
                                  <th className="py-1.5 text-left font-medium">{bi('Account', 'হিসাব খাত')}</th>
                                  <th className="py-1.5 text-left font-medium">{bi('Description', 'বিবরণ')}</th>
                                  <th className="py-1.5 text-right font-medium">{t('debit')}</th>
                                  <th className="py-1.5 text-right font-medium">{t('credit')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/60">
                                {j.lines.map((ln) => (
                                  <tr key={ln.id}>
                                    <td className="py-2 font-medium text-slate-800">
                                      <span className="font-mono font-bold text-indigo-900">{ln.account_code}</span> — {bi(ln.account_name_en, ln.account_name_bn)}
                                    </td>
                                    <td className="py-2 text-slate-600">{ln.description || '—'}</td>
                                    <td className="py-2 text-right font-mono tabular-nums text-slate-900">
                                      {Number(ln.debit) > 0 ? formatMoney(ln.debit) : '0.00'}
                                    </td>
                                    <td className="py-2 text-right font-mono tabular-nums text-slate-900">
                                      {Number(ln.credit) > 0 ? formatMoney(ln.credit) : '0.00'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
