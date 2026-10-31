import React, {useEffect, useMemo, useState} from 'react';
import {Edit3, Plus, Printer, RefreshCw, Search} from 'lucide-react';
import {apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {Account, AccountType, CompanyProfile, CurrentUser} from '../types';
import {buildChartOfAccountsHtml, printColorfulHtml} from '../utils/printEngine';

interface ChartOfAccountsTabProps {
  user: CurrentUser;
  company?: CompanyProfile | null;
}

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export function ChartOfAccountsTab({user, company}: ChartOfAccountsTabProps) {
  const {bi, t, accountTypeLabel} = useI18n();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | AccountType>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [confirmZeroReset, setConfirmZeroReset] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({
    name_en: '',
    name_bn: '',
    description_en: '',
    opening_debit: '0.00',
    opening_credit: '0.00',
  });
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [newAcc, setNewAcc] = useState({
    code: '',
    name_en: '',
    name_bn: '',
    account_type: 'asset' as AccountType,
    description_en: '',
    opening_debit: '0.00',
    opening_credit: '0.00',
  });

  const canManage = user.permissions.includes('accounts:manage');

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Account[]>('/accounts?include_inactive=true');
      setAccounts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Chart of Accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const countsByType = useMemo(() => {
    const map: Record<AccountType, number> = {
      asset: 0,
      liability: 0,
      equity: 0,
      revenue: 0,
      expense: 0,
    };
    for (const acc of accounts) {
      map[acc.account_type] = (map[acc.account_type] || 0) + 1;
    }
    return map;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== 'all' && a.account_type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.name_en.toLowerCase().includes(q) ||
        a.name_bn.toLowerCase().includes(q)
      );
    });
  }, [accounts, typeFilter, search]);

  const handleResetZeroOpening = async () => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/accounts/reset-opening-balances', {method: 'POST'});
      setConfirmZeroReset(false);
      setFeedback(
        bi(
          'All Chart of Accounts opening balances reset strictly to 0.00 BDT.',
          'সকল হিসাব খাতের প্রারম্ভিক জের (Opening Balance) ০.০০ টাকা করা হয়েছে।',
        ),
      );
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset opening balances');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<Account>('/accounts', {
        method: 'POST',
        body: JSON.stringify({
          ...newAcc,
          opening_debit: Number(newAcc.opening_debit || 0).toFixed(2),
          opening_credit: Number(newAcc.opening_credit || 0).toFixed(2),
        }),
      });
      setNewAcc({
        code: '',
        name_en: '',
        name_bn: '',
        account_type: 'asset',
        description_en: '',
        opening_debit: '0.00',
        opening_credit: '0.00',
      });
      setShowCreate(false);
      setFeedback(bi('Ledger account added to Chart of Accounts.', 'নতুন হিসাব খাত সফলভাবে যুক্ত হয়েছে।'));
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    }
  };

  const openEditAccount = (acc: Account) => {
    setEditingAcc(acc);
    setEditForm({
      name_en: acc.name_en,
      name_bn: acc.name_bn,
      description_en: acc.description_en,
      opening_debit: acc.opening_debit,
      opening_credit: acc.opening_credit,
    });
  };

  const handleSaveEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcc) return;
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<Account>(`/accounts/${editingAcc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name_en: editForm.name_en,
          name_bn: editForm.name_bn,
          description_en: editForm.description_en,
          opening_debit: Number(editForm.opening_debit || 0).toFixed(2),
          opening_credit: Number(editForm.opening_credit || 0).toFixed(2),
        }),
      });
      setEditingAcc(null);
      setFeedback(
        bi(
          `Updated ledger account ${editingAcc.code}.`,
          `হিসাব খাত ${editingAcc.code} হালনাগাদ করা হয়েছে।`,
        ),
      );
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account');
    }
  };

  const handleToggleActive = async (acc: Account) => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<Account>(`/accounts/${acc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({is_active: !acc.is_active}),
      });
      setFeedback(
        bi(
          `Account ${acc.code} ${!acc.is_active ? 'activated' : 'deactivated'}.`,
          `হিসাব খাত ${acc.code} ${!acc.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`,
        ),
      );
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cobalt / Sky 5-Category Account Taxonomy Header */}
      <section className="rounded-2xl bg-gradient-to-r from-sky-950 via-sky-900 to-blue-950 text-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="text-xs font-medium text-sky-300">
            {bi(
              '5-Class Accounting Taxonomy · Assets, Liabilities, Equity, Revenue & Expenses',
              '৫-শ্রেণির হিসাব কাঠামো · সম্পদ, দায়, মূলধন, আয় ও ব্যয়',
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {bi('Chart of Accounts (0.00 Initial Balances)', 'চার্ট অফ অ্যাকাউন্টস (প্রারম্ভিক জের = ০.০০)')}
          </h1>
          <p className="text-xs text-sky-100/90 max-w-2xl">
            {bi(
              'All 16 IT-company ledger accounts start cleanly at BDT 0.00. Add custom accounts or update opening balances anytime.',
              'সকল ১৬টি হিসাব খাত ০.০০ টাকা প্রারম্ভিক জের হতে শুরু। প্রয়োজন অনুযায়ী নতুন হিসাব খাত যুক্ত বা সম্পাদনা করুন।',
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={() => printColorfulHtml(buildChartOfAccountsHtml(filtered, company))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white text-sky-950 hover:bg-sky-50 rounded-xl cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t('printPdf')}</span>
          </button>

          {canManage && (
            <>
              {confirmZeroReset ? (
                <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={handleResetZeroOpening}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-400 text-slate-950 rounded-lg cursor-pointer"
                  >
                    {bi('Confirm 0.00', 'নিশ্চিত করুন')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmZeroReset(false)}
                    className="px-2.5 py-1.5 text-xs text-white hover:bg-white/10 rounded-lg cursor-pointer"
                  >
                    {t('cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmZeroReset(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{bi('Reset Opening = 0.00', 'প্রারম্ভিক জের ০.০০ করুন')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-sky-400 text-slate-950 rounded-xl hover:bg-sky-300 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{showCreate ? t('cancel') : bi('Add Ledger Account', 'নতুন হিসাব খাত')}</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* 5-Category Count Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ACCOUNT_TYPES.map((at) => {
          const selected = typeFilter === at;
          return (
            <button
              key={at}
              type="button"
              onClick={() => setTypeFilter(selected ? 'all' : at)}
              className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                selected
                  ? 'bg-sky-950 text-white border-sky-950'
                  : 'bg-white text-slate-900 border-slate-200 hover:border-sky-300'
              }`}
            >
              <div className={`text-xs font-medium ${selected ? 'text-sky-300' : 'text-slate-500'}`}>
                {accountTypeLabel(at)}
              </div>
              <div className="text-lg font-bold font-mono tabular-nums mt-0.5">{countsByType[at]}</div>
              <div className={`text-xs mt-0.5 ${selected ? 'text-sky-200' : 'text-slate-400'}`}>
                {['asset', 'expense'].includes(at)
                  ? bi('Normal: Debit', 'নরমাল: ডেবিট')
                  : bi('Normal: Credit', 'নরমাল: ক্রেডিট')}
              </div>
            </button>
          );
        })}
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

      {showCreate && canManage && (
        <form onSubmit={handleCreateAccount} className="bg-white border border-sky-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">
            {bi('Create New Ledger Account', 'নতুন লেজার হিসাব খাত তৈরি করুন')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Account Code (Unique)', 'হিসাব কোড (অনন্য)')}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 1030"
                value={newAcc.code}
                onChange={(e) => setNewAcc({...newAcc, code: e.target.value})}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Account Type', 'হিসাবের ধরন')}
              </label>
              <select
                value={newAcc.account_type}
                onChange={(e) => setNewAcc({...newAcc, account_type: e.target.value as AccountType})}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {ACCOUNT_TYPES.map((at) => (
                  <option key={at} value={at}>
                    {accountTypeLabel(at)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Opening Debit (BDT)', 'প্রারম্ভিক ডেবিট')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newAcc.opening_debit}
                onChange={(e) => setNewAcc({...newAcc, opening_debit: e.target.value, opening_credit: '0.00'})}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Opening Credit (BDT)', 'প্রারম্ভিক ক্রেডিট')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newAcc.opening_credit}
                onChange={(e) => setNewAcc({...newAcc, opening_credit: e.target.value, opening_debit: '0.00'})}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Account Name (English)', 'হিসাবের নাম (ইংরেজি)')}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. City Bank Corporate Current A/C"
                value={newAcc.name_en}
                onChange={(e) => setNewAcc({...newAcc, name_en: e.target.value})}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Account Name (Bangla)', 'হিসাবের নাম (বাংলা)')}
              </label>
              <input
                type="text"
                placeholder="যেমন: সিটি ব্যাংক চলতি হিসাব"
                value={newAcc.name_bn}
                onChange={(e) => setNewAcc({...newAcc, name_bn: e.target.value})}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Description', 'সংক্ষিপ্ত বিবরণ')}
              </label>
              <input
                type="text"
                value={newAcc.description_en}
                onChange={(e) => setNewAcc({...newAcc, description_en: e.target.value})}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-sky-900 text-white rounded-lg hover:bg-sky-950 cursor-pointer"
            >
              {bi('Save Account', 'হিসাব সংরক্ষণ করুন')}
            </button>
          </div>
        </form>
      )}

      {editingAcc && canManage && (
        <form onSubmit={handleSaveEditAccount} className="bg-sky-50/70 border border-sky-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-sky-950">
              {bi(
                `Edit Account ${editingAcc.code} — ${editingAcc.name_en}`,
                `হিসাব সম্পাদনা ${editingAcc.code} — ${editingAcc.name_bn || editingAcc.name_en}`,
              )}
            </h2>
            <button
              type="button"
              onClick={() => setEditingAcc(null)}
              className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {t('cancel')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Name (EN)</label>
              <input
                type="text"
                required
                value={editForm.name_en}
                onChange={(e) => setEditForm({...editForm, name_en: e.target.value})}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">নাম (বাংলা)</label>
              <input
                type="text"
                value={editForm.name_bn}
                onChange={(e) => setEditForm({...editForm, name_bn: e.target.value})}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Opening DR (BDT)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editForm.opening_debit}
                onChange={(e) => setEditForm({...editForm, opening_debit: e.target.value, opening_credit: '0.00'})}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Opening CR (BDT)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editForm.opening_credit}
                onChange={(e) => setEditForm({...editForm, opening_credit: e.target.value, opening_debit: '0.00'})}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingAcc(null)}
              className="px-3.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-sky-900 text-white rounded-lg hover:bg-sky-950 cursor-pointer"
            >
              {bi('Update Account', 'হালনাগাদ করুন')}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-sky-100/70 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              typeFilter === 'all' ? 'bg-sky-900 text-white' : 'text-sky-950 hover:bg-sky-200/60'
            }`}
          >
            {bi('All Accounts', 'সকল খাত')} ({accounts.length})
          </button>
          {ACCOUNT_TYPES.map((at) => (
            <button
              key={at}
              type="button"
              onClick={() => setTypeFilter(at)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                typeFilter === at ? 'bg-sky-900 text-white' : 'text-sky-950 hover:bg-sky-200/60'
              }`}
            >
              {accountTypeLabel(at)}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
          />
        </div>
      </div>

      {/* High-Density Chart of Accounts Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {bi('Loading Chart of Accounts...', 'চার্ট অফ অ্যাকাউন্টস লোড হচ্ছে...')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {bi('No matching ledger accounts found.', 'কোনো মিলযুক্ত হিসাব খাত পাওয়া যায়নি।')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-sky-950 text-xs text-white">
                  <th className="py-3 px-4 font-semibold">{bi('Code', 'কোড')}</th>
                  <th className="py-3 px-4 font-semibold">{bi('Account Title (EN / BN)', 'হিসাবের নাম')}</th>
                  <th className="py-3 px-4 font-semibold">{bi('Classification · Normal', 'শ্রেণি · নরমাল জের')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{bi('Opening DR', 'প্রারম্ভিক ডেবিট')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{bi('Opening CR', 'প্রারম্ভিক ক্রেডিট')}</th>
                  <th className="py-3 px-4 font-semibold">{bi('State', 'অবস্থা')}</th>
                  {canManage && <th className="py-3 px-4 font-semibold text-right">{bi('Control', 'নিয়ন্ত্রণ')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((acc) => (
                  <tr key={acc.id} className={`hover:bg-sky-50/40 ${!acc.is_active ? 'opacity-60' : ''}`}>
                    <td className="py-2.5 px-4 font-mono text-xs font-bold text-sky-950 whitespace-nowrap">
                      {acc.code}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{bi(acc.name_en, acc.name_bn)}</div>
                      <div className="text-xs text-slate-500">
                        {acc.name_bn && acc.name_en ? `${acc.name_en} · ${acc.name_bn}` : acc.description_en}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      <span>{accountTypeLabel(acc.account_type)}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono font-semibold text-sky-900">{acc.normal_balance}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-800 whitespace-nowrap">
                      {formatMoney(acc.opening_debit)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-800 whitespace-nowrap">
                      {formatMoney(acc.opening_credit)}
                    </td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                      <span className={acc.is_active ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                        {acc.is_active ? bi('Active', 'সক্রিয়') : bi('Inactive', 'নিষ্ক্রিয়')}
                      </span>
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditAccount(acc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{bi('Edit', 'সম্পাদনা')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(acc)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            {acc.is_active ? bi('Deactivate', 'নিষ্ক্রিয়') : bi('Activate', 'সক্রিয়')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
