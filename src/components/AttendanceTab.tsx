import React, {useCallback, useEffect, useState} from 'react';
import {
  CalendarCheck2,
  CheckCheck,
  Download,
  Edit3,
  Plus,
  Printer,
  Save,
  UserPlus,
  Users,
} from 'lucide-react';
import {apiRequest} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {
  AttendanceRow,
  AttendanceStatus,
  CompanyProfile,
  CurrentUser,
  Employee,
  MonthlyAttendanceSummary,
} from '../types';
import {
  COMPANY_HQ_URL,
  COMPANY_LOGO_URL,
  buildDailyAttendanceHtml,
  buildMonthlyAttendanceHtml,
  downloadColorfulHtml,
  printColorfulHtml,
} from '../utils/printEngine';

interface AttendanceTabProps {
  user: CurrentUser;
  company: CompanyProfile | null;
}

const STATUS_OPTIONS: {value: AttendanceStatus; labelEn: string; labelBn: string; activeClass: string}[] = [
  {value: 'present', labelEn: 'Present', labelBn: 'উপস্থিত', activeClass: 'bg-emerald-600 text-white border-emerald-600'},
  {value: 'late', labelEn: 'Late', labelBn: 'বিলম্ব', activeClass: 'bg-amber-500 text-slate-950 border-amber-500'},
  {value: 'half_day', labelEn: 'Half-Day', labelBn: 'অর্ধদিবস', activeClass: 'bg-cyan-600 text-white border-cyan-600'},
  {value: 'leave', labelEn: 'Leave', labelBn: 'ছুটি', activeClass: 'bg-indigo-600 text-white border-indigo-600'},
  {value: 'absent', labelEn: 'Absent', labelBn: 'অনুপস্থিত', activeClass: 'bg-rose-600 text-white border-rose-600'},
  {value: 'holiday', labelEn: 'Holiday', labelBn: 'বন্ধ', activeClass: 'bg-slate-700 text-white border-slate-700'},
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

export function AttendanceTab({user, company}: AttendanceTabProps) {
  const {bi} = useI18n();
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'employees'>('daily');
  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [summaryMonth, setSummaryMonth] = useState(currentMonthIso());

  const [dailyRows, setDailyRows] = useState<AttendanceRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<MonthlyAttendanceSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [empForm, setEmpForm] = useState({
    emp_code: 'EMP-001',
    full_name_en: '',
    full_name_bn: '',
    designation_en: 'Software Engineer',
    designation_bn: 'সফটওয়্যার ইঞ্জিনিয়ার',
    department: 'Software Engineering',
    phone: '',
    email: '',
    join_date: todayIso(),
    basic_salary: '0.00',
    house_rent: '0.00',
    medical_allowance: '0.00',
    transport_allowance: '0.00',
    payment_method_pref: 'Corporate Bank Transfer',
    bank_account_no: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canManageHr = user.permissions.includes('hr:manage');

  const loadDaily = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<AttendanceRow[]>(`/hr/attendance?attendance_date=${attendanceDate}`);
      setDailyRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily attendance');
    } finally {
      setLoading(false);
    }
  }, [attendanceDate]);

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<MonthlyAttendanceSummary[]>(`/hr/attendance/monthly?month=${summaryMonth}`);
      setMonthlyRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monthly attendance summary');
    } finally {
      setLoading(false);
    }
  }, [summaryMonth]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<Employee[]>('/hr/employees?include_inactive=true');
      setEmployees(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employee roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'daily') loadDaily();
    else if (viewMode === 'monthly') loadMonthly();
    else loadEmployees();
  }, [viewMode, loadDaily, loadMonthly, loadEmployees]);

  const updateRow = (empId: number, patch: Partial<AttendanceRow>) => {
    setDailyRows((prev) => prev.map((r) => (r.employee_id === empId ? {...r, ...patch} : r)));
  };

  const handleMarkAllPresent = () => {
    setDailyRows((prev) =>
      prev.map((r) => ({
        ...r,
        status: 'present',
        check_in: r.check_in || '09:00',
        check_out: r.check_out || '18:00',
      })),
    );
  };

  const handleSaveDailyAttendance = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const saved = await apiRequest<AttendanceRow[]>('/hr/attendance/bulk', {
        method: 'POST',
        body: JSON.stringify({
          attendance_date: attendanceDate,
          entries: dailyRows.map((r) => ({
            employee_id: r.employee_id,
            status: r.status,
            check_in: r.check_in,
            check_out: r.check_out,
            overtime_hours: Number(r.overtime_hours || 0).toFixed(2),
            note: r.note,
          })),
        }),
      });
      setDailyRows(saved);
      setFeedback(
        bi(
          `Attendance saved for ${attendanceDate} (${saved.length} staff). Synced with monthly payroll.`,
          `${attendanceDate} তারিখের উপস্থিতি সংরক্ষিত হয়েছে (${saved.length} জন কর্মী)।`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const openNewEmployeeForm = () => {
    setEditingEmployee(null);
    const nextNum = String(employees.length + 1).padStart(3, '0');
    setEmpForm({
      emp_code: `EMP-${nextNum}`,
      full_name_en: '',
      full_name_bn: '',
      designation_en: 'Software Engineer',
      designation_bn: 'সফটওয়্যার ইঞ্জিনিয়ার',
      department: 'Software Engineering',
      phone: '',
      email: '',
      join_date: todayIso(),
      basic_salary: '0.00',
      house_rent: '0.00',
      medical_allowance: '0.00',
      transport_allowance: '0.00',
      payment_method_pref: 'Corporate Bank Transfer',
      bank_account_no: '',
    });
    setViewMode('employees');
    setShowAddEmp(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmpForm({
      emp_code: emp.emp_code,
      full_name_en: emp.full_name_en,
      full_name_bn: emp.full_name_bn,
      designation_en: emp.designation_en,
      designation_bn: emp.designation_bn,
      department: emp.department,
      phone: emp.phone,
      email: emp.email,
      join_date: emp.join_date,
      basic_salary: emp.basic_salary,
      house_rent: emp.house_rent,
      medical_allowance: emp.medical_allowance,
      transport_allowance: emp.transport_allowance,
      payment_method_pref: emp.payment_method_pref,
      bank_account_no: emp.bank_account_no,
    });
    setShowAddEmp(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const payload = {
        ...empForm,
        basic_salary: Number(empForm.basic_salary || 0).toFixed(2),
        house_rent: Number(empForm.house_rent || 0).toFixed(2),
        medical_allowance: Number(empForm.medical_allowance || 0).toFixed(2),
        transport_allowance: Number(empForm.transport_allowance || 0).toFixed(2),
      };
      if (editingEmployee) {
        const updated = await apiRequest<Employee>(`/hr/employees/${editingEmployee.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback(
          bi(
            `Updated employee profile & salary structure for ${updated.full_name_en}.`,
            `${updated.full_name_en}-এর প্রোফাইল ও বেতন কাঠামো হালনাগাদ হয়েছে।`,
          ),
        );
      } else {
        const created = await apiRequest<Employee>('/hr/employees', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback(
          bi(
            `Onboarded ${created.full_name_en} (${created.emp_code}) into Attendance & Payroll.`,
            `${created.full_name_en} (${created.emp_code}) কর্মী তালিকায় যুক্ত হয়েছেন।`,
          ),
        );
      }
      setShowAddEmp(false);
      setEditingEmployee(null);
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save employee record');
    }
  };

  const handleToggleEmployeeActive = async (emp: Employee) => {
    setError(null);
    setFeedback(null);
    try {
      await apiRequest<Employee>(`/hr/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({is_active: !emp.is_active}),
      });
      setFeedback(
        bi(
          `Employee ${emp.emp_code} ${!emp.is_active ? 're-activated' : 'marked inactive'}.`,
          `কর্মী ${emp.emp_code} ${!emp.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`,
        ),
      );
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change employee status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Teal / Cyan Human Resource & Attendance Operations Header */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-teal-950 via-teal-900 to-cyan-900 text-white">
        <img
          src={company?.banner_url || COMPANY_HQ_URL}
          alt="NEXTGEN TECHNIX LIMITED Operations"
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
              <div className="text-xs font-medium text-teal-200">
                {bi(
                  'Human Resource & Attendance Operations · Synced with Monthly Payroll',
                  'মানবসম্পদ ও হাজিরা ব্যবস্থাপনা · মাসিক বেতনের সাথে সংযুক্ত',
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-0.5">
                {bi('Employee Attendance & Staff Directory', 'কর্মী উপস্থিতি (হাজিরা) ও তালিকা ব্যবস্থাপনা')}
              </h1>
              <p className="text-xs text-cyan-100 mt-1 max-w-2xl">
                {bi(
                  'Starts cleanly with 0 employees. Onboard your company staff, record daily check-in/out & overtime, and print attendance registers.',
                  'শূন্য (০) কর্মী হতে শুরু। আপনার প্রতিষ্ঠানের কর্মীদের যুক্ত করুন, দৈনিক হাজিরা সংরক্ষণ করুন এবং হাজিরা শীট প্রিন্ট করুন।',
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-white/15 rounded-xl border border-white/20 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                viewMode === 'daily' ? 'bg-white text-teal-950' : 'text-white hover:bg-white/10'
              }`}
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              <span>{bi('Daily Register', 'দৈনিক হাজিরা')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                viewMode === 'monthly' ? 'bg-white text-teal-950' : 'text-white hover:bg-white/10'
              }`}
            >
              <span>{bi('Monthly Summary', 'মাসিক সারসংক্ষেপ')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('employees')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                viewMode === 'employees' ? 'bg-white text-teal-950' : 'text-white hover:bg-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{bi('Staff Roster', 'কর্মী তালিকা')}</span>
            </button>
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

      {/* VIEW 1: DAILY ATTENDANCE REGISTER */}
      {viewMode === 'daily' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Attendance Date', 'হাজিরার তারিখ')}
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>

              {canManageHr && dailyRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="mt-5 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{bi('Mark All Present', 'সবাইকে উপস্থিত চিহ্নিত করুন')}</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={dailyRows.length === 0}
                onClick={() => printColorfulHtml(buildDailyAttendanceHtml(attendanceDate, dailyRows, company))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{bi('Print Daily Sheet', 'দৈনিক হাজিরা প্রিন্ট')}</span>
              </button>

              <button
                type="button"
                disabled={dailyRows.length === 0}
                onClick={() =>
                  downloadColorfulHtml(
                    buildDailyAttendanceHtml(attendanceDate, dailyRows, company),
                    `Daily_Attendance_${attendanceDate}.html`,
                  )
                }
                title="Download Printable HTML"
                className="p-2 text-cyan-800 border border-cyan-200 rounded-lg hover:bg-cyan-50 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>

              {canManageHr && dailyRows.length > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveDailyAttendance}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? '...' : bi('Save Attendance', 'উপস্থিতি সংরক্ষণ করুন')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {bi('Loading daily attendance...', 'দৈনিক উপস্থিতি লোড হচ্ছে...')}
              </div>
            ) : dailyRows.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="text-sm font-bold text-slate-900">
                  {bi('0 Active Employees Registered', 'বর্তমানে ০ জন সক্রিয় কর্মী তালিকাভুক্ত')}
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {bi(
                    'Your HR database starts completely fresh. Onboard your first employee in the Staff Roster to start recording daily attendance and calculating monthly payroll.',
                    'আপনার এইচআর ডাটাবেস সম্পূর্ণ নতুন অবস্থায় রয়েছে। দৈনিক হাজিরা ও মাসিক বেতন শুরু করতে প্রথমে কর্মী যুক্ত করুন।',
                  )}
                </p>
                {canManageHr && (
                  <button
                    type="button"
                    onClick={openNewEmployeeForm}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{bi('Onboard First Employee', 'প্রথম কর্মী যুক্ত করুন')}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-teal-950 text-white">
                      <th className="py-3 px-4 font-semibold">{bi('Employee', 'কর্মী ও পদবি')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Attendance Status', 'উপস্থিতির অবস্থা')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Check In', 'প্রবেশ')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Check Out', 'প্রস্থান')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('OT Hours', 'ওভারটাইম (ঘণ্টা)')}</th>
                      <th className="py-3 px-4 font-semibold">{bi('Remarks', 'মন্তব্য')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {dailyRows.map((row) => (
                      <tr key={row.employee_id} className="hover:bg-teal-50/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {bi(row.full_name_en, row.full_name_bn)} ·{' '}
                            <span className="font-mono text-teal-800">{row.emp_code}</span>
                          </div>
                          <div className="text-slate-500">
                            {row.designation_en} · {row.department}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {STATUS_OPTIONS.map((opt) => {
                              const active = row.status === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={!canManageHr}
                                  onClick={() => updateRow(row.employee_id, {status: opt.value})}
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                                    active
                                      ? opt.activeClass
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {bi(opt.labelEn, opt.labelBn)}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="time"
                            disabled={!canManageHr}
                            value={row.check_in}
                            onChange={(e) => updateRow(row.employee_id, {check_in: e.target.value})}
                            className="px-2 py-1.5 font-mono text-xs border border-slate-300 rounded-md"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="time"
                            disabled={!canManageHr}
                            value={row.check_out}
                            onChange={(e) => updateRow(row.employee_id, {check_out: e.target.value})}
                            className="px-2 py-1.5 font-mono text-xs border border-slate-300 rounded-md"
                          />
                        </td>
                        <td className="py-3 px-3 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            disabled={!canManageHr}
                            value={row.overtime_hours}
                            onChange={(e) => updateRow(row.employee_id, {overtime_hours: e.target.value})}
                            className="w-20 px-2 py-1.5 text-right font-mono tabular-nums text-xs border border-slate-300 rounded-md"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            disabled={!canManageHr}
                            placeholder={bi('Optional remark...', 'মন্তব্য...')}
                            value={row.note}
                            onChange={(e) => updateRow(row.employee_id, {note: e.target.value})}
                            className="w-full min-w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: MONTHLY ATTENDANCE SUMMARY */}
      {viewMode === 'monthly' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-700">
                {bi('Select Month:', 'মাস নির্বাচন করুন:')}
              </label>
              <input
                type="month"
                value={summaryMonth}
                onChange={(e) => setSummaryMonth(e.target.value)}
                className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={monthlyRows.length === 0}
                onClick={() => printColorfulHtml(buildMonthlyAttendanceHtml(summaryMonth, monthlyRows, company))}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{bi('Print Monthly Attendance Report', 'মাসিক উপস্থিতি রিপোর্ট প্রিন্ট')}</span>
              </button>
              <button
                type="button"
                disabled={monthlyRows.length === 0}
                onClick={() =>
                  downloadColorfulHtml(
                    buildMonthlyAttendanceHtml(summaryMonth, monthlyRows, company),
                    `Monthly_Attendance_${summaryMonth}.html`,
                  )
                }
                className="p-2 text-teal-800 border border-teal-200 rounded-lg hover:bg-teal-50 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {monthlyRows.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {bi(`0 Staff Attendance Summaries for ${summaryMonth}`, `${summaryMonth} মাসে কোনো উপস্থিতি রেকর্ড নেই`)}
                </div>
                <p className="text-xs text-slate-500">
                  {bi('Onboard employees in Staff Roster to track monthly attendance.', 'মাসিক হাজিরা দেখতে প্রথমে কর্মী তালিকায় কর্মী যুক্ত করুন।')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-teal-950 text-white">
                      <th className="py-3 px-4 font-semibold">{bi('Code', 'কোড')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Employee', 'কর্মীর নাম')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Department', 'বিভাগ')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Present', 'উপস্থিত')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Late', 'বিলম্ব')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Half-Day', 'অর্ধদিবস')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Leave', 'ছুটি')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Absent', 'অনুপস্থিত')}</th>
                      <th className="py-3 px-4 font-semibold text-right">{bi('Overtime (Hrs)', 'ওভারটাইম')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {monthlyRows.map((r) => (
                      <tr key={r.employee_id} className="hover:bg-teal-50/40">
                        <td className="py-3 px-4 font-mono font-bold text-teal-900">{r.emp_code}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{bi(r.full_name_en, r.full_name_bn)}</div>
                          <div className="text-slate-500">{r.designation_en}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{r.department}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {r.present_days}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700">{r.late_days}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-cyan-700">{r.half_days}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-indigo-700">{r.leave_days}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-rose-700">
                          {r.absent_days}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatMoney(r.total_overtime_hours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: STAFF ROSTER & SALARY STRUCTURE */}
      {viewMode === 'employees' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {bi('Company Staff Directory & Monthly Salary Structure', 'প্রতিষ্ঠানের কর্মী তালিকা ও মাসিক বেতন কাঠামো')}
              </h2>
              <p className="text-xs text-slate-500">
                {bi(
                  `${employees.length} total staff registered · Gross Salary = Basic + House Rent + Medical + Transport`,
                  `মোট ${employees.length} জন কর্মী নিবন্ধিত · মোট বেতন = মূল বেতন + বাড়ি ভাড়া + চিকিৎসা + যাতায়াত`,
                )}
              </p>
            </div>
            {canManageHr && (
              <button
                type="button"
                onClick={() => {
                  if (showAddEmp) {
                    setShowAddEmp(false);
                    setEditingEmployee(null);
                  } else {
                    openNewEmployeeForm();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{showAddEmp ? bi('Cancel', 'বাতিল') : bi('Add Employee', 'নতুন কর্মী যুক্ত করুন')}</span>
              </button>
            )}
          </div>

          {showAddEmp && canManageHr && (
            <form onSubmit={handleSaveEmployee} className="bg-white border border-teal-200 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-teal-950">
                {editingEmployee
                  ? bi(`Edit Employee — ${editingEmployee.emp_code}`, `কর্মী তথ্য সম্পাদনা — ${editingEmployee.emp_code}`)
                  : bi('Onboard New Company Employee', 'নতুন কর্মী নিবন্ধন করুন')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingEmployee)}
                    placeholder="EMP-001"
                    value={empForm.emp_code}
                    onChange={(e) => setEmpForm({...empForm, emp_code: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name (EN)</label>
                  <input
                    type="text"
                    required
                    value={empForm.full_name_en}
                    onChange={(e) => setEmpForm({...empForm, full_name_en: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">নাম (বাংলা)</label>
                  <input
                    type="text"
                    value={empForm.full_name_bn}
                    onChange={(e) => setEmpForm({...empForm, full_name_bn: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Joining Date</label>
                  <input
                    type="date"
                    required
                    value={empForm.join_date}
                    onChange={(e) => setEmpForm({...empForm, join_date: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={empForm.department}
                    onChange={(e) => setEmpForm({...empForm, department: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Designation (EN)</label>
                  <input
                    type="text"
                    value={empForm.designation_en}
                    onChange={(e) => setEmpForm({...empForm, designation_en: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm({...empForm, phone: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bank Account / Wallet</label>
                  <input
                    type="text"
                    value={empForm.bank_account_no}
                    onChange={(e) => setEmpForm({...empForm, bank_account_no: e.target.value})}
                    placeholder="Account number"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Basic Salary (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={empForm.basic_salary}
                    onChange={(e) => setEmpForm({...empForm, basic_salary: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">House Rent (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={empForm.house_rent}
                    onChange={(e) => setEmpForm({...empForm, house_rent: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Medical Allowance (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={empForm.medical_allowance}
                    onChange={(e) => setEmpForm({...empForm, medical_allowance: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Transport Allowance (BDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={empForm.transport_allowance}
                    onChange={(e) => setEmpForm({...empForm, transport_allowance: e.target.value})}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddEmp(false);
                    setEditingEmployee(null);
                  }}
                  className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer"
                >
                  {bi('Cancel', 'বাতিল')}
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-teal-700 text-white rounded-lg hover:bg-teal-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{editingEmployee ? bi('Update Employee', 'হালনাগাদ করুন') : bi('Save Employee', 'কর্মী সংরক্ষণ করুন')}</span>
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {employees.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {bi('0 Employees in Company Roster', 'কর্মী তালিকায় বর্তমানে ০ জন কর্মী রয়েছেন')}
                </div>
                <p className="text-xs text-slate-500">
                  {bi(
                    'Click "Add Employee" above to register your real team members with their exact monthly salary breakdown.',
                    'আপনার প্রতিষ্ঠানের প্রকৃত কর্মীদের মাসিক বেতন কাঠামোসহ যুক্ত করতে উপরের "নতুন কর্মী যুক্ত করুন" বাটনে ক্লিক করুন।',
                  )}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-teal-950 text-white">
                      <th className="py-3 px-4 font-semibold">Code</th>
                      <th className="py-3 px-3 font-semibold">{bi('Name & Role', 'নাম ও পদবি')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('Department', 'বিভাগ')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Basic', 'মূল বেতন')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Allowances', 'ভাতা')}</th>
                      <th className="py-3 px-3 font-semibold text-right">{bi('Monthly Gross', 'মোট বেতন (BDT)')}</th>
                      <th className="py-3 px-3 font-semibold">{bi('State', 'অবস্থা')}</th>
                      {canManageHr && <th className="py-3 px-4 font-semibold text-right">{bi('Manage', 'পরিচালনা')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {employees.map((e) => (
                      <tr key={e.id} className={`hover:bg-teal-50/40 ${!e.is_active ? 'opacity-60' : ''}`}>
                        <td className="py-3 px-4 font-mono font-bold text-teal-900">{e.emp_code}</td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{bi(e.full_name_en, e.full_name_bn)}</div>
                          <div className="text-slate-500">{bi(e.designation_en, e.designation_bn)}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{e.department}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{formatMoney(e.basic_salary)}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {formatMoney(
                            Number(e.house_rent) + Number(e.medical_allowance) + Number(e.transport_allowance),
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                          {formatMoney(e.gross_salary)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={e.is_active ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                            {e.is_active ? bi('Active', 'সক্রিয়') : bi('Inactive', 'নিষ্ক্রিয়')}
                          </span>
                        </td>
                        {canManageHr && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditEmployee(e)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{bi('Edit', 'সম্পাদনা')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleEmployeeActive(e)}
                                className="px-2.5 py-1 text-xs border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer"
                              >
                                {e.is_active ? bi('Deactivate', 'নিষ্ক্রিয়') : bi('Activate', 'সক্রিয়')}
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
      )}
    </div>
  );
}
