import React, {useEffect, useState} from 'react';
import {KeyRound, Lock, Plus, Save, Shield, UserCheck, UserX} from 'lucide-react';
import {apiRequest} from '../api';
import {useI18n} from '../i18n';
import {
  AuditLog,
  CurrentUser,
  PermissionMatrixResponse,
  RoleKey,
  UserRecord,
} from '../types';

interface UsersAndPermissionsTabProps {
  currentUser: CurrentUser;
  onPermissionsChanged: () => void;
}

const ALL_ROLES: RoleKey[] = ['admin', 'accountant', 'hr', 'project_manager', 'sales', 'employee'];

export function UsersAndPermissionsTab({
  currentUser,
  onPermissionsChanged,
}: UsersAndPermissionsTabProps) {
  const {bi, t, roleLabel} = useI18n();
  const canManageUsers = currentUser.permissions.includes('users:manage');
  const canManagePermissions = currentUser.permissions.includes('permissions:manage');

  const [subTab, setSubTab] = useState<'account' | 'users' | 'matrix' | 'audit'>(
    canManageUsers ? 'users' : 'account',
  );
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [matrixState, setMatrixState] = useState<PermissionMatrixResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingMatrix, setSavingMatrix] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Self-service password change state (for all 6 roles)
  const [pwForm, setPwForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [changingOwnPw, setChangingOwnPw] = useState(false);

  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    full_name_en: '',
    full_name_bn: '',
    email: '',
    role: 'employee' as RoleKey,
  });

  const loadGovernanceData = async () => {
    setError(null);
    try {
      const matrixPromise = apiRequest<PermissionMatrixResponse>('/permissions/matrix');
      const usersPromise = canManageUsers ? apiRequest<UserRecord[]>('/users') : Promise.resolve([]);
      const auditPromise = canManageUsers ? apiRequest<AuditLog[]>('/audit-logs?limit=40') : Promise.resolve([]);

      const [mData, uData, aData] = await Promise.all([matrixPromise, usersPromise, auditPromise]);
      setMatrixState(mData);
      setUsers(uData);
      setAuditLogs(aData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load governance records');
    }
  };

  useEffect(() => {
    if (!canManageUsers && (subTab === 'users' || subTab === 'audit')) {
      setSubTab('account');
    }
    loadGovernanceData();
  }, [currentUser.id, currentUser.role]);

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    if (pwForm.new_password !== pwForm.confirm_password) {
      setError(bi('New password and confirmation do not match.', 'নতুন পাসওয়ার্ড ও নিশ্চিতকরণ পাসওয়ার্ড মেলেনি।'));
      return;
    }
    setChangingOwnPw(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: pwForm.current_password,
          new_password: pwForm.new_password,
        }),
      });
      setPwForm({current_password: '', new_password: '', confirm_password: ''});
      setFeedback(
        bi(
          'Your account password has been updated securely.',
          'আপনার অ্যাকাউন্টের পাসওয়ার্ড নিরাপদে পরিবর্তিত হয়েছে।',
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setChangingOwnPw(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<UserRecord>('/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setNewUser({
        username: '',
        password: '',
        full_name_en: '',
        full_name_bn: '',
        email: '',
        role: 'employee',
      });
      setShowCreateUser(false);
      setFeedback(bi('User account created and activated.', 'নতুন ব্যবহারকারীর অ্যাকাউন্ট তৈরি ও সক্রিয় করা হয়েছে।'));
      await loadGovernanceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  };

  const handleToggleUserStatus = async (u: UserRecord) => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<UserRecord>(`/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({is_active: !u.is_active}),
      });
      setFeedback(
        bi(
          `User '${u.username}' ${!u.is_active ? 'activated' : 'deactivated (active sessions immediately revoked)'}.`,
          `ব্যবহারকারী '${u.username}' ${!u.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`,
        ),
      );
      await loadGovernanceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update user status');
    }
  };

  const handleRoleChange = async (userId: number, role: RoleKey) => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<UserRecord>(`/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({role}),
      });
      setFeedback(bi('User role updated.', 'ব্যবহারকারীর ভূমিকা পরিবর্তিত হয়েছে।'));
      await loadGovernanceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId) return;
    setError(null);
    setFeedback(null);
    try {
      await apiRequest(`/users/${resetUserId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({new_password: newPassword}),
      });
      setResetUserId(null);
      setNewPassword('');
      setFeedback(bi('User password reset successfully.', 'পাসওয়ার্ড পুনরায় নির্ধারণ করা হয়েছে।'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  const toggleCell = (role: RoleKey, pkey: string) => {
    if (!matrixState || !canManagePermissions) return;
    if (role === 'admin' && matrixState.immutable_admin_permissions.includes(pkey)) return;
    setMatrixState({
      ...matrixState,
      matrix: {
        ...matrixState.matrix,
        [role]: {
          ...matrixState.matrix[role],
          [pkey]: !matrixState.matrix[role][pkey],
        },
      },
    });
  };

  const handleSaveMatrix = async () => {
    if (!matrixState) return;
    setSavingMatrix(true);
    setError(null);
    setFeedback(null);
    try {
      const updated = await apiRequest<PermissionMatrixResponse>('/permissions/matrix', {
        method: 'PUT',
        body: JSON.stringify({matrix: matrixState.matrix}),
      });
      setMatrixState(updated);
      onPermissionsChanged();
      setFeedback(
        bi(
          'Configurable 6-role permission matrix saved and enforced immediately.',
          '৬-ভূমিকার অনুমতি ম্যাট্রিক্স সংরক্ষিত এবং তাৎক্ষণিকভাবে কার্যকর হয়েছে।',
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permission matrix');
    } finally {
      setSavingMatrix(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Charcoal / Gold Security & Access Governance Header */}
      <section className="rounded-2xl bg-gradient-to-r from-slate-950 via-zinc-900 to-slate-900 text-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 no-print">
        <div className="space-y-1">
          <div className="text-xs font-medium text-amber-300">
            {bi(
              'Identity, Credentials & 6-Role Access Control',
              'পরিচয়, পাসওয়ার্ড নিরাপত্তা ও ৬-ভূমিকা অ্যাক্সেস নিয়ন্ত্রণ',
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {bi('Users, Role Permissions & Account Security', 'ব্যবহারকারী, রোল অনুমতি ও অ্যাকাউন্ট নিরাপত্তা')}
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl">
            {bi(
              'Manage Administrator, Accountant, HR & Payroll, Project Manager, Sales Executive, and Employee accounts with live permission enforcement.',
              'প্রশাসক, হিসাবরক্ষক, এইচআর ও পেরোল, প্রজেক্ট ম্যানেজার, সেলস এক্সিকিউটিভ ও কর্মী অ্যাকাউন্ট এবং রোল অনুমতি নিয়ন্ত্রণ।',
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-white/10 border border-white/15 rounded-xl shrink-0">
          {canManageUsers && (
            <button
              type="button"
              onClick={() => setSubTab('users')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'users' ? 'bg-amber-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {bi('User Directory', 'ব্যবহারকারী তালিকা')} ({users.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setSubTab('matrix')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'matrix' ? 'bg-amber-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            {bi('6-Role Matrix', '৬-ভূমিকা ম্যাট্রিক্স')}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('account')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'account' ? 'bg-amber-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            {bi('My Password', 'আমার পাসওয়ার্ড')}
          </button>
          {canManageUsers && (
            <button
              type="button"
              onClick={() => setSubTab('audit')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subTab === 'audit' ? 'bg-amber-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {bi('Audit Log', 'অডিট লগ')}
            </button>
          )}
        </div>
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

      {/* SUBTAB: SELF-SERVICE MY ACCOUNT & PASSWORD CHANGE (ALL 6 ROLES) */}
      {subTab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {bi(currentUser.full_name_en, currentUser.full_name_bn) || currentUser.username}
                </h2>
                <div className="text-xs text-slate-500">
                  <span className="font-mono">{currentUser.username}</span> · {roleLabel(currentUser.role)}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
              <div className="font-semibold text-slate-700">
                {bi('Active Permissions Assigned to Your Role', 'আপনার রোলে সক্রিয় অনুমতিসমূহ')} ({currentUser.permissions.length})
              </div>
              <div className="text-slate-600 leading-relaxed font-mono">
                {currentUser.permissions.join(' · ')}
              </div>
            </div>
          </section>

          <form
            onSubmit={handleChangeOwnPassword}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {bi('Change Your Login Password', 'আপনার লগইন পাসওয়ার্ড পরিবর্তন করুন')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {bi(
                  'Minimum 10 characters. Stored using salted cryptographic password hashing.',
                  'ন্যূনতম ১০ অক্ষর আবশ্যক। পাসওয়ার্ড নিরাপদ ক্রিপ্টোগ্রাফিক হ্যাশে সংরক্ষিত হয়।',
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Current Password', 'বর্তমান পাসওয়ার্ড')}
                </label>
                <input
                  type="password"
                  required
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm({...pwForm, current_password: e.target.value})}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('New Password (10+ chars)', 'নতুন পাসওয়ার্ড (১০+ অক্ষর)')}
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm({...pwForm, new_password: e.target.value})}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Confirm New Password', 'নতুন পাসওয়ার্ড নিশ্চিত করুন')}
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={pwForm.confirm_password}
                  onChange={(e) => setPwForm({...pwForm, confirm_password: e.target.value})}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={changingOwnPw}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{changingOwnPw ? '...' : bi('Update Password', 'পাসওয়ার্ড হালনাগাদ করুন')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 1: USER MANAGEMENT */}
      {subTab === 'users' && canManageUsers && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-600">
              {bi(
                '6 distinct departmental roles ready for company staff assignment.',
                'প্রতিষ্ঠানের ৬টি ভিন্ন বিভাগীয় ভূমিকার ব্যবহারকারী তালিকা।',
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowCreateUser((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showCreateUser ? t('cancel') : bi('Create User Account', 'নতুন ব্যবহারকারী তৈরি করুন')}</span>
            </button>
          </div>

          {showCreateUser && (
            <form onSubmit={handleCreateUser} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900">
                {bi('Provision New Company User Account', 'নতুন কোম্পানি ব্যবহারকারীর অ্যাকাউন্ট তৈরি')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Username (3+ chars)', 'ইউজারনেম')}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    placeholder="e.g. tanvir.pm"
                    value={newUser.username}
                    onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Initial Password (10+ chars)', 'প্রাথমিক পাসওয়ার্ড (১০+ অক্ষর)')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={10}
                    placeholder="Minimum 10 characters"
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Assigned Role', 'ভূমিকা নির্ধারণ')}
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value as RoleKey})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Full Name (EN)', 'পূর্ণ নাম (ইংরেজি)')}
                  </label>
                  <input
                    type="text"
                    value={newUser.full_name_en}
                    onChange={(e) => setNewUser({...newUser, full_name_en: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Full Name (BN)', 'পূর্ণ নাম (বাংলা)')}
                  </label>
                  <input
                    type="text"
                    value={newUser.full_name_bn}
                    onChange={(e) => setNewUser({...newUser, full_name_bn: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {bi('Official Work Email', 'অফিসিয়াল ইমেইল')}
                  </label>
                  <input
                    type="email"
                    placeholder="name@nextgentechnix.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateUser(false)}
                  className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  {bi('Create Account', 'অ্যাকাউন্ট তৈরি করুন')}
                </button>
              </div>
            </form>
          )}

          {resetUserId !== null && (
            <form onSubmit={handleResetPassword} className="bg-white border border-slate-300 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
              <span className="text-xs font-medium text-slate-700 shrink-0">
                {bi('Reset Password (10+ chars):', 'নতুন পাসওয়ার্ড (১০+ অক্ষর):')}
              </span>
              <input
                type="password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setResetUserId(null);
                    setNewPassword('');
                  }}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
                >
                  {bi('Save Password', 'পাসওয়ার্ড সংরক্ষণ')}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="py-3 px-4 font-semibold">{bi('Username', 'ইউজারনেম')}</th>
                    <th className="py-3 px-4 font-semibold">{bi('Name & Official Email', 'নাম ও ইমেইল')}</th>
                    <th className="py-3 px-4 font-semibold">{bi('Departmental Role', 'ভূমিকা')}</th>
                    <th className="py-3 px-4 font-semibold">{bi('Status', 'অবস্থা')}</th>
                    <th className="py-3 px-4 font-semibold text-right">{bi('Security Controls', 'নিরাপত্তা নিয়ন্ত্রণ')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <tr key={u.id} className={`hover:bg-slate-50/70 ${!u.is_active ? 'opacity-65' : ''}`}>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {u.username}
                          {isSelf && <span className="ml-1.5 font-sans font-normal text-slate-500">· You</span>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {bi(u.full_name_en, u.full_name_bn) || u.username}
                          </div>
                          {u.email && <div className="text-slate-500">{u.email}</div>}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={u.role}
                            disabled={isSelf}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as RoleKey)}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white disabled:bg-slate-100"
                          >
                            {ALL_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={u.is_active ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            {u.is_active ? bi('Active', 'সক্রিয়') : bi('Deactivated', 'নিষ্ক্রিয়')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setResetUserId(u.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>{bi('Reset PW', 'পাসওয়ার্ড')}</span>
                            </button>

                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => handleToggleUserStatus(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border disabled:opacity-40 cursor-pointer ${
                                u.is_active
                                  ? 'text-rose-700 border-rose-200 hover:bg-rose-50'
                                  : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                              }`}
                            >
                              {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              <span>{u.is_active ? bi('Deactivate', 'নিষ্ক্রিয় করুন') : bi('Activate', 'সক্রিয় করুন')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: CONFIGURABLE 6-ROLE PERMISSION MATRIX */}
      {subTab === 'matrix' && matrixState && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {bi(
                  'Role-Based Access Control Matrix (Administrator, Accountant, HR & Payroll, Project Manager, Sales Executive, Employee)',
                  'রোল-ভিত্তিক অনুমতি ম্যাট্রিক্স (প্রশাসক, হিসাবরক্ষক, এইচআর ও পেরোল, প্রজেক্ট ম্যানেজার, সেলস এক্সিকিউটিভ, কর্মী)',
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {bi(
                  'Core Administrator governance permissions (users:manage, permissions:manage) are locked against accidental self-lockout.',
                  'প্রশাসকের মূল গভর্নেন্স অনুমতি দুর্ঘটনাবশত লকআউট রোধে সংরক্ষিত।',
                )}
              </p>
            </div>

            {canManagePermissions && (
              <button
                type="button"
                disabled={savingMatrix}
                onClick={handleSaveMatrix}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingMatrix ? bi('Saving...', 'সংরক্ষণ হচ্ছে...') : bi('Save Matrix', 'ম্যাট্রিক্স সংরক্ষণ করুন')}</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="py-3 px-4 font-semibold min-w-64">{bi('Capability / Permission', 'অনুমতির বিবরণ')}</th>
                  {matrixState.roles.map((r) => (
                    <th key={r.role} className="py-3 px-3 font-semibold text-center whitespace-nowrap">
                      {bi(r.label_en, r.label_bn)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {matrixState.permissions.map((perm) => (
                  <tr key={perm.key} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {bi(perm.label_en, perm.label_bn)}{' '}
                        <span className="font-mono text-slate-400 font-normal">· {perm.key}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {bi(perm.description_en, perm.description_bn)}
                      </div>
                    </td>
                    {matrixState.roles.map((r) => {
                      const checked = Boolean(matrixState.matrix[r.role]?.[perm.key]);
                      const isLocked =
                        r.role === 'admin' && matrixState.immutable_admin_permissions.includes(perm.key);
                      return (
                        <td key={r.role} className="py-3 px-3 text-center">
                          {isLocked ? (
                            <span
                              title="Locked core administrator safeguard"
                              className="inline-flex items-center justify-center text-slate-500"
                            >
                              <Lock className="w-4 h-4" />
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canManagePermissions}
                              onChange={() => toggleCell(r.role, perm.key)}
                              aria-label={`${r.label_en} ${perm.key}`}
                              className="w-4 h-4 accent-slate-900 rounded cursor-pointer disabled:cursor-not-allowed"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: IMMUTABLE AUDIT LOG */}
      {subTab === 'audit' && canManageUsers && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {bi('No security or financial audit events recorded yet.', 'এখনও কোনো নিরাপত্তা বা আর্থিক অডিট লগ রেকর্ড হয়নি।')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="py-3 px-4 font-semibold">{bi('Timestamp (UTC)', 'সময় (ইউটিসি)')}</th>
                    <th className="py-3 px-3 font-semibold">{bi('Actor', 'সম্পাদনকারী')}</th>
                    <th className="py-3 px-3 font-semibold">{bi('Action', 'কার্যক্রম')}</th>
                    <th className="py-3 px-3 font-semibold">{bi('Target', 'লক্ষ্য বস্তু')}</th>
                    <th className="py-3 px-4 font-semibold">{bi('Details', 'বিস্তারিত')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {new Date(log.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{log.actor_username}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-800">{log.action}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {log.entity_type}:{log.entity_id}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
