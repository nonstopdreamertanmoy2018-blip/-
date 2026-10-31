import React, {useCallback, useEffect, useState} from 'react';
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  Code2,
  Download,
  Edit3,
  FolderKanban,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {api} from '../api';
import {formatMoney, useI18n} from '../i18n';
import {CompanyProfile, CurrentUser, ProjectStatus, SoftwareProject} from '../types';
import {
  buildProjectsPortfolioHtml,
  downloadStandaloneHtml,
  printColorfulHtml,
} from '../utils/printEngine';

interface Props {
  user: CurrentUser;
}

const STATUS_META: Record<
  ProjectStatus,
  {labelEn: string; labelBn: string; badgeClass: string; barClass: string}
> = {
  planning: {
    labelEn: 'Planning & Discovery',
    labelBn: 'পরিকল্পনা ও বিশ্লেষণ',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    barClass: 'bg-sky-500',
  },
  active: {
    labelEn: 'Active Development',
    labelBn: 'চলমান ডেভেলপমেন্ট',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
    barClass: 'bg-violet-600',
  },
  uat: {
    labelEn: 'Client UAT & QA',
    labelBn: 'ক্লায়েন্ট ইউএটি ও টেস্টিং',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    barClass: 'bg-amber-500',
  },
  completed: {
    labelEn: 'Delivered & Live',
    labelBn: 'সম্পন্ন ও লাইভ',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    barClass: 'bg-emerald-600',
  },
  on_hold: {
    labelEn: 'Paused / On Hold',
    labelBn: 'স্থগিত',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    barClass: 'bg-slate-400',
  },
};

