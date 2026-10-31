import companyLogoAsset from '../assets/images/nextgen_technix_logo_1793421684643.jpg';
import companyHqAsset from '../assets/images/nextgen_technix_software_hq_1793421686128.jpg';
import companyWorkspaceAsset from '../assets/images/payroll_office_banner_1793172400956.jpg';
import {amountToWordsEn, formatMoney} from '../i18n';
import {installBrowserExtensionFetchGuard} from './browserExtensionGuard';
import {
  Account,
  AttendanceRow,
  BusinessDocument,
  CompanyProfile,
  DocType,
  FinancialStatementsReport,
  GeneralLedgerReport,
  JournalEntry,
  MonthlyAttendanceSummary,
  SalaryPayment,
  SoftwareProject,
  VerifiedTrialBalance,
} from '../types';

export const COMPANY_LOGO_URL = companyLogoAsset;
export const COMPANY_HQ_URL = companyHqAsset;
export const COMPANY_WORKSPACE_URL = companyWorkspaceAsset;

export interface PrintColorTheme {
  primary: string;
  secondary: string;
  softBg: string;
  borderTint: string;
  badgeBg: string;
  accentGold: string;
}

export const PRINT_THEMES: Record<string, PrintColorTheme> = {
  letterhead: {
    primary: '#0f172a',
    secondary: '#1d4ed8',
    softBg: '#eff6ff',
    borderTint: '#bfdbfe',
    badgeBg: '#1e3a8a',
    accentGold: '#f59e0b',
  },
  payment_voucher: {
    primary: '#9f1239',
    secondary: '#d97706',
    softBg: '#fff1f2',
    borderTint: '#fecdd3',
    badgeBg: '#881337',
    accentGold: '#fbbf24',
  },
  receipt: {
    primary: '#065f46',
    secondary: '#0d9488',
    softBg: '#ecfdf5',
    borderTint: '#a7f3d0',
    badgeBg: '#064e3b',
    accentGold: '#34d399',
  },
  quotation: {
    primary: '#5b21b6',
    secondary: '#0891b2',
    softBg: '#f5f3ff',
    borderTint: '#ddd6fe',
    badgeBg: '#4c1d95',
    accentGold: '#38bdf8',
  },
  invoice: {
    primary: '#1e40af',
    secondary: '#4338ca',
    softBg: '#eef2ff',
    borderTint: '#c7d2fe',
    badgeBg: '#1e3a8a',
    accentGold: '#f59e0b',
  },
  payslip: {
    primary: '#1e3a8a',
    secondary: '#0d9488',
    softBg: '#f0fdfa',
    borderTint: '#99f6e4',
    badgeBg: '#115e59',
    accentGold: '#fbbf24',
  },
  salary_sheet: {
    primary: '#3b0764',
    secondary: '#1d4ed8',
    softBg: '#faf5ff',
    borderTint: '#e9d5ff',
    badgeBg: '#4c1d95',
    accentGold: '#f59e0b',
  },
  attendance: {
    primary: '#115e59',
    secondary: '#0284c7',
    softBg: '#f0f9ff',
    borderTint: '#bae6fd',
    badgeBg: '#0f766e',
    accentGold: '#38bdf8',
  },
  accounting: {
    primary: '#1e3a8a',
    secondary: '#2563eb',
    softBg: '#eff6ff',
    borderTint: '#bfdbfe',
    badgeBg: '#1e40af',
    accentGold: '#f59e0b',
  },
  financials: {
    primary: '#0f172a',
    secondary: '#047857',
    softBg: '#ecfdf5',
    borderTint: '#a7f3d0',
    badgeBg: '#065f46',
    accentGold: '#10b981',
  },
  projects: {
    primary: '#4c1d95',
    secondary: '#7c3aed',
    softBg: '#f5f3ff',
    borderTint: '#ddd6fe',
    badgeBg: '#5b21b6',
    accentGold: '#38bdf8',
  },
};

function esc(raw: string | number | null | undefined): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAbsoluteLogoUrl(company?: CompanyProfile | null): string {
  const src = company?.logo_url || COMPANY_LOGO_URL;
  try {
    return new URL(src, window.location.origin).href;
  } catch {
    return src;
  }
}

function fallbackCompany(company?: CompanyProfile | null) {
  return (
    company || {
      name_en: 'NEXTGEN TECHNIX LIMITED',
      name_bn: 'নেক্সটজেন টেকনিক্স লিমিটেড',
      tagline_en: 'Premier IT Company & Custom Software Engineering Studio · Enterprise ERP',
      tagline_bn: 'শীর্ষস্থানীয় আইটি ও সফটওয়্যার নির্মাতা প্রতিষ্ঠান · এন্টারপ্রাইজ ইআরপি',
      registration_no: 'RJSC-C-194820',
      tin_no: '519-842-7710',
      bin_no: '004918273-0101',
      address_en: 'Level 9, Plot 42, Gulshan Avenue, Dhaka-1212, Bangladesh',
      address_bn: 'লেভেল ৯, প্লট ৪২, গুলশান অ্যাভিনিউ, ঢাকা-১২১২, বাংলাদেশ',
      phone: '+880 2-2222-84910',
      email: 'info@nextgentechnix.com',
      website: 'https://www.nextgentechnix.com',
      currency: 'BDT',
    }
  );
}

