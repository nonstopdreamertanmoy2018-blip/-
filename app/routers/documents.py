from __future__ import annotations

import html as html_lib
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import BusinessDocument, BusinessDocumentItem, CompanyProfile, User
from app.schemas import DocumentCreate, DocumentItemOut, DocumentOut
from app.security import get_current_user, record_audit, require_permission

router = APIRouter()

ZERO = Decimal("0.00")

DOC_PREFIX_MAP: dict[str, str] = {
    "letterhead": "LH",
    "payment_voucher": "PV",
    "receipt": "MR",
    "quotation": "QT",
    "invoice": "INV",
}

DOC_TITLE_MAP: dict[str, tuple[str, str]] = {
    "letterhead": ("OFFICIAL LETTERHEAD", "অফিসিয়াল লেটারহেড"),
    "payment_voucher": ("PAYMENT VOUCHER", "পেমেন্ট ভাউচার"),
    "receipt": ("MONEY RECEIPT", "মানি রসিদ"),
    "quotation": ("COMMERCIAL QUOTATION", "ব্যবসায়িক কোটেশন"),
    "invoice": ("SERVICE INVOICE", "সার্ভিস ইনভয়েস / চালান"),
}


def _next_doc_number(db: Session, doc_type: str, issue_date: str) -> str:
    prefix_code = DOC_PREFIX_MAP.get(doc_type, "DOC")
    year = issue_date[:4]
    prefix = f"{prefix_code}-{year}-"
    existing = db.scalars(
        select(BusinessDocument.doc_number).where(BusinessDocument.doc_number.like(f"{prefix}%"))
    ).all()
    max_seq = 0
    for num in existing:
        if num and num.startswith(prefix):
            tail = num[len(prefix):]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1:04d}"


def _serialize_document(doc: BusinessDocument) -> DocumentOut:
    items_out = [
        DocumentItemOut(
            id=it.id,
            description_en=it.description_en,
            description_bn=it.description_bn,
            quantity=Decimal(str(it.quantity)).quantize(ZERO),
            unit_price=Decimal(str(it.unit_price)).quantize(ZERO),
            amount=Decimal(str(it.amount)).quantize(ZERO),
        )
        for it in doc.items
    ]
    subtotal = sum((it.amount for it in items_out), ZERO)
    discount = Decimal(str(doc.discount_amount)).quantize(ZERO)
    taxable = max(subtotal - discount, ZERO)
    tax_rate = Decimal(str(doc.tax_rate_percent)).quantize(ZERO)
    tax_amount = ((taxable * tax_rate) / Decimal("100.00")).quantize(ZERO)
    grand_total = (taxable + tax_amount).quantize(ZERO)

    return DocumentOut(
        id=doc.id,
        doc_type=doc.doc_type,
        doc_number=doc.doc_number,
        issue_date=doc.issue_date,
        due_date=doc.due_date,
        party_name_en=doc.party_name_en,
        party_name_bn=doc.party_name_bn,
        party_address=doc.party_address,
        subject_en=doc.subject_en,
        subject_bn=doc.subject_bn,
        body_en=doc.body_en,
        body_bn=doc.body_bn,
        payment_method=doc.payment_method,
        currency=doc.currency,
        discount_amount=discount,
        tax_rate_percent=tax_rate,
        subtotal=subtotal,
        tax_amount=tax_amount,
        grand_total=grand_total,
        notes_en=doc.notes_en,
        notes_bn=doc.notes_bn,
        status=doc.status,
        created_by=doc.created_by,
        created_at=doc.created_at,
        items=items_out,
    )


@router.get("/documents", response_model=list[DocumentOut], tags=["Printable Templates"])
def list_documents(
    doc_type: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("documents:view")),
):
    stmt = (
        select(BusinessDocument)
        .options(selectinload(BusinessDocument.items))
        .order_by(BusinessDocument.id.desc())
    )
    if doc_type:
        stmt = stmt.where(BusinessDocument.doc_type == doc_type)
    docs = db.scalars(stmt).all()
    return [_serialize_document(d) for d in docs]