export function ProjectsTab({user}: Props) {
  const {bi} = useI18n();
  const canManage = user.permissions.includes('projects:manage');
  const todayIso = new Date().toISOString().slice(0, 10);

  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{type: 'ok' | 'err'; text: string} | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<SoftwareProject | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [formNameEn, setFormNameEn] = useState('');
  const [formNameBn, setFormNameBn] = useState('');
  const [formClientEn, setFormClientEn] = useState('');
  const [formClientBn, setFormClientBn] = useState('');
  const [formClientContact, setFormClientContact] = useState('');
  const [formTechStack, setFormTechStack] = useState('React, TypeScript, FastAPI, PostgreSQL');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('active');
  const [formProgress, setFormProgress] = useState('0');
  const [formStartDate, setFormStartDate] = useState(todayIso);
  const [formDeadline, setFormDeadline] = useState('');
  const [formContractVal, setFormContractVal] = useState('0.00');
  const [formBilledVal, setFormBilledVal] = useState('0.00');
  const [formReceivedVal, setFormReceivedVal] = useState('0.00');
  const [formManager, setFormManager] = useState(user.username);
  const [formNotes, setFormNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRows, compData] = await Promise.all([
        api.get<SoftwareProject[]>('/projects'),
        api.get<CompanyProfile>('/company'),
      ]);
      setProjects(projRows);
      setCompany(compData);
    } catch (err: unknown) {
      setFeedback({type: 'err', text: err instanceof Error ? err.message : 'Failed to load projects'});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditingProject(null);
    setFormNameEn('');
    setFormNameBn('');
    setFormClientEn('');
    setFormClientBn('');
    setFormClientContact('');
    setFormTechStack('React, TypeScript, Node.js, PostgreSQL');
    setFormStatus('active');
    setFormProgress('0');
    setFormStartDate(todayIso);
    setFormDeadline('');
    setFormContractVal('0.00');
    setFormBilledVal('0.00');
    setFormReceivedVal('0.00');
    setFormManager(user.username);
    setFormNotes('');
    setShowCreateModal(true);
  };

  const openEdit = (p: SoftwareProject) => {
    setEditingProject(p);
    setFormNameEn(p.name_en);
    setFormNameBn(p.name_bn);
    setFormClientEn(p.client_name_en);
    setFormClientBn(p.client_name_bn);
    setFormClientContact(p.client_contact);
    setFormTechStack(p.tech_stack);
    setFormStatus(p.status);
    setFormProgress(String(p.progress_percent));
    setFormStartDate(p.start_date);
    setFormDeadline(p.deadline || '');
    setFormContractVal(p.contract_value);
    setFormBilledVal(p.billed_amount);
    setFormReceivedVal(p.received_amount);
    setFormManager(p.manager_username);
    setFormNotes(p.notes);
    setShowCreateModal(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const payload = {
        name_en: formNameEn,
        name_bn: formNameBn,
        client_name_en: formClientEn,
        client_name_bn: formClientBn,
        client_contact: formClientContact,
        tech_stack: formTechStack,
        status: formStatus,
        progress_percent: Number(formProgress || 0),
        start_date: formStartDate,
        deadline: formDeadline || null,
        contract_value: formContractVal || '0.00',
        billed_amount: formBilledVal || '0.00',
        received_amount: formReceivedVal || '0.00',
        manager_username: formManager || user.username,
        notes: formNotes,
      };
      if (editingProject) {
        await api.patch(`/projects/${editingProject.id}`, payload);
        setFeedback({
          type: 'ok',
          text: bi(
            `Updated project ${editingProject.project_code} successfully.`,
            `প্রজেক্ট ${editingProject.project_code} সফলভাবে হালনাগাদ হয়েছে।`,
          ),
        });
      } else {
        const created = await api.post<SoftwareProject>('/projects', payload);
        setFeedback({
          type: 'ok',
          text: bi(
            `Registered software project ${created.project_code}.`,
            `নতুন সফটওয়্যার প্রজেক্ট ${created.project_code} নিবন্ধিত হয়েছে।`,
          ),
        });
      }
      setShowCreateModal(false);
      await loadData();
    } catch (err: unknown) {
      setFeedback({type: 'err', text: err instanceof Error ? err.message : 'Save failed'});
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(true);
    setFeedback(null);
    try {
      await api.del(`/projects/${id}`);
      setConfirmDeleteId(null);
      setFeedback({
        type: 'ok',
        text: bi('Software project removed from portfolio.', 'প্রজেক্টটি তালিকা থেকে মুছে ফেলা হয়েছে।'),
      });
      await loadData();
    } catch (err: unknown) {
      setFeedback({type: 'err', text: err instanceof Error ? err.message : 'Delete failed'});
    } finally {
      setBusy(false);
    }
  };

  const filtered = projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.project_code.toLowerCase().includes(q) ||
      p.name_en.toLowerCase().includes(q) ||
      p.client_name_en.toLowerCase().includes(q) ||
      p.tech_stack.toLowerCase().includes(q)
    );
  });

  const activeCount = projects.filter((p) => ['planning', 'active', 'uat'].includes(p.status)).length;
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0);
  const totalBilled = projects.reduce((s, p) => s + Number(p.billed_amount || 0), 0);
  const totalReceived = projects.reduce((s, p) => s + Number(p.received_amount || 0), 0);
  const totalDue = projects.reduce((s, p) => s + Number(p.due_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Distinct Domain Header: Engineering Delivery & Client Contracts (Deep Violet / Plum) */}
      <div className="rounded-2xl bg-gradient-to-r from-[#2e1065] via-[#4c1d95] to-[#312e81] text-white p-6 shadow-md border border-violet-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <FolderKanban className="w-6 h-6 text-violet-200" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-violet-200 font-semibold">
                {bi('Software Engineering Delivery & Client Contracts', 'সফটওয়্যার প্রজেক্ট ডেলিভারি ও গ্রাহক চুক্তি')}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5">
                {bi('IT Projects, Milestones & Contract Pipeline', 'আইটি প্রজেক্ট, মাইলস্টোন ও চুক্তি ব্যবস্থাপনা')}
              </h2>
              <p className="text-xs text-violet-100/85 mt-1 max-w-2xl">
                {bi(
                  'Track custom software builds, client UAT sign-offs, contract values, billed milestones, and collections from 0.00 BDT.',
                  'কাস্টম সফটওয়্যার প্রজেক্ট, ইউএটি অগ্রগতি, চুক্তিমূল্য, বিলকৃত অর্থ এবং আদায়কৃত অর্থ ট্র্যাক করুন।',
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => printColorfulHtml(buildProjectsPortfolioHtml(filtered, company))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-2 text-xs font-semibold text-white transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              {bi('Print Portfolio', 'পোর্টফোলিও প্রিন্ট')}
            </button>
            <button
              type="button"
              onClick={() =>
                downloadStandaloneHtml(
                  buildProjectsPortfolioHtml(filtered, company),
                  'NextGen_Technix_Projects_Portfolio',
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 text-xs font-medium text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              HTML
            </button>
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white text-violet-950 hover:bg-violet-50 px-4 py-2 text-xs font-bold shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                {bi('Register Software Project', 'নতুন প্রজেক্ট যুক্ত করুন')}
              </button>
            )}
          </div>
        </div>

        {/* 5-Metric Contract & Delivery KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-white/15">
          <div className="rounded-xl bg-white/10 px-3.5 py-2.5 border border-white/10">
            <div className="text-[11px] text-violet-200">{bi('Active Pipeline', 'চলমান প্রজেক্ট')}</div>
            <div className="text-lg font-bold font-mono tabular-nums mt-0.5">
              {activeCount} <span className="text-xs font-normal text-violet-200">/ {projects.length}</span>
            </div>
          </div>
          <div className="rounded-xl bg-white/10 px-3.5 py-2.5 border border-white/10">
            <div className="text-[11px] text-violet-200">{bi('Contract Value', 'মোট চুক্তিমূল্য')}</div>
            <div className="text-lg font-bold font-mono tabular-nums mt-0.5">BDT {formatMoney(totalContract)}</div>
          </div>
          <div className="rounded-xl bg-white/10 px-3.5 py-2.5 border border-white/10">
            <div className="text-[11px] text-violet-200">{bi('Billed to Clients', 'বিলকৃত অর্থ')}</div>
            <div className="text-lg font-bold font-mono tabular-nums mt-0.5">BDT {formatMoney(totalBilled)}</div>
          </div>
          <div className="rounded-xl bg-white/10 px-3.5 py-2.5 border border-white/10">
            <div className="text-[11px] text-emerald-200">{bi('Collected', 'আদায়কৃত অর্থ')}</div>
            <div className="text-lg font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
              BDT {formatMoney(totalReceived)}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 px-3.5 py-2.5 border border-white/10 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-amber-200">{bi('Billed Due', 'বকেয়া প্রাপ্য')}</div>
            <div className="text-lg font-bold font-mono tabular-nums text-amber-300 mt-0.5">
              BDT {formatMoney(totalDue)}
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4"
          >
            {bi('Dismiss', 'বন্ধ করুন')}
          </button>
        </div>
      )}

      {/* Stage Filter & Search */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['all', bi('All Projects', 'সকল প্রজেক্ট')],
              ['planning', bi('Planning', 'পরিকল্পনা')],
              ['active', bi('Active Sprint', 'চলমান')],
              ['uat', bi('Client UAT', 'ইউএটি')],
              ['completed', bi('Completed', 'সম্পন্ন')],
              ['on_hold', bi('On Hold', 'স্থগিত')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-violet-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={bi('Search code, project, client, stack...', 'প্রজেক্ট, ক্লায়েন্ট বা স্ট্যাক খুঁজুন...')}
              className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-violet-600"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Project Cards Grid or Fresh 0.00 Empty State */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          {bi('Loading software delivery portfolio...', 'প্রজেক্ট তালিকা লোড হচ্ছে...')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-violet-300 p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-200 text-violet-700 flex items-center justify-center mx-auto mb-3">
            <Code2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {projects.length === 0
              ? bi('Fresh Project Portfolio — 0 Projects (BDT 0.00)', 'নতুন প্রজেক্ট পোর্টফোলিও — ০টি প্রজেক্ট (০.০০ টাকা)')
              : bi('No Matching Software Projects', 'কোনো মিলে যাওয়া প্রজেক্ট পাওয়া যায়নি')}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
            {projects.length === 0
              ? bi(
                  'Your IT company workspace is completely clean with zero pre-filled client projects. Register your first software development contract or AMC engagement to track milestones and billing.',
                  'আপনার আইটি কোম্পানির ওয়ার্কস্পেসে কোনো পূর্ব-প্রবেশকৃত ডেমো প্রজেক্ট নেই। প্রথম সফটওয়্যার প্রজেক্ট বা ক্লায়েন্ট চুক্তি নিবন্ধন করুন।',
                )
              : bi('Try clearing your stage filter or search query.', 'ফিল্টার বা অনুসন্ধান পরিবর্তন করে পুনরায় চেষ্টা করুন।')}
          </p>
          {canManage && projects.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 text-white px-4 py-2.5 text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              {bi('Register First Client Project', 'প্রথম ক্লায়েন্ট প্রজেক্ট তৈরি করুন')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((p) => {
            const st = STATUS_META[p.status] || STATUS_META.active;
            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:border-violet-300 transition-colors flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-violet-800 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
                          {p.project_code}
                        </span>
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded border ${st.badgeClass}`}>
                          {bi(st.labelEn, st.labelBn)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-2">{bi(p.name_en, p.name_bn)}</h3>
                      <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{bi(p.client_name_en, p.client_name_bn)}</span>
                        {p.client_contact && <span className="text-slate-400">· {p.client_contact}</span>}
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 hover:border-violet-300 hover:bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {bi('Edit', 'সম্পাদনা')}
                        </button>
                        {confirmDeleteId === p.id ? (
                          <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDelete(p.id)}
                              className="text-[11px] font-bold text-rose-700 hover:underline"
                            >
                              {bi('Confirm', 'নিশ্চিত')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] text-slate-500 hover:text-slate-800 ml-1"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-700"
                            title={bi('Remove project', 'মুছে ফেলুন')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tech Stack & Dates */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                      <Layers className="w-3.5 h-3.5 text-violet-600" />
                      {p.tech_stack || 'Custom Stack'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {p.start_date} {p.deadline ? `→ ${p.deadline}` : ''}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      Lead: <strong className="font-mono text-slate-700">{p.manager_username}</strong>
                    </span>
                  </div>

                  {/* Delivery Milestone Progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 font-medium">
                        {bi('Milestone Completion', 'ডেলিভারি অগ্রগতি')}
                      </span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">{p.progress_percent}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${st.barClass}`}
                        style={{width: `${p.progress_percent}%`}}
                      />
                    </div>
                  </div>
                </div>

                {/* Contract Commercials Footer */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      {bi('Contract', 'চুক্তিমূল্য')}
                    </div>
                    <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                      {formatMoney(p.contract_value)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-violet-50/60 px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-violet-700">
                      {bi('Billed', 'বিলকৃত')}
                    </div>
                    <div className="font-mono font-bold text-violet-950 tabular-nums mt-0.5">
                      {formatMoney(p.billed_amount)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50/70 px-2.5 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700">
                      {bi('Received', 'আদায়কৃত')}
                    </div>
                    <div className="font-mono font-bold text-emerald-900 tabular-nums mt-0.5">
                      {formatMoney(p.received_amount)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Software Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="bg-gradient-to-r from-[#2e1065] to-[#4c1d95] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-violet-200" />
                <h3 className="text-base font-bold">
                  {editingProject
                    ? bi(`Update Project ${editingProject.project_code}`, `প্রজেক্ট হালনাগাদ (${editingProject.project_code})`)
                    : bi('Register New Client Software Project', 'নতুন সফটওয়্যার প্রজেক্ট নিবন্ধন')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-violet-200 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Software Project Title (English) *', 'প্রজেক্টের নাম (ইংরেজি) *')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formNameEn}
                    onChange={(e) => setFormNameEn(e.target.value)}
                    placeholder="e.g. Enterprise Hospital ERP & Billing Platform"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Project Title (Bangla)', 'প্রজেক্টের নাম (বাংলা)')}
                  </label>
                  <input
                    type="text"
                    value={formNameBn}
                    onChange={(e) => setFormNameBn(e.target.value)}
                    placeholder="হাসপাতাল ইআরপি ও বিলিং প্ল্যাটফর্ম"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Client Organization (English) *', 'গ্রাহক প্রতিষ্ঠানের নাম (ইংরেজি) *')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formClientEn}
                    onChange={(e) => setFormClientEn(e.target.value)}
                    placeholder="Client company name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Client Contact / Phone / Email', 'গ্রাহকের যোগাযোগ নম্বর / ইমেইল')}
                  </label>
                  <input
                    type="text"
                    value={formClientContact}
                    onChange={(e) => setFormClientContact(e.target.value)}
                    placeholder="+880 1... / cto@client.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Technology Stack & Architecture', 'ব্যবহৃত প্রযুক্তি (Tech Stack)')}
                  </label>
                  <input
                    type="text"
                    value={formTechStack}
                    onChange={(e) => setFormTechStack(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Delivery Stage', 'ডেলিভারি ধাপ')}
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ProjectStatus)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="planning">Planning & Discovery</option>
                    <option value="active">Active Development</option>
                    <option value="uat">Client UAT & QA</option>
                    <option value="completed">Delivered & Live</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Milestone Completion (%)', 'সম্পন্ন অগ্রগতি (%)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formProgress}
                    onChange={(e) => setFormProgress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Start Date', 'শুরুর তারিখ')}
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Target Go-Live Deadline', 'সম্ভাব্য সমাপ্তির তারিখ')}
                  </label>
                  <input
                    type="date"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Contract Value (BDT)', 'মোট চুক্তিমূল্য (টাকা)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formContractVal}
                    onChange={(e) => setFormContractVal(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Billed Amount (BDT)', 'বিলকৃত অর্থ (টাকা)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formBilledVal}
                    onChange={(e) => setFormBilledVal(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Received Amount (BDT)', 'আদায়কৃত অর্থ (টাকা)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formReceivedVal}
                    onChange={(e) => setFormReceivedVal(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Project Manager Username', 'প্রজেক্ট ম্যানেজার')}
                  </label>
                  <input
                    type="text"
                    value={formManager}
                    onChange={(e) => setFormManager(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {bi('Scope & Milestone Notes', 'স্কোপ ও মাইলস্টোন নোট')}
                  </label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder={bi('Deliverables, SLA terms, or milestone schedule...', 'মাইলস্টোন ও চুক্তির শর্তাবলি...')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {bi('Cancel', 'বাতিল')}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-violet-700 hover:bg-violet-800 text-white px-5 py-2 text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {busy
                    ? bi('Saving...', 'সংরক্ষণ হচ্ছে...')
                    : editingProject
                      ? bi('Save Project Updates', 'পরিবর্তন সংরক্ষণ করুন')
                      : bi('Create Project Record', 'প্রজেক্ট সংরক্ষণ করুন')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