function wrapColorfulPrintShell(opts: {
  pageTitle: string;
  docTitleEn: string;
  docTitleBn: string;
  docRef: string;
  docDate: string;
  extraMeta?: string;
  theme: PrintColorTheme;
  company?: CompanyProfile | null;
  bodyHtml: string;
  landscape?: boolean;
}): string {
  const corp = fallbackCompany(opts.company);
  const logoHref = getAbsoluteLogoUrl(opts.company);
  const pageSize = opts.landscape ? 'A4 landscape' : 'A4 portrait';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <script>
    (function(){try{var d=Object.getOwnPropertyDescriptor(window,'fetch');if(d&&typeof d.get==='function'&&typeof d.set!=='function'&&d.configurable!==false){var g=d.get,o=null;Object.defineProperty(window,'fetch',{configurable:true,enumerable:true,get:function(){return o||g.call(window);},set:function(fn){if(typeof fn==='function')o=fn;}});}}catch(_){}})();
  </script>
  <title>${esc(opts.pageTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+Bengali:wght@400;600;700&family=Plus+Jakarta+Sans:wght@600;700&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    @page {
      size: ${pageSize};
      margin: 10mm;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: "Public Sans", "Noto Sans Bengali", sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.5;
    }
    .sheet {
      width: 100%;
      border: 1.5px solid ${opts.theme.borderTint};
      border-radius: 12px;
      overflow: hidden;
      background: #ffffff;
    }
    .brand-ribbon {
      height: 7px;
      background: linear-gradient(90deg, ${opts.theme.primary}, ${opts.theme.secondary}, ${opts.theme.accentGold});
    }
    .header-band {
      background: linear-gradient(135deg, ${opts.theme.primary} 0%, ${opts.theme.secondary} 100%);
      color: #ffffff;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }
    .corp-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .corp-logo {
      width: 64px;
      height: 64px;
      border-radius: 12px;
      object-fit: cover;
      border: 2px solid rgba(255, 255, 255, 0.85);
      background: #ffffff;
      flex-shrink: 0;
    }
    .corp-title-en {
      font-family: "Plus Jakarta Sans", sans-serif;
      font-size: 19px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .corp-title-bn {
      font-size: 14px;
      font-weight: 600;
      opacity: 0.95;
      margin-top: 2px;
    }
    .corp-sub {
      font-size: 10.5px;
      opacity: 0.88;
      margin-top: 4px;
    }
    .doc-badge-box {
      text-align: right;
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 10px;
      padding: 10px 14px;
      min-width: 205px;
    }
    .doc-type-en {
      font-family: "Plus Jakarta Sans", sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .doc-type-bn {
      font-size: 11.5px;
      opacity: 0.95;
      margin-top: 1px;
    }
    .doc-meta-mono {
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      margin-top: 6px;
      font-weight: 600;
    }
    .reg-strip {
      background: ${opts.theme.softBg};
      border-bottom: 1px solid ${opts.theme.borderTint};
      padding: 7px 24px;
      font-family: "IBM Plex Mono", monospace;
      font-size: 10px;
      color: #334155;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .content-pad {
      padding: 20px 24px 24px;
    }
    table.colorful-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 11.5px;
    }
    table.colorful-table thead tr {
      background: linear-gradient(90deg, ${opts.theme.primary}, ${opts.theme.secondary});
      color: #ffffff;
    }
    table.colorful-table th {
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      border: 1px solid ${opts.theme.primary};
    }
    table.colorful-table td {
      padding: 7px 10px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
    }
    table.colorful-table tbody tr:nth-child(even) {
      background: ${opts.theme.softBg};
    }
    table.colorful-table tfoot tr.grand-row {
      background: ${opts.theme.primary};
      color: #ffffff;
      font-weight: 700;
    }
    table.colorful-table tfoot tr.grand-row td {
      border-color: ${opts.theme.primary};
      padding: 9px 10px;
    }
    .mono {
      font-family: "IBM Plex Mono", monospace;
      font-variant-numeric: tabular-nums;
    }
    .num {
      text-align: right;
      font-family: "IBM Plex Mono", monospace;
      font-variant-numeric: tabular-nums;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 14px;
    }
    .info-card {
      background: ${opts.theme.softBg};
      border: 1px solid ${opts.theme.borderTint};
      border-radius: 8px;
      padding: 10px 14px;
    }
    .callout-words {
      margin-top: 12px;
      padding: 9px 14px;
      border-radius: 8px;
      background: ${opts.theme.softBg};
      border: 1px solid ${opts.theme.borderTint};
      font-size: 11.5px;
      color: #0f172a;
    }
    .sig-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 28px;
      margin-top: 44px;
      text-align: center;
      font-size: 11px;
    }
    .sig-box {
      border-top: 1.5px solid ${opts.theme.primary};
      padding-top: 6px;
    }
    .footer-band {
      background: #0f172a;
      color: #cbd5e1;
      padding: 8px 24px;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand-ribbon"></div>
    <div class="header-band">
      <div class="corp-left">
        <img class="corp-logo" src="${esc(logoHref)}" alt="NEXTGEN TECHNIX LIMITED Logo" />
        <div>
          <h1 class="corp-title-en">${esc(corp.name_en)}</h1>
          <div class="corp-title-bn">${esc(corp.name_bn)}</div>
          <div class="corp-sub" style="font-weight:600;color:#fde68a;">${esc(corp.tagline_en || 'Premier IT Company & Custom Software Engineering Studio')}</div>
          <div class="corp-sub">${esc(corp.address_en)}</div>
          <div class="corp-sub">${esc(corp.address_bn)}</div>
        </div>
      </div>
      <div class="doc-badge-box">
        <div class="doc-type-en">${esc(opts.docTitleEn)}</div>
        <div class="doc-type-bn">${esc(opts.docTitleBn)}</div>
        <div class="doc-meta-mono">${esc(opts.docRef)}</div>
        <div style="font-size:10.5px;margin-top:2px;">Date: ${esc(opts.docDate)}</div>
        ${opts.extraMeta ? `<div style="font-size:10px;opacity:0.9;">${esc(opts.extraMeta)}</div>` : ''}
      </div>
    </div>
    <div class="reg-strip">
      <span>RJSC Reg: ${esc(corp.registration_no)} · TIN: ${esc(corp.tin_no)} · BIN: ${esc(corp.bin_no)}</span>
      <span>${esc(corp.phone)} · ${esc(corp.email)}</span>
    </div>
    <div class="content-pad">
      ${opts.bodyHtml}
      <div class="sig-row">
        <div class="sig-box">
          <strong>Prepared By</strong><br/>প্রস্তুতকারক
        </div>
        <div class="sig-box">
          <strong>Accounts &amp; HR Verified</strong><br/>হিসাব ও মানবসম্পদ যাচাই
        </div>
        <div class="sig-box">
          <strong>Authorized Signatory</strong><br/>অনুমোদিত স্বাক্ষর
        </div>
      </div>
    </div>
    <div class="footer-band">
      <span>${esc(corp.name_en)} · Premier IT &amp; Custom Software Engineering Company</span>
      <span>Official Corporate ERP Record · ${esc(corp.website || 'www.nextgentechnix.com')}</span>
    </div>
  </div>
</body>
</html>`;
}

export function printColorfulHtml(htmlDocument: string): void {
  const frameId = 'ng-erp-colorful-print-frame';
  let iframe = document.getElementById(frameId) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = frameId;
    iframe.title = 'Colorful Print Preview Frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    window.print();
    return;
  }

  if (iframe.contentWindow) {
    installBrowserExtensionFetchGuard(iframe.contentWindow);
  }
  doc.open();
  doc.write(htmlDocument);
  doc.close();
  if (iframe.contentWindow) {
    installBrowserExtensionFetchGuard(iframe.contentWindow);
  }

  const win = iframe.contentWindow;
  let printed = false;
  const trigger = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      window.print();
    }
  };

  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0 || imgs.every((img) => img.complete)) {
    setTimeout(trigger, 180);
  } else {
    let remaining = imgs.length;
    const onDone = () => {
      remaining -= 1;
      if (remaining <= 0) {
        setTimeout(trigger, 120);
      }
    };
    imgs.forEach((img) => {
      if (img.complete) {
        onDone();
      } else {
        img.addEventListener('load', onDone, {once: true});
        img.addEventListener('error', onDone, {once: true});
      }
    });
    setTimeout(trigger, 700);
  }
}

export function downloadColorfulHtml(htmlDocument: string, filename: string): void {
  const blob = new Blob([htmlDocument], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const downloadStandaloneHtml = downloadColorfulHtml;

export function buildBusinessDocumentHtml(
  doc: BusinessDocument,
  company?: CompanyProfile | null,
): string {
  const titles: Record<DocType, {en: string; bn: string; partyLabel: string}> = {
    letterhead: {en: 'Official Letterhead', bn: 'অফিসিয়াল লেটারহেড', partyLabel: 'Recipient / প্রাপক'},
    payment_voucher: {en: 'Payment Voucher', bn: 'পেমেন্ট ভাউচার', partyLabel: 'Payee / প্রাপক'},
    receipt: {en: 'Money Receipt', bn: 'মানি রসিদ', partyLabel: 'Received From / প্রদানকারী'},
    quotation: {en: 'Commercial Quotation', bn: 'ব্যবসায়িক কোটেশন', partyLabel: 'Client / গ্রাহক'},
    invoice: {en: 'Service Invoice', bn: 'সার্ভিস ইনভয়েস / চালান', partyLabel: 'Billed To / গ্রাহক'},
  };
  const meta = titles[doc.doc_type] || titles.invoice;
  const theme = PRINT_THEMES[doc.doc_type] || PRINT_THEMES.invoice;

  const subjectHtml =
    doc.subject_en || doc.subject_bn
      ? `<div class="callout-words" style="margin-top:0;margin-bottom:14px;">
          <strong>Subject / বিষয়:</strong> ${esc(doc.subject_en)}
          ${doc.subject_bn ? ` · ${esc(doc.subject_bn)}` : ''}
        </div>`
      : '';

  const mainSection =
    doc.doc_type === 'letterhead'
      ? `<div style="padding:14px 4px;white-space:pre-line;font-size:13px;line-height:1.7;">${esc(doc.body_en)}${
          doc.body_bn
            ? `<hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0;" /><div>${esc(doc.body_bn)}</div>`
            : ''
        }</div>`
      : `<table class="colorful-table">
          <thead>
            <tr>
              <th style="width:42px;">#</th>
              <th>Description / বিবরণ</th>
              <th style="width:74px;text-align:right;">Qty</th>
              <th style="width:120px;text-align:right;">Rate (${esc(doc.currency)})</th>
              <th style="width:130px;text-align:right;">Amount (${esc(doc.currency)})</th>
            </tr>
          </thead>
          <tbody>
            ${doc.items
              .map(
                (it, idx) => `<tr>
                  <td class="mono">${idx + 1}</td>
                  <td>
                    <strong>${esc(it.description_en)}</strong>
                    ${it.description_bn ? `<div style="color:#475569;font-size:11px;">${esc(it.description_bn)}</div>` : ''}
                  </td>
                  <td class="num">${formatMoney(it.quantity)}</td>
                  <td class="num">${formatMoney(it.unit_price)}</td>
                  <td class="num"><strong>${formatMoney(it.amount)}</strong></td>
                </tr>`,
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right;">Subtotal / উপমোট</td>
              <td class="num">${formatMoney(doc.subtotal)}</td>
            </tr>
            ${
              Number(doc.discount_amount) > 0
                ? `<tr>
                    <td colspan="4" style="text-align:right;">Discount / ছাড়</td>
                    <td class="num">-${formatMoney(doc.discount_amount)}</td>
                  </tr>`
                : ''
            }
            ${
              Number(doc.tax_rate_percent) > 0
                ? `<tr>
                    <td colspan="4" style="text-align:right;">VAT / Tax (${esc(doc.tax_rate_percent)}%)</td>
                    <td class="num">${formatMoney(doc.tax_amount)}</td>
                  </tr>`
                : ''
            }
            <tr class="grand-row">
              <td colspan="4" style="text-align:right;">Grand Total / সর্বমোট (${esc(doc.currency)})</td>
              <td class="num">${formatMoney(doc.grand_total)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="callout-words">
          <strong>Amount in Words:</strong> ${esc(amountToWordsEn(doc.grand_total))}
        </div>`;

  const bodyHtml = `
    <div class="info-grid">
      <div class="info-card">
        <div style="font-size:10.5px;color:#475569;font-weight:600;">${esc(meta.partyLabel)}</div>
        <div style="font-size:13.5px;font-weight:700;margin-top:2px;">${esc(doc.party_name_en)}</div>
        ${doc.party_name_bn ? `<div style="font-size:12px;color:#334155;">${esc(doc.party_name_bn)}</div>` : ''}
        ${doc.party_address ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${esc(doc.party_address)}</div>` : ''}
      </div>
      <div class="info-card" style="text-align:right;">
        <div style="font-size:10.5px;color:#475569;font-weight:600;">Settlement Mode / পরিশোধ মাধ্যম</div>
        <div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(doc.payment_method)}</div>
        <div class="mono" style="font-size:11px;color:#334155;margin-top:3px;">Currency: ${esc(doc.currency)} · Status: ${esc(doc.status.toUpperCase())}</div>
      </div>
    </div>
    ${subjectHtml}
    ${mainSection}
  `;

  return wrapColorfulPrintShell({
    pageTitle: `${doc.doc_number} - ${meta.en}`,
    docTitleEn: meta.en,
    docTitleBn: meta.bn,
    docRef: `No: ${doc.doc_number}`,
    docDate: doc.issue_date,
    extraMeta: doc.due_date ? `Valid / Due: ${doc.due_date}` : undefined,
    theme,
    company,
    bodyHtml,
  });
}

export function buildSalaryPayslipHtml(
  slip: SalaryPayment,
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.payslip;
  const totalEarnings =
    Number(slip.gross_salary) + Number(slip.overtime_pay) + Number(slip.bonus_amount);

  const bodyHtml = `
    <div class="info-grid">
      <div class="info-card">
        <div style="font-size:10.5px;color:#0f766e;font-weight:700;">EMPLOYEE DETAILS · কর্মীর তথ্য</div>
        <div style="font-size:14px;font-weight:700;margin-top:3px;">${esc(slip.full_name_en)} <span class="mono" style="font-size:11.5px;color:#0f766e;">(${esc(slip.emp_code)})</span></div>
        ${slip.full_name_bn ? `<div style="font-size:12px;">${esc(slip.full_name_bn)}</div>` : ''}
        <div style="font-size:11px;color:#334155;margin-top:3px;">${esc(slip.designation_en)} · ${esc(slip.department)}</div>
      </div>
      <div class="info-card" style="text-align:right;">
        <div style="font-size:10.5px;color:#1e3a8a;font-weight:700;">ATTENDANCE &amp; PAYMENT · উপস্থিতি ও পরিশোধ</div>
        <div class="mono" style="font-size:12px;font-weight:700;margin-top:3px;">Salary Month: ${esc(slip.salary_month)} · Status: ${esc(slip.status.toUpperCase())}</div>
        <div style="font-size:11px;color:#334155;margin-top:3px;">
          Present: <strong>${slip.present_days}</strong> · Late: <strong>${slip.late_days}</strong> · Leave: <strong>${slip.leave_days}</strong> · Absent: <strong>${slip.absent_days}</strong> · OT: <strong>${formatMoney(slip.overtime_hours)}h</strong>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">
          Mode: ${esc(slip.payment_method)} ${slip.bank_account_no ? `· A/C: ${esc(slip.bank_account_no)}` : ''}
        </div>
      </div>
    </div>

    <table class="colorful-table">
      <thead>
        <tr>
          <th>Earnings Breakdown / আয়ের বিবরণ</th>
          <th style="width:140px;text-align:right;">Amount (BDT)</th>
          <th>Deductions / কর্তন বিবরণ</th>
          <th style="width:140px;text-align:right;">Amount (BDT)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Basic Salary / মূল বেতন</td>
          <td class="num">${formatMoney(slip.basic_salary)}</td>
          <td>Absent / Half-Day Deduction / অনুপস্থিতি কর্তন</td>
          <td class="num">${formatMoney(slip.absent_deduction)}</td>
        </tr>
        <tr>
          <td>House Rent Allowance / বাড়ি ভাড়া ভাতা</td>
          <td class="num">${formatMoney(slip.house_rent)}</td>
          <td>Salary Advance Recovery / অগ্রিম সমন্বয়</td>
          <td class="num">${formatMoney(slip.advance_deduction)}</td>
        </tr>
        <tr>
          <td>Medical Allowance / চিকিৎসা ভাতা</td>
          <td class="num">${formatMoney(slip.medical_allowance)}</td>
          <td>Income Tax (TDS) / আয়কর কর্তন</td>
          <td class="num">${formatMoney(slip.tax_deduction)}</td>
        </tr>
        <tr>
          <td>Transport Allowance / যাতায়াত ভাতা</td>
          <td class="num">${formatMoney(slip.transport_allowance)}</td>
          <td>—</td>
          <td class="num">0.00</td>
        </tr>
        <tr>
          <td>Overtime Pay (${formatMoney(slip.overtime_hours)} hrs) / ওভারটাইম ভাতা</td>
          <td class="num">${formatMoney(slip.overtime_pay)}</td>
          <td>—</td>
          <td class="num">0.00</td>
        </tr>
        <tr>
          <td>Festival / Performance Bonus / বোনাস</td>
          <td class="num">${formatMoney(slip.bonus_amount)}</td>
          <td>—</td>
          <td class="num">0.00</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="font-weight:700;background:#e2e8f0;">
          <td>Total Gross Earnings / মোট আয়</td>
          <td class="num">${formatMoney(totalEarnings)}</td>
          <td>Total Deductions / মোট কর্তন</td>
          <td class="num">${formatMoney(slip.total_deductions)}</td>
        </tr>
        <tr class="grand-row">
          <td colspan="3" style="text-align:right;">NET PAYABLE SALARY / নিট প্রদেয় বেতন (BDT)</td>
          <td class="num" style="font-size:14px;">${formatMoney(slip.net_payable)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="callout-words">
      <strong>Net Salary in Words:</strong> ${esc(amountToWordsEn(slip.net_payable))}
      ${slip.notes ? `<div style="margin-top:4px;color:#475569;"><strong>HR Note:</strong> ${esc(slip.notes)}</div>` : ''}
    </div>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `${slip.payslip_no} - Salary Payslip`,
    docTitleEn: 'Employee Salary Payslip',
    docTitleBn: 'কর্মী বেতন স্লিপ (পে-স্লিপ)',
    docRef: slip.payslip_no,
    docDate: slip.payment_date || `${slip.salary_month}-28`,
    extraMeta: `Month: ${slip.salary_month}`,
    theme,
    company,
    bodyHtml,
  });
}

export function buildMasterSalarySheetHtml(
  salaryMonth: string,
  slips: SalaryPayment[],
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.salary_sheet;
  const sumGross = slips.reduce((s, r) => s + Number(r.gross_salary), 0);
  const sumOtBonus = slips.reduce((s, r) => s + Number(r.overtime_pay) + Number(r.bonus_amount), 0);
  const sumDed = slips.reduce((s, r) => s + Number(r.total_deductions), 0);
  const sumNet = slips.reduce((s, r) => s + Number(r.net_payable), 0);

  const bodyHtml = `
    <table class="colorful-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Employee Name &amp; Designation</th>
          <th style="text-align:center;">P / L / A</th>
          <th style="text-align:right;">Gross (BDT)</th>
          <th style="text-align:right;">OT + Bonus</th>
          <th style="text-align:right;">Deductions</th>
          <th style="text-align:right;">Net Payable</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${slips
          .map(
            (s) => `<tr>
              <td class="mono"><strong>${esc(s.emp_code)}</strong></td>
              <td>
                <strong>${esc(s.full_name_en)}</strong>
                ${s.full_name_bn ? ` · ${esc(s.full_name_bn)}` : ''}
                <div style="font-size:10.5px;color:#475569;">${esc(s.designation_en)} (${esc(s.department)})</div>
              </td>
              <td class="mono" style="text-align:center;">${s.present_days} / ${s.late_days} / ${s.absent_days}</td>
              <td class="num">${formatMoney(s.gross_salary)}</td>
              <td class="num">${formatMoney(Number(s.overtime_pay) + Number(s.bonus_amount))}</td>
              <td class="num">${formatMoney(s.total_deductions)}</td>
              <td class="num"><strong>${formatMoney(s.net_payable)}</strong></td>
              <td class="mono" style="font-weight:700;color:${s.status === 'paid' ? '#047857' : '#b45309'};">${esc(s.status.toUpperCase())}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="3" style="text-align:right;">TOTAL MONTHLY PAYROLL (${slips.length} Staff)</td>
          <td class="num">${formatMoney(sumGross)}</td>
          <td class="num">${formatMoney(sumOtBonus)}</td>
          <td class="num">${formatMoney(sumDed)}</td>
          <td class="num">${formatMoney(sumNet)}</td>
          <td>BDT</td>
        </tr>
      </tfoot>
    </table>
    <div class="callout-words">
      <strong>Total Net Disbursement in Words:</strong> ${esc(amountToWordsEn(sumNet))}
    </div>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `Master_Salary_Sheet_${salaryMonth}`,
    docTitleEn: 'Monthly Master Salary Sheet',
    docTitleBn: 'মাসিক বেতন বিবরণী শীট',
    docRef: `PAYROLL-${salaryMonth}`,
    docDate: `${salaryMonth}-28`,
    theme,
    company,
    bodyHtml,
    landscape: true,
  });
}

export function buildDailyAttendanceHtml(
  attendanceDate: string,
  rows: AttendanceRow[],
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.attendance;
  const presentCount = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
  const absentCount = rows.filter((r) => r.status === 'absent').length;
  const leaveCount = rows.filter((r) => r.status === 'leave' || r.status === 'half_day').length;

  const bodyHtml = `
    <div class="callout-words" style="margin-top:0;margin-bottom:12px;">
      <strong>Daily Attendance Summary (${esc(attendanceDate)}):</strong> Total Active Staff: <strong>${rows.length}</strong> · Present/Late: <strong>${presentCount}</strong> · Leave/Half-Day: <strong>${leaveCount}</strong> · Absent: <strong>${absentCount}</strong>
    </div>
    <table class="colorful-table">
      <thead>
        <tr>
          <th style="width:85px;">Emp Code</th>
          <th>Employee Name / কর্মীর নাম</th>
          <th>Department &amp; Role</th>
          <th style="width:95px;">Status</th>
          <th style="width:80px;">Check In</th>
          <th style="width:80px;">Check Out</th>
          <th style="width:70px;text-align:right;">OT Hrs</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
              <td class="mono"><strong>${esc(r.emp_code)}</strong></td>
              <td>
                <strong>${esc(r.full_name_en)}</strong>
                ${r.full_name_bn ? `<div style="font-size:10.5px;color:#475569;">${esc(r.full_name_bn)}</div>` : ''}
              </td>
              <td>${esc(r.department)} · ${esc(r.designation_en)}</td>
              <td class="mono" style="font-weight:700;text-transform:uppercase;">${esc(r.status)}</td>
              <td class="mono">${esc(r.check_in)}</td>
              <td class="mono">${esc(r.check_out)}</td>
              <td class="num">${formatMoney(r.overtime_hours)}</td>
              <td>${esc(r.note || '—')}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `Daily_Attendance_${attendanceDate}`,
    docTitleEn: 'Daily Attendance Register',
    docTitleBn: 'দৈনিক উপস্থিতি হাজিরা শীট',
    docRef: `ATT-${attendanceDate}`,
    docDate: attendanceDate,
    theme,
    company,
    bodyHtml,
  });
}

export function buildMonthlyAttendanceHtml(
  month: string,
  rows: MonthlyAttendanceSummary[],
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.attendance;

  const bodyHtml = `
    <table class="colorful-table">
      <thead>
        <tr>
          <th>Emp Code</th>
          <th>Employee Name &amp; Designation</th>
          <th>Department</th>
          <th style="text-align:right;">Present</th>
          <th style="text-align:right;">Late</th>
          <th style="text-align:right;">Half-Day</th>
          <th style="text-align:right;">Leave</th>
          <th style="text-align:right;">Absent</th>
          <th style="text-align:right;">Overtime (Hrs)</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
              <td class="mono"><strong>${esc(r.emp_code)}</strong></td>
              <td>
                <strong>${esc(r.full_name_en)}</strong>
                ${r.full_name_bn ? ` · ${esc(r.full_name_bn)}` : ''}
                <div style="font-size:10.5px;color:#475569;">${esc(r.designation_en)}</div>
              </td>
              <td>${esc(r.department)}</td>
              <td class="num"><strong>${r.present_days}</strong></td>
              <td class="num">${r.late_days}</td>
              <td class="num">${r.half_days}</td>
              <td class="num">${r.leave_days}</td>
              <td class="num" style="color:${r.absent_days > 0 ? '#be123c' : '#0f172a'};font-weight:600;">${r.absent_days}</td>
              <td class="num">${formatMoney(r.total_overtime_hours)}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `Monthly_Attendance_${month}`,
    docTitleEn: 'Monthly Attendance Summary',
    docTitleBn: 'মাসিক উপস্থিতি সারসংক্ষেপ',
    docRef: `ATT-SUM-${month}`,
    docDate: `${month}-28`,
    theme,
    company,
    bodyHtml,
  });
}

export function buildJournalVoucherHtml(
  journal: JournalEntry,
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.accounting;
  const vno = journal.voucher_no || `JV-${journal.id}`;

  const bodyHtml = `
    <div class="info-grid">
      <div class="info-card">
        <div style="font-size:10.5px;color:#475569;font-weight:600;">NARRATION / বিবরণ</div>
        <div style="font-size:13px;font-weight:700;margin-top:2px;">${esc(journal.memo)}</div>
        ${journal.reference ? `<div class="mono" style="font-size:11px;margin-top:3px;">Ref: ${esc(journal.reference)}</div>` : ''}
      </div>
      <div class="info-card" style="text-align:right;">
        <div style="font-size:10.5px;color:#475569;font-weight:600;">WORKFLOW AUDIT · অনুমোদন তথ্য</div>
        <div class="mono" style="font-size:12px;font-weight:700;margin-top:2px;">Status: ${esc(journal.status.toUpperCase())}</div>
        <div style="font-size:11px;color:#334155;margin-top:2px;">Prepared by: ${esc(journal.created_by_username)} ${journal.approved_by_username ? `· Approved by: ${esc(journal.approved_by_username)}` : ''}</div>
      </div>
    </div>

    <table class="colorful-table">
      <thead>
        <tr>
          <th style="width:90px;">Code</th>
          <th>Ledger Account / হিসাব খাত</th>
          <th>Line Narration</th>
          <th style="width:130px;text-align:right;">Debit (BDT)</th>
          <th style="width:130px;text-align:right;">Credit (BDT)</th>
        </tr>
      </thead>
      <tbody>
        ${journal.lines
          .map(
            (ln) => `<tr>
              <td class="mono"><strong>${esc(ln.account_code)}</strong></td>
              <td><strong>${esc(ln.account_name_en)}</strong>${ln.account_name_bn ? ` · ${esc(ln.account_name_bn)}` : ''}</td>
              <td>${esc(ln.description || '—')}</td>
              <td class="num">${Number(ln.debit) > 0 ? formatMoney(ln.debit) : '—'}</td>
              <td class="num">${Number(ln.credit) > 0 ? formatMoney(ln.credit) : '—'}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="3" style="text-align:right;">Balanced Voucher Totals (BDT)</td>
          <td class="num">${formatMoney(journal.total_debit)}</td>
          <td class="num">${formatMoney(journal.total_credit)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="callout-words">
      <strong>Amount in Words:</strong> ${esc(amountToWordsEn(journal.total_debit))}
    </div>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `${vno}_Journal_Voucher`,
    docTitleEn: 'Double-Entry Journal Voucher',
    docTitleBn: 'ডাবল-এন্ট্রি জার্নাল ভাউচার',
    docRef: vno,
    docDate: journal.entry_date,
    theme,
    company,
    bodyHtml,
  });
}

export function buildChartOfAccountsHtml(
  accounts: Account[],
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.accounting;
  const bodyHtml = `
    <table class="colorful-table">
      <thead>
        <tr>
          <th style="width:85px;">Code</th>
          <th>Account Name (English &amp; Bangla)</th>
          <th>Type</th>
          <th>Normal Side</th>
          <th style="text-align:right;">Opening DR</th>
          <th style="text-align:right;">Opening CR</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${accounts
          .map(
            (a) => `<tr>
              <td class="mono"><strong>${esc(a.code)}</strong></td>
              <td><strong>${esc(a.name_en)}</strong>${a.name_bn ? ` · ${esc(a.name_bn)}` : ''}</td>
              <td style="text-transform:capitalize;">${esc(a.account_type)}</td>
              <td class="mono" style="text-transform:uppercase;">${esc(a.normal_balance)}</td>
              <td class="num">${formatMoney(a.opening_debit)}</td>
              <td class="num">${formatMoney(a.opening_credit)}</td>
              <td>${a.is_active ? 'Active' : 'Inactive'}</td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: 'Chart_of_Accounts',
    docTitleEn: 'Chart of Accounts Schedule',
    docTitleBn: 'চার্ট অফ অ্যাকাউন্টস তালিকা',
    docRef: `COA-${accounts.length}`,
    docDate: new Date().toISOString().slice(0, 10),
    theme,
    company,
    bodyHtml,
  });
}

export function buildTrialBalanceHtml(
  tb: VerifiedTrialBalance,
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.accounting;
  const bodyHtml = `
    <div class="callout-words" style="margin-top:0;margin-bottom:12px;">
      <strong>Mathematical Proof:</strong> Opening Balance = <strong>${formatMoney(tb.total_opening_debit)} BDT</strong> · Period DR = CR = <strong>${formatMoney(tb.total_period_debit)} BDT</strong> · Closing DR = CR = <strong>${formatMoney(tb.total_closing_debit)} BDT</strong> · Discrepancy Δ = <strong>${formatMoney(tb.verification.reconciliation_discrepancy)}</strong>
    </div>
    <table class="colorful-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Account Title</th>
          <th>Type</th>
          <th style="text-align:right;">Opening DR</th>
          <th style="text-align:right;">Opening CR</th>
          <th style="text-align:right;">Movement DR</th>
          <th style="text-align:right;">Movement CR</th>
          <th style="text-align:right;">Closing DR</th>
          <th style="text-align:right;">Closing CR</th>
        </tr>
      </thead>
      <tbody>
        ${tb.rows
          .map(
            (r) => `<tr>
              <td class="mono"><strong>${esc(r.account_code)}</strong></td>
              <td><strong>${esc(r.account_name)}</strong>${r.account_name_bn ? ` · ${esc(r.account_name_bn)}` : ''}</td>
              <td style="text-transform:capitalize;">${esc(r.account_type)}</td>
              <td class="num">${formatMoney(r.opening_debit)}</td>
              <td class="num">${formatMoney(r.opening_credit)}</td>
              <td class="num">${formatMoney(r.period_debit)}</td>
              <td class="num">${formatMoney(r.period_credit)}</td>
              <td class="num"><strong>${formatMoney(r.debit)}</strong></td>
              <td class="num"><strong>${formatMoney(r.credit)}</strong></td>
            </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="3" style="text-align:right;">VERIFIED TOTALS (BDT)</td>
          <td class="num">${formatMoney(tb.total_opening_debit)}</td>
          <td class="num">${formatMoney(tb.total_opening_credit)}</td>
          <td class="num">${formatMoney(tb.total_period_debit)}</td>
          <td class="num">${formatMoney(tb.total_period_credit)}</td>
          <td class="num">${formatMoney(tb.total_closing_debit)}</td>
          <td class="num">${formatMoney(tb.total_closing_credit)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: 'Verified_Trial_Balance',
    docTitleEn: 'Verified Trial Balance',
    docTitleBn: 'গাণিতিকভাবে যাচাইকৃত ট্রায়াল ব্যালেন্স',
    docRef: 'TB-VERIFIED',
    docDate: tb.as_of_date || new Date().toISOString().slice(0, 10),
    theme,
    company,
    bodyHtml,
    landscape: true,
  });
}

export function buildGeneralLedgerHtml(
  gl: GeneralLedgerReport,
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.accounting;
  const bodyHtml = `
    <div class="callout-words" style="margin-top:0;margin-bottom:12px;">
      <strong>Account:</strong> ${esc(gl.account_code)} — ${esc(gl.account_name_en)} (${esc(gl.account_name_bn)}) · Normal Side: <strong>${esc(gl.normal_balance.toUpperCase())}</strong> · Opening: <strong>${formatMoney(gl.opening_balance)} ${esc(gl.opening_side)}</strong> · Closing: <strong>${formatMoney(gl.closing_balance)} ${esc(gl.closing_side)}</strong>
    </div>
    <table class="colorful-table">
      <thead>
        <tr>
          <th style="width:95px;">Date</th>
          <th style="width:120px;">Voucher No</th>
          <th>Particulars / বিবরণ</th>
          <th style="width:120px;text-align:right;">Debit (BDT)</th>
          <th style="width:120px;text-align:right;">Credit (BDT)</th>
          <th style="width:135px;text-align:right;">Running Balance</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="mono">${esc(gl.start_date || '—')}</td>
          <td class="mono">OPENING</td>
          <td>Opening Balance Brought Forward (প্রারম্ভিক জের)</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num"><strong>${formatMoney(gl.opening_balance)} ${gl.opening_side !== 'ZERO' ? esc(gl.opening_side) : ''}</strong></td>
        </tr>
        ${gl.movements
          .map(
            (m) => `<tr>
              <td class="mono">${esc(m.entry_date)}</td>
              <td class="mono"><strong>${esc(m.voucher_no)}</strong></td>
              <td>${esc(m.memo)}${m.line_description ? `<div style="font-size:10.5px;color:#475569;">${esc(m.line_description)}</div>` : ''}</td>
              <td class="num">${Number(m.debit) > 0 ? formatMoney(m.debit) : '—'}</td>
              <td class="num">${Number(m.credit) > 0 ? formatMoney(m.credit) : '—'}</td>
              <td class="num"><strong>${formatMoney(m.running_balance)} ${m.balance_side !== 'ZERO' ? esc(m.balance_side) : ''}</strong></td>
            </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="3" style="text-align:right;">PERIOD TOTALS &amp; CLOSING BALANCE</td>
          <td class="num">${formatMoney(gl.period_debit)}</td>
          <td class="num">${formatMoney(gl.period_credit)}</td>
          <td class="num">${formatMoney(gl.closing_balance)} ${gl.closing_side !== 'ZERO' ? esc(gl.closing_side) : ''}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `GL_${gl.account_code}`,
    docTitleEn: 'General Ledger Statement',
    docTitleBn: 'জেনারেল লেজার বিবরণী',
    docRef: `GL-${gl.account_code}`,
    docDate: gl.end_date || new Date().toISOString().slice(0, 10),
    theme,
    company,
    bodyHtml,
  });
}

export function buildFinancialStatementsHtml(
  report: FinancialStatementsReport,
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.financials;
  const asOf = report.as_of_date || new Date().toISOString().slice(0, 10);
  const periodLabel = report.start_date ? `${report.start_date} to ${asOf}` : `Cumulative through ${asOf}`;

  const renderLines = (
    rows: FinancialStatementsReport['revenue_lines'],
  ) =>
    rows
      .map(
        (r) => `<tr>
          <td class="mono" style="width:75px;"><strong>${esc(r.account_code)}</strong></td>
          <td>${esc(r.account_name_en)}${r.account_name_bn ? ` · <span style="color:#475569;font-size:11px;">${esc(r.account_name_bn)}</span>` : ''}</td>
          <td class="num">${formatMoney(r.balance)}</td>
        </tr>`,
      )
      .join('');

  const bodyHtml = `
    <div class="callout-words" style="margin-top:0;margin-bottom:14px;">
      <strong>Reporting Period:</strong> ${esc(periodLabel)} ·
      <strong>Liquid Cash + Bank:</strong> BDT ${formatMoney(report.cash_and_bank.total_liquid_cash)} ·
      <strong>Net Profit / (Loss):</strong> BDT ${formatMoney(report.net_income)} ·
      <strong>Balance Sheet Check:</strong> ${report.is_balance_sheet_balanced ? 'Balanced (Assets = Liabilities + Equity)' : `Discrepancy ${formatMoney(report.accounting_equation_difference)}`}
    </div>

    <h3 style="margin:8px 0 6px;font-size:13px;color:#065f46;text-transform:uppercase;letter-spacing:0.04em;">
      1. Income Statement (Profit &amp; Loss) · লাভ-ক্ষতি বিবরণী
    </h3>
    <table class="colorful-table" style="margin-bottom:16px;">
      <thead>
        <tr>
          <th style="width:75px;">Code</th>
          <th>Operating Revenue &amp; Expense Accounts</th>
          <th style="width:150px;text-align:right;">Amount (BDT)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="3" style="background:#ecfdf5;font-weight:700;color:#065f46;">Operating Revenue (পরিচালন আয়)</td></tr>
        ${renderLines(report.revenue_lines)}
        <tr style="background:#f8fafc;font-weight:700;">
          <td colspan="2" style="text-align:right;">Total Operating Revenue</td>
          <td class="num">${formatMoney(report.total_revenue)}</td>
        </tr>
        <tr><td colspan="3" style="background:#fff1f2;font-weight:700;color:#9f1239;">Operating Expenses (পরিচালন ব্যয়)</td></tr>
        ${renderLines(report.expense_lines)}
        <tr style="background:#f8fafc;font-weight:700;">
          <td colspan="2" style="text-align:right;">Total Operating Expenses</td>
          <td class="num">${formatMoney(report.total_expenses)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="2" style="text-align:right;">NET PROFIT / (LOSS) FOR PERIOD (নিট মুনাফা / ক্ষতি)</td>
          <td class="num">BDT ${formatMoney(report.net_income)}</td>
        </tr>
      </tfoot>
    </table>

    <h3 style="margin:12px 0 6px;font-size:13px;color:#0f172a;text-transform:uppercase;letter-spacing:0.04em;">
      2. Statement of Financial Position (Balance Sheet) · ব্যালেন্স শিট
    </h3>
    <table class="colorful-table">
      <thead>
        <tr>
          <th style="width:75px;">Code</th>
          <th>Assets, Liabilities &amp; Shareholders' Equity</th>
          <th style="width:150px;text-align:right;">Balance (BDT)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="3" style="background:#eff6ff;font-weight:700;color:#1e40af;">Assets (সম্পদসমূহ)</td></tr>
        ${renderLines(report.asset_lines)}
        <tr style="background:#eff6ff;font-weight:700;">
          <td colspan="2" style="text-align:right;">TOTAL ASSETS (মোট সম্পদ)</td>
          <td class="num">${formatMoney(report.total_assets)}</td>
        </tr>
        <tr><td colspan="3" style="background:#fef3c7;font-weight:700;color:#92400e;">Liabilities (দায়সমূহ)</td></tr>
        ${renderLines(report.liability_lines)}
        <tr style="background:#f8fafc;font-weight:700;">
          <td colspan="2" style="text-align:right;">Total Liabilities</td>
          <td class="num">${formatMoney(report.total_liabilities)}</td>
        </tr>
        <tr><td colspan="3" style="background:#f5f3ff;font-weight:700;color:#5b21b6;">Shareholders' Equity (মালিকানা তহবিল)</td></tr>
        ${renderLines(report.equity_lines)}
        <tr>
          <td class="mono"><strong>SURPLUS</strong></td>
          <td>Current Unclosed Net Surplus / (Deficit)</td>
          <td class="num">${formatMoney(Number(report.total_equity_with_net_income) - Number(report.posted_equity))}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="2" style="text-align:right;">TOTAL LIABILITIES &amp; EQUITY (মোট দায় ও মূলধন)</td>
          <td class="num">BDT ${formatMoney(report.total_liabilities_and_equity)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: `Financial_Statements_${asOf}`,
    docTitleEn: 'Financial Statements (P&L + Balance Sheet)',
    docTitleBn: 'আর্থিক বিবরণী (লাভ-ক্ষতি ও ব্যালেন্স শিট)',
    docRef: `FIN-${asOf.replace(/-/g, '')}`,
    docDate: asOf,
    theme,
    company,
    bodyHtml,
  });
}

export function buildProjectsPortfolioHtml(
  projects: SoftwareProject[],
  company?: CompanyProfile | null,
): string {
  const theme = PRINT_THEMES.projects;
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value || 0), 0);
  const totalBilled = projects.reduce((s, p) => s + Number(p.billed_amount || 0), 0);
  const totalReceived = projects.reduce((s, p) => s + Number(p.received_amount || 0), 0);
  const totalDue = projects.reduce((s, p) => s + Number(p.due_amount || 0), 0);

  const bodyHtml = `
    <div class="callout-words" style="margin-top:0;margin-bottom:12px;">
      <strong>Total Projects:</strong> ${projects.length} ·
      <strong>Contract Value:</strong> BDT ${formatMoney(totalContract)} ·
      <strong>Billed:</strong> BDT ${formatMoney(totalBilled)} ·
      <strong>Collected:</strong> BDT ${formatMoney(totalReceived)} ·
      <strong>Receivable Due:</strong> BDT ${formatMoney(totalDue)}
    </div>
    <table class="colorful-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Software Project &amp; Tech Stack</th>
          <th>Client Organization</th>
          <th>Stage</th>
          <th style="text-align:right;">Progress</th>
          <th style="text-align:right;">Contract (BDT)</th>
          <th style="text-align:right;">Billed (BDT)</th>
          <th style="text-align:right;">Received (BDT)</th>
        </tr>
      </thead>
      <tbody>
        ${
          projects.length === 0
            ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">No software projects registered yet (0.00 BDT).</td></tr>`
            : projects
                .map(
                  (p) => `<tr>
                    <td class="mono"><strong>${esc(p.project_code)}</strong></td>
                    <td><strong>${esc(p.name_en)}</strong><div style="font-size:10.5px;color:#475569;">${esc(p.tech_stack)}</div></td>
                    <td>${esc(p.client_name_en)}</td>
                    <td style="text-transform:uppercase;font-size:10.5px;font-weight:700;">${esc(p.status)}</td>
                    <td class="num">${p.progress_percent}%</td>
                    <td class="num">${formatMoney(p.contract_value)}</td>
                    <td class="num">${formatMoney(p.billed_amount)}</td>
                    <td class="num">${formatMoney(p.received_amount)}</td>
                  </tr>`,
                )
                .join('')
        }
      </tbody>
      <tfoot>
        <tr class="grand-row">
          <td colspan="5" style="text-align:right;">PORTFOLIO TOTALS (BDT)</td>
          <td class="num">${formatMoney(totalContract)}</td>
          <td class="num">${formatMoney(totalBilled)}</td>
          <td class="num">${formatMoney(totalReceived)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  return wrapColorfulPrintShell({
    pageTitle: 'Software_Projects_Portfolio',
    docTitleEn: 'IT Projects & Client Contracts Register',
    docTitleBn: 'সফটওয়্যার প্রজেক্ট ও চুক্তি তালিকা',
    docRef: `PRJ-PORTFOLIO`,
    docDate: new Date().toISOString().slice(0, 10),
    theme,
    company,
    bodyHtml,
    landscape: true,
  });
}
