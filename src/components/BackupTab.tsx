import React, {useCallback, useEffect, useState} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {apiDownloadFile, apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {BackupSnapshot, BackupStatus, CurrentUser} from '../types';

interface BackupTabProps {
  user: CurrentUser;
}

export function BackupTab({user}: BackupTabProps) {
  const {bi} = useI18n();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null);
  const [resetPhrase, setResetPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canManageBackup = user.permissions.includes('backup:manage');
  const canManageAccounts = user.permissions.includes('accounts:manage');
  const canFactoryReset =
    user.permissions.includes('backup:manage') && user.permissions.includes('users:manage');

  const loadStatus = useCallback(async () => {
    if (!canManageBackup) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<BackupStatus>('/backup/status');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backup status');
    } finally {
      setLoading(false);
    }
  }, [canManageBackup]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleCreateServerSnapshot = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const snap = await apiRequest<BackupSnapshot>('/backup/snapshots', {method: 'POST'});
      setFeedback(
        bi(
          `Created server backup snapshot ${snap.filename} (SHA-256 verified).`,
          `সার্ভার ব্যাকআপ স্ন্যাপশট ${snap.filename} সফলভাবে তৈরি হয়েছে।`,
        ),
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Snapshot creation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadJson = async () => {
    setError(null);
    try {
      await apiDownloadFile('/backup/export-json', 'NextGen_Technix_ERP_Backup.json');
      setFeedback(bi('Full JSON backup downloaded to your computer.', 'পূর্ণাঙ্গ JSON ব্যাকআপ ডাউনলোড হয়েছে।'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON export failed');
    }
  };

  const handleDownloadSqlite = async () => {
    setError(null);
    try {
      await apiDownloadFile('/backup/export-sqlite', 'NextGen_Technix_ERP_Database_Backup.db');
      setFeedback(
        bi('Consistent SQLite (.db) database file downloaded.', 'এসকিউএললাইট (.db) ব্যাকআপ ফাইল ডাউনলোড হয়েছে।'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SQLite file export failed');
    }
  };

  const handleResetOpeningBalancesZero = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/accounts/reset-opening-balances', {method: 'POST'});
      setFeedback(
        bi(
          'All Chart of Accounts opening balances have been set strictly to 0.00 BDT.',
          'সকল হিসাব খাতের প্রারম্ভিক জের (Opening Balance) ০.০০ টাকা করা হয়েছে।',
        ),
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset opening balances');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (filename: string) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/backup/restore', {
        method: 'POST',
        body: JSON.stringify({snapshot_filename: filename}),
      });
      setConfirmRestoreFile(null);
      setFeedback(
        bi(
          `Database restored atomically from ${filename} with SHA-256 verification.`,
          `${filename} হতে ডাটাবেস সফলভাবে পুনরুদ্ধার (Restore) করা হয়েছে।`,
        ),
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadJsonRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await apiRequest('/backup/restore', {
        method: 'POST',
        body: JSON.stringify({backup_data: parsed}),
      });
      setFeedback(
        bi(
          `Uploaded backup file "${file.name}" verified (SHA-256) and restored cleanly.`,
          `আপলোডকৃত "${file.name}" ফাইল যাচাইপূর্বক ডাটাবেস রিস্টোর সম্পন্ন হয়েছে।`,
        ),
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uploaded backup file is invalid or failed checksum verification');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleFactoryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetPhrase.trim() !== 'RESET') return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiRequest('/backup/factory-reset', {
        method: 'POST',
        body: JSON.stringify({confirm_text: 'RESET'}),
      });
      setResetPhrase('');
      setFeedback(
        bi(
          'Factory Zero-Reset complete: all operational journals, projects, employees, attendance, payroll, and documents are reset to 0 while preserving Company Profile & User Accounts.',
          'ফ্যাক্টরি শূন্য-রিসেট সম্পন্ন: কোম্পানি প্রোফাইল ও ব্যবহারকারী অ্যাকাউন্ট অক্ষুণ্ন রেখে সকল লেনদেন, কর্মী, হাজিরা ও নথি ০-তে রিসেট করা হয়েছে।',
        ),
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Factory reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (!canManageBackup) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
        {bi(
          'Database Backup & Recovery requires the backup:manage permission (Administrator / Accountant).',
          'ব্যাকআপ ও রিস্টোর ব্যবহারের জন্য প্রশাসক বা অনুমোদিত অনুমতি প্রয়োজন।',
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cyan / Slate Data Vault Header */}
      <section className="rounded-2xl bg-gradient-to-r from-cyan-950 via-slate-900 to-cyan-900 text-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-xs font-medium text-cyan-300">
            {bi(
              'Enterprise Data Vault · SHA-256 Verified Snapshots & Zero-Balance Controls',
              'এন্টারপ্রাইজ ডাটা ভল্ট · SHA-256 যাচাইকৃত ব্যাকআপ ও শূন্য প্রারম্ভিক জের নিয়ন্ত্রণ',
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {bi('Database Backup, Restore & Zero-State Management', 'ডাটাবেস ব্যাকআপ, রিস্টোর ও শূন্য-জের ব্যবস্থাপনা')}
          </h1>
          <p className="text-xs text-cyan-100/90 max-w-2xl">
            {bi(
              'Create instant server snapshots, download full JSON or SQLite (.db) backups to your computer, or reset operational records cleanly to 0.00.',
              'সার্ভার স্ন্যাপশট তৈরি করুন, কম্পিউটারে JSON বা SQLite (.db) ফাইল ডাউনলোড করুন এবং নিরাপদে রিস্টোর করুন।',
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={handleCreateServerSnapshot}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl cursor-pointer"
          >
            <Database className="w-4 h-4" />
            <span>{bi('Create Server Snapshot', 'সার্ভার স্ন্যাপশট নিন')}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-white text-slate-950 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{bi('Download JSON Backup', 'JSON ব্যাকআপ ডাউনলোড')}</span>
          </button>

          {status?.database_dialect.includes('SQLite') && (
            <button
              type="button"
              onClick={handleDownloadSqlite}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-xl cursor-pointer"
            >
              <HardDriveDownload className="w-4 h-4" />
              <span>{bi('Download SQLite (.db)', 'SQLite (.db) ডাউনলোড')}</span>
            </button>
          )}
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

      {loading || !status ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          {bi('Inspecting database engine & backup vault...', 'ডাটাবেস ও ব্যাকআপ ভল্ট পরীক্ষা করা হচ্ছে...')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <section className="lg:col-span-5 bg-white border border-emerald-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{bi('Opening Balance Policy', 'প্রারম্ভিক জের নীতি')}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  {status.opening_balance_is_zero
                    ? bi('Opening Balance = 0.00 BDT (Verified)', 'সকল খাতের প্রারম্ভিক জের = ০.০০ টাকা (যাচাইকৃত)')
                    : bi('Custom Opening Balance Active', 'কাস্টম প্রারম্ভিক জের সক্রিয়')}
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed font-mono tabular-nums">
                  {bi(
                    `Opening DR: BDT ${formatMoney(status.opening_debit_total)} · Opening CR: BDT ${formatMoney(status.opening_credit_total)}`,
                    `প্রারম্ভিক ডেবিট: ${formatMoney(status.opening_debit_total)} টাকা · প্রারম্ভিক ক্রেডিট: ${formatMoney(status.opening_credit_total)} টাকা`,
                  )}
                </p>
              </div>

              {canManageAccounts && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResetOpeningBalancesZero}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer w-fit"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{bi('Set All Opening Balances to 0.00', 'সকল প্রারম্ভিক জের ০.০০ করুন')}</span>
                </button>
              )}
            </section>

            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {bi(`Live Database Record Counts (${status.database_dialect})`, `ডাটাবেস টেবিল রেকর্ড সংখ্যা (${status.database_dialect})`)}
                </h2>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-cyan-50 text-cyan-900 border border-cyan-200 rounded-lg hover:bg-cyan-100 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{bi('Restore from JSON File', 'JSON ফাইল হতে রিস্টোর')}</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleUploadJsonRestore}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(status.table_counts).map(([key, count]) => (
                  <div key={key} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500 capitalize">{key.replace(/_/g, ' ')}</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">{count}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Server Snapshot Vault Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {bi('Server Backup Snapshots (SHA-256 Verified)', 'সার্ভার ব্যাকআপ স্ন্যাপশট তালিকা')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {bi(
                    'Stores Company Profile, Projects, Employees, Attendance, Salary Slips, Chart of Accounts, Journals, and Documents.',
                    'কোম্পানি প্রোফাইল, প্রজেক্ট, কর্মী, উপস্থিতি, বেতন স্লিপ, হিসাব খাত, জার্নাল ও নথি সংরক্ষিত থাকে।',
                  )}
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-cyan-800" />
            </div>

            {status.snapshots.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {bi(
                  'No server snapshots saved yet. Click "Create Server Snapshot" above to create a restore point.',
                  'এখনও কোনো সার্ভার স্ন্যাপশট তৈরি হয়নি। উপরের "সার্ভার স্ন্যাপশট নিন" বাটনে ক্লিক করুন।',
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-3 px-4 font-semibold">{bi('Snapshot Filename', 'ফাইলের নাম')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Created (UTC)', 'তৈরির সময়')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Size', 'আকার')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('SHA-256 Integrity Hash', 'SHA-256 হ্যাশ')}</th>
                      <th className="py-3 px-4 font-semibold text-right">{bi('Recovery Action', 'পুনরুদ্ধার')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {status.snapshots.map((snap) => (
                      <tr key={snap.filename} className="hover:bg-cyan-50/40">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">{snap.filename}</td>
                        <td className="py-3 px-3 font-mono text-slate-600">
                          {snap.created_at.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                          {(snap.size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500 truncate max-w-52">
                          {snap.sha256.slice(0, 20)}...
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {confirmRestoreFile === snap.filename ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRestoreSnapshot(snap.filename)}
                                className="px-2.5 py-1 text-xs font-semibold bg-rose-700 text-white rounded-md hover:bg-rose-800 cursor-pointer"
                              >
                                {bi('Confirm Restore', 'রিস্টোর নিশ্চিত করুন')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreFile(null)}
                                className="px-2 py-1 text-xs border border-slate-300 rounded-md cursor-pointer"
                              >
                                {bi('Cancel', 'বাতিল')}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRestoreFile(snap.filename)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cyan-900 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{bi('Restore Snapshot', 'রিস্টোর করুন')}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Safeguarded Administrator Factory Zero-Reset */}
          {canFactoryReset && (
            <section className="bg-white border border-rose-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-slate-900">
                    {bi(
                      'Administrator Factory Zero-Reset (Start Fresh from 0.00)',
                      'প্রশাসক ফ্যাক্টরি শূন্য-রিসেট (সকল লেনদেন ০.০০ থেকে নতুন শুরু)',
                    )}
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {bi(
                      'Clears all operational transactions (Journals, Projects, Employees, Attendance, Payroll Slips, and Issued Documents) back to 0 and resets all Chart of Accounts opening balances to 0.00 BDT while keeping your Company Profile, Role Permissions, and User Logins intact.',
                      'কোম্পানি প্রোফাইল, রোল পারমিশন এবং ইউজার লগইন অক্ষুণ্ন রেখে সকল জার্নাল, প্রজেক্ট, কর্মী, হাজিরা, বেতন স্লিপ ও নথি মুছে সম্পূর্ণ ০.০০ জের হতে নতুনভাবে প্রস্তুত করে।',
                    )}
                  </p>
                </div>
              </div>

              <form onSubmit={handleFactoryReset} className="flex flex-wrap items-center gap-3 pt-1">
                <input
                  type="text"
                  value={resetPhrase}
                  onChange={(e) => setResetPhrase(e.target.value)}
                  placeholder={bi('Type RESET to unlock', 'নিশ্চিত করতে RESET লিখুন')}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg w-52"
                />
                <button
                  type="submit"
                  disabled={busy || resetPhrase.trim() !== 'RESET'}
                  className="px-4 py-2 text-xs font-semibold bg-rose-700 hover:bg-rose-800 disabled:opacity-40 text-white rounded-lg cursor-pointer"
                >
                  {bi('Reset All Operational Data to 0.00', 'সকল অপারেশনাল ডাটা ০.০০ করুন')}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