@router.post("/documents", response_model=DocumentOut, status_code=201, tags=["Printable Templates"])
def create_document(
    data: DocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("documents:create")),
):
    if data.doc_type != "letterhead" and len(data.items) == 0:
        raise HTTPException(
            status_code=422,
            detail=f"Document type '{data.doc_type}' requires at least one line item",
        )

    try:
        doc_number = _next_doc_number(db, data.doc_type, data.issue_date)
        items_models: list[BusinessDocumentItem] = []
        for item in data.items:
            line_amount = (item.quantity * item.unit_price).quantize(ZERO)
            items_models.append(
                BusinessDocumentItem(
                    description_en=item.description_en,
                    description_bn=item.description_bn,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    amount=line_amount,
                )
            )

        doc = BusinessDocument(
            doc_type=data.doc_type,
            doc_number=doc_number,
            issue_date=data.issue_date,
            due_date=data.due_date,
            party_name_en=data.party_name_en,
            party_name_bn=data.party_name_bn,
            party_address=data.party_address,
            subject_en=data.subject_en,
            subject_bn=data.subject_bn,
            body_en=data.body_en,
            body_bn=data.body_bn,
            payment_method=data.payment_method,
            discount_amount=data.discount_amount,
            tax_rate_percent=data.tax_rate_percent,
            notes_en=data.notes_en,
            notes_bn=data.notes_bn,
            status="issued",
            created_by=user.id,
            items=items_models,
        )
        db.add(doc)
        db.flush()
        record_audit(
            db,
            user.id,
            "document.created",
            "business_document",
            doc_number,
            f"Issued {data.doc_type} {doc_number}",
        )
        db.commit()
        db.refresh(doc)
        return _serialize_document(doc)
    except Exception:
        db.rollback()
        raise


@router.get("/documents/sample-invoice", response_class=HTMLResponse, tags=["Printable Templates"])
def sample_invoice(_user: User = Depends(get_current_user)):
    """Preserved starter demonstration endpoint."""
    html = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sample invoice — NEXTGEN TECHNIX LIMITED</title>
