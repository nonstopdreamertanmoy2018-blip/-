import React, {useEffect, useMemo, useState} from 'react';
import {BookCheck, CheckCircle2, Download, FilePlus2, Plus, Printer, Trash2} from 'lucide-react';
import {apiRequest} from '../api';
import {amountToWordsEn, formatMoney, useI18n} from '../i18n';
import {BusinessDocument, CompanyProfile, CurrentUser, DocType, JournalEntry} from '../types';
import {
  COMPANY_LOGO_URL,
  buildBusinessDocumentHtml,
  downloadColorfulHtml,
  printColorfulHtml,
} from '../utils/printEngine';

interface PrintableDocumentsTabProps {
  user: CurrentUser;
  company: CompanyProfile | null;
}

const DOC_TYPES: DocType[] = ['invoice', 'quotation', 'receipt', 'payment_voucher', 'letterhead'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PrintableDocumentsTab({user, company}: PrintableDocumentsTabProps) {
  const {bi, t, docTypeLabel} = useI18n();
  const [docs, setDocs] = useState<BusinessDocument[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | DocType>('all');
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [postingId, setPostingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [docType, setDocType] = useState<DocType>('invoice');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDaysIso(30));
  const [partyNameEn, setPartyNameEn] = useState('');
  const [partyNameBn, setPartyNameBn] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [subjectEn, setSubjectEn] = useState('');
  const [subjectBn, setSubjectBn] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [bodyBn, setBodyBn] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Corporate Bank Transfer');
  const [discountAmount, setDiscountAmount] = useState('0.00');
  const [taxRate, setTaxRate] = useState('0.00');
  const [items, setItems] = useState([
    {description_en: '', description_bn: '', quantity: '1.00', unit_price: '0.00'},
  ]);

  const canCreate = user.permissions.includes('documents:create');
  const canPostAccounting = user.permissions.includes('journals:create');

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiRequest<BusinessDocument[]>('/documents');
      setDocs(list);
      if (list.length > 0 && selectedDocId === null) {
        setSelectedDocId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const filteredDocs = useMemo(() => {
    if (typeFilter === 'all') return docs;
    return docs.filter((d) => d.doc_type === typeFilter);
  }, [docs, typeFilter]);

  const activeDoc = useMemo(() => {
    return docs.find((d) => d.id === selectedDocId) || filteredDocs[0] || null;
  }, [docs, filteredDocs, selectedDocId]);

  const startTemplateCreation = (dt: DocType) => {
    setDocType(dt);
    setIssueDate(todayIso());
    setDueDate(dt === 'letterhead' ? '' : addDaysIso(30));
    setShowBuilder(true);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      const created = await apiRequest<BusinessDocument>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          doc_type: docType,
          issue_date: issueDate,
          due_date: dueDate || null,
          party_name_en: partyNameEn,
          party_name_bn: partyNameBn,
          party_address: partyAddress,
          subject_en: subjectEn,
          subject_bn: subjectBn,
          body_en: bodyEn,
          body_bn: bodyBn,
          payment_method: paymentMethod,
          discount_amount: Number(discountAmount || 0).toFixed(2),
          tax_rate_percent: Number(taxRate || 0).toFixed(2),
          items:
            docType === 'letterhead'
              ? []
              : items.map((it) => ({
                  description_en: it.description_en,
                  description_bn: it.description_bn,
                  quantity: Number(it.quantity || 1).toFixed(2),
                  unit_price: Number(it.unit_price || 0).toFixed(2),
                })),
        }),
      });
      setShowBuilder(false);
      setPartyNameEn('');
      setPartyNameBn('');
      setPartyAddress('');
      setSubjectEn('');
      setSubjectBn('');
      setBodyEn('');
      setBodyBn('');
      setItems([{description_en: '', description_bn: '', quantity: '1.00', unit_price: '0.00'}]);
      setFeedback(bi(`Issued official document ${created.doc_number}.`, `${created.doc_number} নথি সফলভাবে তৈরি হয়েছে।`));
      await fetchDocuments();
      setSelectedDocId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue document');
    }
  };

  const handlePostToLedger = async (doc: BusinessDocument) => {
    setPostingId(doc.id);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiRequest<{document: BusinessDocument; journal: JournalEntry}>(
        `/documents/${doc.id}/post-accounting`,
        {method: 'POST', body: JSON.stringify({})},
      );
      setFeedback(
        bi(
          `${doc.doc_number} posted to General Ledger under voucher ${res.journal.voucher_no} (${res.journal.status}).`,
          `${doc.doc_number} জেনারেল লেজারে ভাউচার ${res.journal.voucher_no} হিসেবে পোস্ট হয়েছে।`,
        ),
      );
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post document to General Ledger');
    } finally {
      setPostingId(null);
    }
  };

  const docHeaderMeta = (dt: DocType) => {
    switch (dt) {
      case 'letterhead':
        return {
          en: 'Official Letterhead',
          bn: 'অফিসিয়াল লেটারহেড',
          headerGrad: 'from-slate-900 via-slate-800 to-blue-900',
          tableHead: 'bg-slate-900 text-white',
          softBox: 'bg-slate-50 border-slate-200',
        };
      case 'payment_voucher':
        return {
          en: 'Payment Voucher',
          bn: 'পেমেন্ট ভাউচার',
          headerGrad: 'from-amber-950 via-orange-900 to-amber-800',
          tableHead: 'bg-amber-950 text-white',
          softBox: 'bg-amber-50/70 border-amber-200',
        };
      case 'receipt':
        return {
          en: 'Money Receipt',
          bn: 'মানি রসিদ',
          headerGrad: 'from-emerald-950 via-emerald-800 to-teal-800',
          tableHead: 'bg-emerald-950 text-white',
          softBox: 'bg-emerald-50/70 border-emerald-200',
        };
      case 'quotation':
        return {
          en: 'Commercial Quotation',
          bn: 'ব্যবসায়িক কোটেশন',
          headerGrad: 'from-purple-950 via-violet-900 to-indigo-800',
          tableHead: 'bg-violet-950 text-white',
          softBox: 'bg-violet-50/70 border-violet-200',
        };
      case 'invoice':
        return {
          en: 'Service Invoice',
          bn: 'সার্ভিস ইনভয়েস / চালান',
          headerGrad: 'from-amber-900 via-orange-800 to-slate-900',
          tableHead: 'bg-slate-900 text-white',
          softBox: 'bg-amber-50/60 border-amber-200',
        };
    }
  };

  const corp = company || {
    name_en: 'NEXTGEN TECHNIX LIMITED',
    name_bn: 'নেক্সটজেন টেকনিক্স লিমিটেড',
    tagline_en: 'IT Consulting, Custom Software Engineering & Enterprise Solutions',
    tagline_bn: 'আইটি পরামর্শ, সফটওয়্যার ইঞ্জিনিয়ারিং ও এন্টারপ্রাইজ সলিউশন',
    registration_no: 'RJSC-C-194820',
    tin_no: '482-910-3341',
    bin_no: '004918273-0102',
    address_en: 'Level 9, Plot 42, Gulshan Avenue, Dhaka-1212, Bangladesh',
    address_bn: 'লেভেল ৯, প্লট ৪২, গুলশান অ্যাভিনিউ, ঢাকা-১২১২, বাংলাদেশ',
    phone: '+880 2-5503-4910',
    email: 'info@nextgentechnix.com',
    website: 'https://www.nextgentechnix.com',
    currency: 'BDT',
    logo_url: COMPANY_LOGO_URL,
  };

  const activeVisual = activeDoc ? docHeaderMeta(activeDoc.doc_type) : docHeaderMeta('invoice');
  const isPostableDoc =
    activeDoc &&
    (activeDoc.doc_type === 'invoice' ||
      activeDoc.doc_type === 'receipt' ||
      activeDoc.doc_type === 'payment_voucher');

  return (
    <div className="space-y-6">
      {/* Warm Amber / Terracotta Commercial Billing & Print Studio Header */}
      <section className="rounded-2xl bg-gradient-to-r from-amber-950 via-orange-900 to-slate-900 text-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 no-print">
        <div className="space-y-1">
          <div className="text-xs text-amber-300 font-medium">
            {bi(
              'Commercial Billing & Official Stationery · Direct Accounting Sync',
              'বাণিজ্যিক বিলিং ও অফিসিয়াল স্টেশনারি · সরাসরি লেজার পোস্টিং',
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {bi(
              'Invoices, Quotations, Money Receipts, Vouchers & Letterhead',
              'ইনভয়েস, কোটেশন, মানি রসিদ, পেমেন্ট ভাউচার ও লেটারহেড',
            )}
          </h1>
          <p className="text-xs text-amber-100/90 max-w-2xl">
            {bi(
              'Starts at 0 issued documents. Generate sequentially numbered A4 corporate documents and post Invoices, Receipts, or Vouchers directly to the General Ledger.',
              'শূন্য (০) নথি হতে শুরু। ধারাবাহিক নম্বরসহ A4 রঙিন নথি তৈরি করুন এবং এক ক্লিকে জেনারেল লেজারে পোস্ট করুন।',
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowBuilder((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-400 text-slate-950 rounded-xl hover:bg-amber-300 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showBuilder ? t('cancel') : bi('Issue New Document', 'নতুন নথি তৈরি করুন')}</span>
            </button>
          )}
          {activeDoc && (
            <>
              {isPostableDoc && canPostAccounting && !activeDoc.linked_journal_id && (
                <button
                  type="button"
                  disabled={postingId === activeDoc.id}
                  onClick={() => handlePostToLedger(activeDoc)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 rounded-xl whitespace-nowrap cursor-pointer"
                >
                  <BookCheck className="w-4 h-4" />
                  <span>
                    {postingId === activeDoc.id
                      ? bi('Posting...', 'পোস্ট হচ্ছে...')
                      : bi('Post to General Ledger', 'লেজারে পোস্ট করুন')}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => printColorfulHtml(buildBusinessDocumentHtml(activeDoc, company))}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-50 rounded-xl whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{t('printPdf')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadColorfulHtml(
                    buildBusinessDocumentHtml(activeDoc, company),
                    `${activeDoc.doc_number}_Printable.html`,
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{t('downloadHtml')}</span>
              </button>
            </>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 no-print">
          {error}
        </div>
      )}
      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium no-print">
          {feedback}
        </div>
      )}

      {/* Document Creation Form */}
      {showBuilder && canCreate && (
        <form onSubmit={handleCreateDocument} className="bg-white border border-amber-200 rounded-xl p-6 space-y-5 no-print">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              {bi('Prepare Numbered Corporate Document', 'নতুন নম্বরযুক্ত কর্পোরেট নথি প্রস্তুত করুন')}
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              {bi('Auto-numbered on save', 'সংরক্ষণে স্বয়ংক্রিয় নম্বর')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Document Type', 'নথির ধরন')}
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {docTypeLabel(dt)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Issue Date', 'ইস্যুর তারিখ')}
              </label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Due / Valid Until Date', 'মেয়াদ / পরিশোধের শেষ তারিখ')}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Client / Party Name (EN)', 'গ্রাহক / প্রাপকের নাম (ইংরেজি)')}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Meghna FinTech PLC"
                value={partyNameEn}
                onChange={(e) => setPartyNameEn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Client / Party Name (BN)', 'গ্রাহক / প্রাপকের নাম (বাংলা)')}
              </label>
              <input
                type="text"
                placeholder="যেমন: মেঘনা ফিনটেক পিএলসি"
                value={partyNameBn}
                onChange={(e) => setPartyNameBn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Client / Party Address', 'প্রাপকের ঠিকানা')}
              </label>
              <input
                type="text"
                placeholder="e.g. Motijheel C/A, Dhaka"
                value={partyAddress}
                onChange={(e) => setPartyAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Subject / Billing Milestone (EN)', 'বিষয় / বিলিং বিবরণ (ইংরেজি)')}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Custom ERP Phase-1 Delivery & Cloud Deployment"
                value={subjectEn}
                onChange={(e) => setSubjectEn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {bi('Settlement Mode', 'পরিশোধ মাধ্যম')}
              </label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {docType === 'letterhead' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Letter Body (English)', 'পত্রের মূল বক্তব্য (ইংরেজি)')}
                </label>
                <textarea
                  rows={5}
                  required
                  value={bodyEn}
                  onChange={(e) => setBodyEn(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {bi('Letter Body (Bangla)', 'পত্রের মূল বক্তব্য (বাংলা)')}
                </label>
                <textarea
                  rows={5}
                  value={bodyBn}
                  onChange={(e) => setBodyBn(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="text-xs font-semibold text-slate-700">
                {bi('Service / Deliverable Line Items', 'সার্ভিস ও আইটেম তালিকা')}
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    required
                    placeholder="Service / Deliverable description (EN)"
                    value={it.description_en}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x, i) => (i === idx ? {...x, description_en: e.target.value} : x)))
                    }
                    className="sm:col-span-5 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="বিবরণ (বাংলা)"
                    value={it.description_bn}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x, i) => (i === idx ? {...x, description_bn: e.target.value} : x)))
                    }
                    className="sm:col-span-3 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={it.quantity}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x, i) => (i === idx ? {...x, quantity: e.target.value} : x)))
                    }
                    className="sm:col-span-1 px-2.5 py-2 text-xs font-mono tabular-nums text-right border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={it.unit_price}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x, i) => (i === idx ? {...x, unit_price: e.target.value} : x)))
                    }
                    className="sm:col-span-2 px-2.5 py-2 text-xs font-mono tabular-nums text-right border border-slate-300 rounded-lg"
                  />
                  <div className="sm:col-span-1 text-right">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      {description_en: '', description_bn: '', quantity: '1.00', unit_price: '0.00'},
                    ])
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{bi('Add Line', 'লাইন যুক্ত করুন')}</span>
                </button>

                <div className="flex items-center gap-3">
                  <div>
                    <label className="text-xs text-slate-600 mr-1.5">{bi('Discount (BDT)', 'ছাড়')}:</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="w-28 px-2.5 py-1.5 text-xs font-mono tabular-nums text-right border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 mr-1.5">{bi('VAT / Tax (%)', 'কর (%)')}:</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums text-right border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-amber-800 text-white rounded-lg hover:bg-amber-900 cursor-pointer"
            >
              {bi('Generate Numbered Document', 'নম্বরসহ নথি তৈরি করুন')}
            </button>
          </div>
        </form>
      )}

      {/* Template Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-amber-100/70 rounded-lg overflow-x-auto w-fit max-w-full no-print">
        <button
          type="button"
          onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            typeFilter === 'all' ? 'bg-amber-900 text-white' : 'text-amber-950 hover:bg-amber-200/60'
          }`}
        >
          {bi('All Documents', 'সকল নথি')} ({docs.length})
        </button>
        {DOC_TYPES.map((dt) => (
          <button
            key={dt}
            type="button"
            onClick={() => setTypeFilter(dt)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              typeFilter === dt ? 'bg-amber-900 text-white' : 'text-amber-950 hover:bg-amber-200/60'
            }`}
          >
            {docTypeLabel(dt)}
          </button>
        ))}
      </div>

      {/* Fresh Zero-Document Empty State OR Split Document Register + Live A4 Preview */}
      {!loading && docs.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6 no-print">
          <div className="max-w-xl space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              {bi('0 Commercial Documents Issued Yet', 'এখনও কোনো বাণিজ্যিক নথি ইস্যু করা হয়নি (০)')}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {bi(
                'Your company document register starts cleanly from sequence 0001. Choose any official template below to issue your first Invoice, Quotation, Money Receipt, Payment Voucher, or Official Letterhead.',
                'আপনার কোম্পানির নথি রেজিস্টার ০00১ ক্রম হতে প্রস্তুত। নিচের যেকোনো টেমপ্লেট নির্বাচন করে প্রথম নথি তৈরি করুন।',
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt}
                type="button"
                disabled={!canCreate}
                onClick={() => startTemplateCreation(dt)}
                className="text-left p-4 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition-colors space-y-2 cursor-pointer disabled:opacity-50"
              >
                <FilePlus2 className="w-5 h-5 text-amber-800" />
                <div className="text-xs font-bold text-slate-900">{docTypeLabel(dt)}</div>
                <div className="text-xs text-slate-500">
                  {dt === 'invoice'
                    ? bi('Client billing · AR 1110', 'গ্রাহক বিলিং · প্রাপ্য')
                    : dt === 'receipt'
                      ? bi('Payment collection · Bank', 'অর্থ প্রাপ্তি রসিদ')
                      : dt === 'payment_voucher'
                        ? bi('Expense settlement', 'খরচ পরিশোধ ভাউচার')
                        : dt === 'quotation'
                          ? bi('Client proposal', 'সফটওয়্যার কোটেশন')
                          : bi('Corporate correspondence', 'অফিসিয়াল পত্র')}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 no-print">
            {loading ? (
              <div className="p-6 text-xs text-slate-500 text-center">
                {bi('Loading documents...', 'নথি লোড হচ্ছে...')}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 text-center">
                {bi('No documents in this category.', 'এই শ্রেণিতে কোনো নথি নেই।')}
              </div>
            ) : (
              filteredDocs.map((d) => {
                const selected = activeDoc?.id === d.id;
                return (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDocId(d.id)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      selected ? 'bg-amber-950 text-white' : 'hover:bg-amber-50/50 text-slate-900'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold">{d.doc_number}</span>
                        <span className={`font-mono text-xs ${selected ? 'text-amber-200' : 'text-slate-500'}`}>
                          {d.issue_date}
                        </span>
                      </div>
                      <div className="text-sm font-medium mt-1 truncate">
                        {bi(d.party_name_en, d.party_name_bn) || docTypeLabel(d.doc_type)}
                      </div>
                      <div
                        className={`text-xs mt-1 flex items-center justify-between ${
                          selected ? 'text-amber-300' : 'text-slate-500'
                        }`}
                      >
                        <span>
                          {docTypeLabel(d.doc_type)}
                          {d.linked_journal_id ? ` · ${bi('Ledger Posted', 'লেজারে পোস্টকৃত')}` : ''}
                        </span>
                        {d.doc_type !== 'letterhead' && (
                          <span className="font-mono tabular-nums font-semibold">
                            {d.currency} {formatMoney(d.grand_total)}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        printColorfulHtml(buildBusinessDocumentHtml(d, company));
                      }}
                      title="Direct Print"
                      className={`p-2 rounded-lg shrink-0 cursor-pointer ${
                        selected
                          ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </aside>

          {/* Live A4 Preview Sheet */}
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden print-only-sheet">
            {activeDoc ? (
              <div>
                <div className="h-2 bg-gradient-to-r from-amber-600 via-orange-500 to-teal-500" />

                <div
                  className={`bg-gradient-to-r ${activeVisual.headerGrad} text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6`}
                >
                  <div className="flex items-center gap-4">
                    <img
                      src={company?.logo_url || COMPANY_LOGO_URL}
                      alt="NEXTGEN TECHNIX LIMITED Emblem"
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-white/90 bg-white shrink-0"
                    />
                    <div className="space-y-0.5">
                      <h2 className="text-xl font-bold tracking-tight">{corp.name_en}</h2>
                      <div className="text-sm font-semibold text-white/95">{corp.name_bn}</div>
                      <div className="text-xs font-semibold text-amber-300">{corp.tagline_en}</div>
                      <p className="text-xs text-white/80 max-w-md pt-0.5">{corp.address_en}</p>
                    </div>
                  </div>

                  <div className="sm:text-right bg-white/15 border border-white/25 rounded-xl p-3.5 shrink-0">
                    <div className="text-sm font-bold text-amber-300">{activeVisual.en}</div>
                    <div className="text-xs font-semibold text-white/95">{activeVisual.bn}</div>
                    <div className="pt-2 text-xs font-mono font-bold text-white">No: {activeDoc.doc_number}</div>
                    <div className="text-xs font-mono text-white/85">Date: {activeDoc.issue_date}</div>
                    {activeDoc.due_date && (
                      <div className="text-xs font-mono text-white/85">Valid / Due: {activeDoc.due_date}</div>
                    )}
                  </div>
                </div>

                {/* Reg/TIN/BIN Metadata Bar */}
                <div className="px-8 py-2 bg-slate-100 border-b border-slate-200 flex flex-wrap justify-between gap-2 text-xs font-mono text-slate-600">
                  <span>
                    Reg: {corp.registration_no} · TIN: {corp.tin_no} · BIN: {corp.bin_no}
                  </span>
                  <span>
                    {corp.phone} · {corp.email}
                  </span>
                </div>

                {/* Accounting Sync Status Bar (Screen Only) */}
                {isPostableDoc && (
                  <div className="px-8 py-2.5 bg-amber-50/60 border-b border-amber-200/80 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
                    {activeDoc.linked_journal_id ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-800 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {bi(
                            `Linked to Double-Entry General Ledger (Journal ID #${activeDoc.linked_journal_id})`,
                            `ডাবল-এন্ট্রি জেনারেল লেজারের সাথে সংযুক্ত (জার্নাল #${activeDoc.linked_journal_id})`,
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        {bi(
                          'Not yet posted to General Ledger. Click "Post to General Ledger" to record accounting entries.',
                          'এখনও জেনারেল লেজারে পোস্ট করা হয়নি। হিসাবভুক্ত করতে "লেজারে পোস্ট করুন" বাটনে ক্লিক করুন।',
                        )}
                      </span>
                    )}
                  </div>
                )}

                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className={`p-4 rounded-xl border ${activeVisual.softBox} space-y-1`}>
                      <div className="text-slate-500 font-semibold">
                        {activeDoc.doc_type === 'payment_voucher'
                          ? 'Payee / প্রাপক'
                          : activeDoc.doc_type === 'receipt'
                            ? 'Received From / প্রদানকারী'
                            : 'Client / গ্রাহক'}
                      </div>
                      <div className="text-sm font-bold text-slate-900">{activeDoc.party_name_en}</div>
                      {activeDoc.party_name_bn && <div className="text-slate-700">{activeDoc.party_name_bn}</div>}
                      {activeDoc.party_address && <div className="text-slate-600">{activeDoc.party_address}</div>}
                    </div>

                    <div className={`p-4 rounded-xl border ${activeVisual.softBox} sm:text-right space-y-1`}>
                      <div className="text-slate-500 font-semibold">Settlement &amp; Reference / পরিশোধ তথ্য</div>
                      <div className="text-sm font-bold text-slate-900">{activeDoc.payment_method}</div>
                      <div className="font-mono text-slate-600">Currency / মুদ্রা: {activeDoc.currency}</div>
                    </div>
                  </div>

                  {(activeDoc.subject_en || activeDoc.subject_bn) && (
                    <div className={`py-2.5 px-4 rounded-xl border ${activeVisual.softBox} text-xs`}>
                      <span className="font-bold text-slate-900">Subject / বিষয়: </span>
                      <span className="text-slate-800">{activeDoc.subject_en}</span>
                      {activeDoc.subject_bn && <span className="text-slate-600"> · {activeDoc.subject_bn}</span>}
                    </div>
                  )}

                  {activeDoc.doc_type === 'letterhead' ? (
                    <div className="space-y-5 py-4 text-sm text-slate-800 leading-relaxed">
                      <div className="whitespace-pre-line">{activeDoc.body_en}</div>
                      {activeDoc.body_bn && (
                        <div className="whitespace-pre-line pt-4 border-t border-slate-200 text-slate-700">
                          {activeDoc.body_bn}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <table className="w-full text-xs border-collapse border border-slate-300">
                        <thead>
                          <tr className={activeVisual.tableHead}>
                            <th className="py-2.5 px-3 text-left w-10">#</th>
                            <th className="py-2.5 px-3 text-left">Description / বিবরণ</th>
                            <th className="py-2.5 px-3 text-right w-20">Qty</th>
                            <th className="py-2.5 px-3 text-right w-32">Rate ({activeDoc.currency})</th>
                            <th className="py-2.5 px-3 text-right w-36">Amount ({activeDoc.currency})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeDoc.items.map((item, idx) => (
                            <tr key={item.id || idx} className="even:bg-slate-50">
                              <td className="border border-slate-200 py-2.5 px-3 font-mono text-slate-600">
                                {idx + 1}
                              </td>
                              <td className="border border-slate-200 py-2.5 px-3">
                                <div className="font-semibold text-slate-900">{item.description_en}</div>
                                {item.description_bn && (
                                  <div className="text-slate-600 mt-0.5">{item.description_bn}</div>
                                )}
                              </td>
                              <td className="border border-slate-200 py-2.5 px-3 text-right font-mono tabular-nums">
                                {formatMoney(item.quantity)}
                              </td>
                              <td className="border border-slate-200 py-2.5 px-3 text-right font-mono tabular-nums">
                                {formatMoney(item.unit_price)}
                              </td>
                              <td className="border border-slate-200 py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                                {formatMoney(item.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={4} className="border border-slate-200 py-2 px-3 text-right text-slate-600">
                              Subtotal / উপমোট
                            </td>
                            <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums">
                              {formatMoney(activeDoc.subtotal)}
                            </td>
                          </tr>
                          {Number(activeDoc.discount_amount) > 0 && (
                            <tr>
                              <td colSpan={4} className="border border-slate-200 py-2 px-3 text-right text-slate-600">
                                Discount / ছাড়
                              </td>
                              <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums">
                                -{formatMoney(activeDoc.discount_amount)}
                              </td>
                            </tr>
                          )}
                          {Number(activeDoc.tax_rate_percent) > 0 && (
                            <tr>
                              <td colSpan={4} className="border border-slate-200 py-2 px-3 text-right text-slate-600">
                                VAT / Tax ({activeDoc.tax_rate_percent}%) / কর
                              </td>
                              <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums">
                                {formatMoney(activeDoc.tax_amount)}
                              </td>
                            </tr>
                          )}
                          <tr className={`${activeVisual.tableHead} font-bold`}>
                            <td colSpan={4} className="py-2.5 px-3 text-right">
                              Grand Total / সর্বমোট ({activeDoc.currency})
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sm">
                              {formatMoney(activeDoc.grand_total)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className={`p-3 rounded-xl border ${activeVisual.softBox} text-xs text-slate-800`}>
                        <span className="font-bold">Amount in Words: </span>
                        <span>{amountToWordsEn(activeDoc.grand_total)}</span>
                      </div>
                    </div>
                  )}

                  <div className="pt-10 grid grid-cols-3 gap-6 text-center text-xs text-slate-700">
                    <div className="border-t-2 border-slate-800 pt-2">
                      <div className="font-bold text-slate-900">Prepared By</div>
                      <div className="text-slate-500">প্রস্তুতকারক</div>
                    </div>
                    <div className="border-t-2 border-slate-800 pt-2">
                      <div className="font-bold text-slate-900">Checked &amp; Verified</div>
                      <div className="text-slate-500">হিসাব ও নিরীক্ষা</div>
                    </div>
                    <div className="border-t-2 border-slate-800 pt-2">
                      <div className="font-bold text-slate-900">Authorized Signatory</div>
                      <div className="text-slate-500">অনুমোদিত স্বাক্ষর</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                {bi('Select a document from the left list to preview and print.', 'প্রিন্ট প্রিভিউ দেখতে বাম পাশের তালিকা থেকে একটি নথি নির্বাচন করুন।')}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