<style>
  body{font-family:Arial,sans-serif;color:#172033;margin:32px}
  header{display:flex;justify-content:space-between;border-bottom:2px solid #223b65;padding-bottom:16px}
  h1{margin:0;color:#223b65}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{border:1px solid #ccd3df;padding:10px;text-align:left}
  .right{text-align:right;font-variant-numeric:tabular-nums}
  .note{margin-top:28px;color:#566174}
  .print{padding:10px 16px;margin-bottom:20px;cursor:pointer}
  @media print{.print{display:none} body{margin:12mm}}
</style>
</head>
<body>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
<header>
  <div>
    <h1>NEXTGEN TECHNIX LIMITED</h1>
    <p>Premier IT &amp; Custom Software Engineering Company · Sample invoice · নমুনা চালান</p>
  </div>
  <div>
    <strong>INVOICE / চালান</strong>
    <p>Number: DEMO-0001</p>
    <p>Date: 2026-01-01</p>
  </div>
</header>
<p>Client / গ্রাহক: Example Client (Synthetic Demo)</p>
<table>
  <thead>
    <tr><th>Description / বিবরণ</th><th>Qty</th><th class="right">Unit price (BDT)</th><th class="right">Amount (BDT)</th></tr>
  </thead>
  <tbody>
    <tr><td>Software service (demo)</td><td>1</td><td class="right">10,000.00</td><td class="right">10,000.00</td></tr>
    <tr><td colspan="3" class="right"><strong>Total / মোট</strong></td><td class="right"><strong>10,000.00</strong></td></tr>
  </tbody>
</table>
<p class="note">DEMO ONLY — not a tax invoice and not a real transaction. Replace with approved company data and local tax requirements before use.</p>
<p>Prepared by: ____________________ &nbsp;&nbsp; Authorized signature: ____________________</p>
</body>
</html>"""
    return HTMLResponse(html)


@router.get("/documents/{doc_id}", response_model=DocumentOut, tags=["Printable Templates"])
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("documents:view")),
):
    doc = db.scalar(
        select(BusinessDocument)
        .options(selectinload(BusinessDocument.items))
        .where(BusinessDocument.id == doc_id)
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _serialize_document(doc)


@router.get("/documents/{doc_id}/html", response_class=HTMLResponse, tags=["Printable Templates"])
def render_printable_document_html(
    doc_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("documents:view")),
):
    doc_model = db.scalar(
        select(BusinessDocument)
        .options(selectinload(BusinessDocument.items))
        .where(BusinessDocument.id == doc_id)
    )
    if not doc_model:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = _serialize_document(doc_model)
    company = db.scalar(select(CompanyProfile).order_by(CompanyProfile.id)) or CompanyProfile()
    title_en, title_bn = DOC_TITLE_MAP.get(doc.doc_type, ("DOCUMENT", "নথি"))
    esc = html_lib.escape

    rows_html = ""
    for idx, it in enumerate(doc.items, start=1):
        bn_line = (
            f'<br><span style="color:#475569;font-size:12px">{esc(it.description_bn)}</span>'
            if it.description_bn
            else ""
        )
        rows_html += (
            f"<tr>"
            f"<td>{idx}</td>"
            f"<td><strong>{esc(it.description_en)}</strong>{bn_line}</td>"
            f"<td class='num'>{it.quantity:,.2f}</td>"
            f"<td class='num'>{it.unit_price:,.2f}</td>"
            f"<td class='num'>{it.amount:,.2f}</td>"
            f"</tr>"
        )

    body_section = ""
    if doc.doc_type == "letterhead":
        subj_bn = f" · {esc(doc.subject_bn)}" if doc.subject_bn else ""
        body_bn_html = (
            f'<div style="white-space:pre-line;margin-top:16px;color:#334155">{esc(doc.body_bn)}</div>'
            if doc.body_bn
            else ""
        )
        body_section = f"""
        <div style="margin-top:24px;line-height:1.7">
          <p><strong>Subject / বিষয়:</strong> {esc(doc.subject_en)}{subj_bn}</p>
          <div style="white-space:pre-line;margin-top:16px">{esc(doc.body_en)}</div>
          {body_bn_html}
        </div>
        """
    else:
        body_section = f"""
        <table>
          <thead>
            <tr>
              <th style="width:44px">#</th>
              <th>Description / বিবরণ</th>
              <th class="num" style="width:90px">Qty</th>
              <th class="num" style="width:130px">Unit ({esc(doc.currency)})</th>
              <th class="num" style="width:140px">Amount ({esc(doc.currency)})</th>
            </tr>
          </thead>
          <tbody>
            {rows_html}
          </tbody>
          <tfoot>
            <tr><td colspan="4" class="num">Subtotal / উপমোট</td><td class="num">{doc.subtotal:,.2f}</td></tr>
            <tr><td colspan="4" class="num">Discount / ছাড়</td><td class="num">{doc.discount_amount:,.2f}</td></tr>
            <tr><td colspan="4" class="num">Tax ({doc.tax_rate_percent}%) / কর</td><td class="num">{doc.tax_amount:,.2f}</td></tr>
            <tr><td colspan="4" class="num"><strong>Grand Total / সর্বমোট ({esc(doc.currency)})</strong></td><td class="num"><strong>{doc.grand_total:,.2f}</strong></td></tr>
          </tfoot>
        </table>
        """

    color_map = {
        "letterhead": ("#1d4ed8", "#eff6ff"),
        "payment_voucher": ("#b45309", "#fffbeb"),
        "receipt": ("#047857", "#ecfdf5"),
        "quotation": ("#6d28d9", "#f5f3ff"),
        "invoice": ("#0f766e", "#f0fdfa"),
    }
    accent_hex, tint_hex = color_map.get(doc.doc_type, ("#1d4ed8", "#eff6ff"))
    logo_src = esc(company.logo_url or "/company-logo.jpg")
    due_html = f"<div>Due / Valid Until: {esc(doc.due_date)}</div>" if doc.due_date else ""
    party_bn_html = f" · {esc(doc.party_name_bn)}" if doc.party_name_bn else ""

    html_out = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{esc(doc.doc_number)} — {esc(company.name_en)}</title>
<style>
  *{{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;box-sizing:border-box}}
  body{{font-family:'Public Sans','Noto Sans Bengali',Arial,sans-serif;color:#0f172a;margin:28px;font-size:14px}}
  .top-band{{height:8px;background:linear-gradient(90deg,{accent_hex},#0d9488,#d97706);border-radius:4px;margin-bottom:18px}}
  header{{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid {accent_hex};padding-bottom:16px;gap:16px}}
  .brand-wrap{{display:flex;align-items:flex-start;gap:14px}}
  .brand-logo{{width:64px;height:64px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;background:#fff;padding:4px}}
  h1{{margin:0;font-size:21px;color:{accent_hex}}}
  table{{width:100%;border-collapse:collapse;margin-top:20px}}
  th,td{{border:1px solid #cbd5e1;padding:9px 10px;text-align:left;vertical-align:top}}
  th{{background:{accent_hex};color:#ffffff}}
  tfoot tr:last-child td{{background:{tint_hex};color:{accent_hex};font-size:15px}}
  .num{{text-align:right;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}}
  .meta{{margin-top:18px;padding:12px 14px;background:{tint_hex};border:1px solid #cbd5e1;border-radius:8px;display:flex;justify-content:space-between;gap:24px}}
  .sigs{{margin-top:56px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;text-align:center}}
  .sig-line{{border-top:2px solid {accent_hex};padding-top:6px;font-size:12px;font-weight:600}}
  .notice{{margin-top:24px;padding:10px 12px;background:#f8fafc;border:1px dashed #94a3b8;border-radius:6px;font-size:12px;color:#475569}}
  @media print{{.no-print{{display:none}} body{{margin:10mm}}}}
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="padding:9px 18px;background:{accent_hex};color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </div>
  <div class="top-band"></div>
  <header>
    <div class="brand-wrap">
      <img src="{logo_src}" alt="Company Emblem" class="brand-logo" onerror="this.style.display='none'">
      <div>
        <h1>{esc(company.name_en)}</h1>
        <div style="font-size:15px;font-weight:600;margin-top:2px;color:#0f172a">{esc(company.name_bn)}</div>
        <div style="color:{accent_hex};font-size:12px;font-weight:600;margin-top:2px">{esc(company.tagline_en)}</div>
        <div style="color:#475569;font-size:12px;margin-top:4px">{esc(company.address_en)}</div>
        <div style="color:#475569;font-size:12px">Reg: {esc(company.registration_no)} · TIN: {esc(company.tin_no)} · BIN: {esc(company.bin_no)}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;font-size:16px;color:{accent_hex}">{esc(title_en)}</div>
      <div style="color:#334155;font-weight:600">{esc(title_bn)}</div>
      <div style="margin-top:8px;font-family:monospace;font-size:13px"><strong>No: {esc(doc.doc_number)}</strong></div>
      <div style="font-size:12px">Date: {esc(doc.issue_date)}</div>
      <div style="font-size:12px">{due_html}</div>
    </div>
  </header>
  <div class="meta">
    <div>
      <strong>Party / প্রাপক:</strong> {esc(doc.party_name_en)}{party_bn_html}<br>
      <span style="color:#475569">{esc(doc.party_address)}</span>
    </div>
    <div style="text-align:right">
      <strong>Settlement / মাধ্যম:</strong> {esc(doc.payment_method)}<br>
      <strong>Currency / মুদ্রা:</strong> {esc(doc.currency)}
    </div>
  </div>
  {body_section}
  <div class="notice">
    <strong>{esc(doc.notes_en)}</strong><br>{esc(doc.notes_bn)}
  </div>
  <div class="sigs">
    <div class="sig-line">Prepared By / প্রস্তুতকারক</div>
    <div class="sig-line">Verified By / যাচাইকারী</div>
    <div class="sig-line">Authorized Signatory / অনুমোদিত স্বাক্ষর</div>
  </div>
</body>
</html>"""
    return HTMLResponse(html_out)
