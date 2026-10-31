from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    ACCOUNT_NORMAL_BALANCE_MAP,
    Account,
    FiscalPeriod,
    JournalEntry,
    JournalLine,
    User,
)
from app.schemas import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    GeneralLedgerOut,
    JournalCreate,
    JournalLineOut,
    JournalOut,
    JournalRejectInput,
    LedgerMovementRow,
    TrialBalanceRow,
    TrialBalanceVerification,
    VerifiedTrialBalanceOut,
)
from app.security import has_permission, record_audit, require_permission

router = APIRouter()

ZERO = Decimal("0.00")


def _next_voucher_no(db: Session, entry_date: str) -> str:
    year = entry_date[:4]
    prefix = f"JV-{year}-"
    existing = db.scalars(
        select(JournalEntry.voucher_no).where(JournalEntry.voucher_no.like(f"{prefix}%"))
    ).all()
    max_seq = 0
    for v in existing:
        if v and v.startswith(prefix):
            tail = v[len(prefix):]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1:04d}"


def _ensure_open_fiscal_period(db: Session, entry_date: str) -> None:
    closed_period = db.scalar(
        select(FiscalPeriod).where(
            FiscalPeriod.is_closed.is_(True),
            FiscalPeriod.start_date <= entry_date,
            FiscalPeriod.end_date >= entry_date,
        )
    )
    if closed_period:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot post journal into closed fiscal period '{closed_period.name}' ({closed_period.start_date} to {closed_period.end_date})",
        )


def _validate_journal_lines(db: Session, lines_input) -> tuple[Decimal, Decimal, dict[int, Account]]:
    account_map: dict[int, Account] = {}
    for idx, line in enumerate(lines_input, start=1):
        if (line.debit > ZERO and line.credit > ZERO) or (line.debit == ZERO and line.credit == ZERO):
            raise HTTPException(
                status_code=422,
                detail=f"Line {idx}: Each journal line must contain either a positive debit or a positive credit, never both or zero",
            )
        account = db.get(Account, line.account_id)
        if not account:
            raise HTTPException(
                status_code=422,
                detail=f"Account {line.account_id} does not exist",
            )
        if not account.is_active:
            raise HTTPException(
                status_code=422,
                detail=f"Account '{account.code} - {account.name_en}' is inactive and cannot receive postings",
            )
        account_map[account.id] = account

    total_debit = sum((line.debit for line in lines_input), ZERO)
    total_credit = sum((line.credit for line in lines_input), ZERO)
    if total_debit <= ZERO or total_debit != total_credit:
        raise HTTPException(
            status_code=422,
            detail=f"Journal is not balanced: total debit ({total_debit}) must equal total credit ({total_credit})",
        )
    return total_debit, total_credit, account_map


def _serialize_journal(db: Session, entry: JournalEntry) -> JournalOut:
    total_debit = sum((Decimal(str(l.debit)) for l in entry.lines), ZERO)
    total_credit = sum((Decimal(str(l.credit)) for l in entry.lines), ZERO)

    user_ids = {entry.created_by}
    if entry.approved_by:
        user_ids.add(entry.approved_by)
    users_by_id = {
        u.id: u.username
        for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()
    }

    acc_ids = {l.account_id for l in entry.lines}
    accounts_by_id = {
        a.id: a
        for a in db.scalars(select(Account).where(Account.id.in_(acc_ids))).all()
    } if acc_ids else {}

    line_outs = []
    for l in entry.lines:
        acc = accounts_by_id.get(l.account_id)
        line_outs.append(
            JournalLineOut(
                id=l.id,
                account_id=l.account_id,
                account_code=acc.code if acc else "",
                account_name_en=acc.name_en if acc else "",
                account_name_bn=acc.name_bn if acc else "",
                description=l.description or "",
                debit=Decimal(str(l.debit)),
                credit=Decimal(str(l.credit)),
            )
        )

    return JournalOut(
        id=entry.id,
        voucher_no=entry.voucher_no,
        entry_date=entry.entry_date,
        memo=entry.memo,
        reference=entry.reference or "",
        status=entry.status,
        total_debit=total_debit,
        total_credit=total_credit,
        created_by=entry.created_by,
        created_by_username=users_by_id.get(entry.created_by, ""),
        approved_by=entry.approved_by,
        approved_by_username=users_by_id.get(entry.approved_by) if entry.approved_by else None,
        approved_at=entry.approved_at,
        rejection_reason=entry.rejection_reason,
        reversed_entry_id=entry.reversed_entry_id,
        created_at=entry.created_at,
        lines=line_outs,
    )


@router.post("/accounts", response_model=AccountOut, tags=["Chart of Accounts"])
def create_account(
    data: AccountCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("accounts:manage")),
):
    if data.opening_debit > ZERO and data.opening_credit > ZERO:
        raise HTTPException(
            status_code=422,
            detail="An account cannot have both opening_debit and opening_credit greater than zero",
        )
    if db.scalar(select(Account).where(Account.code == data.code)):
        raise HTTPException(status_code=409, detail="Account code already exists")

    normal_balance = ACCOUNT_NORMAL_BALANCE_MAP[data.account_type]
    try:
        account = Account(
            code=data.code,
            name_en=data.name_en,
            name_bn=data.name_bn,
            account_type=data.account_type,
            normal_balance=normal_balance,
            parent_code=data.parent_code,
            description_en=data.description_en,
            description_bn=data.description_bn,
            opening_debit=data.opening_debit,
            opening_credit=data.opening_credit,
            is_active=True,
        )
        db.add(account)
        db.flush()
        record_audit(
            db,
            user.id,
            "account.created",
            "account",
            account.code,
            f"Created {account.account_type} account '{account.code} - {account.name_en}' ({normal_balance} normal)",
        )
        db.commit()
        db.refresh(account)
        return account
    except Exception:
        db.rollback()
        raise


@router.get("/accounts", response_model=list[AccountOut], tags=["Chart of Accounts"])
def list_accounts(
    include_inactive: bool = True,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:view")),
):
    stmt = select(Account).order_by(Account.code)
    if not include_inactive:
        stmt = stmt.where(Account.is_active.is_(True))
    return list(db.scalars(stmt).all())


@router.post("/accounts/reset-opening-balances", response_model=list[AccountOut], tags=["Chart of Accounts"])
def reset_all_opening_balances_to_zero(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("accounts:manage")),
):
    accounts = db.scalars(select(Account).order_by(Account.code)).all()
    for acc in accounts:
        acc.opening_debit = ZERO
        acc.opening_credit = ZERO
    record_audit(
        db,
        user.id,
        "accounts.opening_zeroed",
        "account",
        "all",
        f"Reset opening_debit and opening_credit to 0.00 across {len(accounts)} accounts",
    )
    db.commit()
    return list(db.scalars(select(Account).order_by(Account.code)).all())


@router.patch("/accounts/{account_id}", response_model=AccountOut, tags=["Chart of Accounts"])
def update_account(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("accounts:manage")),
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    new_od = data.opening_debit if data.opening_debit is not None else Decimal(str(account.opening_debit))
    new_oc = data.opening_credit if data.opening_credit is not None else Decimal(str(account.opening_credit))
    if new_od > ZERO and new_oc > ZERO:
        raise HTTPException(
            status_code=422,
            detail="An account cannot simultaneously hold opening_debit and opening_credit",
        )

    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(account, field, val)

    record_audit(
        db,
        user.id,
        "account.updated",
        "account",
        account.code,
        f"Updated account '{account.code}' (is_active={account.is_active})",
    )
    db.commit()
    db.refresh(account)
    return account


@router.get("/journals", response_model=list[JournalOut], tags=["Journal Workflow"])
def list_journals(
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("journals:view")),
):
    stmt = (
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
    )
    if status:
        stmt = stmt.where(JournalEntry.status == status)
    entries = db.scalars(stmt).all()
    return [_serialize_journal(db, e) for e in entries]


@router.get("/journals/{journal_id}", response_model=JournalOut, tags=["Journal Workflow"])
def get_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("journals:view")),
):
    entry = db.scalar(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == journal_id)
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return _serialize_journal(db, entry)


@router.post("/journals", response_model=JournalOut, tags=["Journal Workflow"])
def create_journal(
    data: JournalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("journals:create")),
):
    _validate_journal_lines(db, data.lines)
    _ensure_open_fiscal_period(db, data.entry_date)

    # Determine workflow action:
    # - Explicit "draft" -> draft
    # - Explicit "submit" -> pending_approval
    # - Explicit "direct_post" or omitted -> requires journals:approve, otherwise defaults to pending_approval
    can_approve = has_permission(db, user, "journals:approve")
    action = data.workflow_action
    if action is None:
        action = "direct_post" if can_approve else "submit"

    if action == "direct_post" and not can_approve:
        raise HTTPException(
            status_code=403,
            detail="Direct journal posting requires 'journals:approve' permission; submit for approval instead",
        )

    status_map = {
        "draft": "draft",
        "submit": "pending_approval",
        "direct_post": "posted",
    }
    target_status = status_map[action]

    try:
        voucher_no = _next_voucher_no(db, data.entry_date)
        now = datetime.now(timezone.utc)
        entry = JournalEntry(
            voucher_no=voucher_no,
            entry_date=data.entry_date,
            memo=data.memo,
            reference=data.reference,
            status=target_status,
            created_by=user.id,
            submitted_by=user.id if target_status in ("pending_approval", "posted") else None,
            approved_by=user.id if target_status == "posted" else None,
            approved_at=now if target_status == "posted" else None,
            lines=[
                JournalLine(
                    account_id=line.account_id,
                    description=line.description,
                    debit=line.debit,
                    credit=line.credit,
                )
                for line in data.lines
            ],
        )
        db.add(entry)
        db.flush()
        record_audit(
            db,
            user.id,
            f"journal.{target_status}",
            "journal_entry",
            voucher_no,
            f"{voucher_no}: {data.memo}",
        )
        db.commit()
        db.refresh(entry)
        return _serialize_journal(db, entry)
    except Exception:
        db.rollback()
        raise


@router.post("/journals/{journal_id}/submit", response_model=JournalOut, tags=["Journal Workflow"])
def submit_journal_for_approval(
    journal_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("journals:create")),
):
    entry = db.scalar(
        select(JournalEntry).options(selectinload(JournalEntry.lines)).where(JournalEntry.id == journal_id)
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status not in ("draft", "rejected"):
        raise HTTPException(
            status_code=422,
            detail=f"Only draft or rejected journals can be submitted for approval (current: {entry.status})",
        )
    _ensure_open_fiscal_period(db, entry.entry_date)
    _validate_journal_lines(db, entry.lines)

    entry.status = "pending_approval"
    entry.submitted_by = user.id
    entry.rejection_reason = None
    record_audit(db, user.id, "journal.submitted", "journal_entry", entry.voucher_no or str(entry.id), entry.memo)
    db.commit()
    db.refresh(entry)
    return _serialize_journal(db, entry)


@router.post("/journals/{journal_id}/approve", response_model=JournalOut, tags=["Journal Workflow"])
def approve_and_post_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    approver: User = Depends(require_permission("journals:approve")),
):
    entry = db.scalar(
        select(JournalEntry).options(selectinload(JournalEntry.lines)).where(JournalEntry.id == journal_id)
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status not in ("pending_approval", "draft"):
        raise HTTPException(
            status_code=422,
            detail=f"Only draft or pending_approval journals can be approved (current: {entry.status})",
        )

    _ensure_open_fiscal_period(db, entry.entry_date)
    _validate_journal_lines(db, entry.lines)

    try:
        if not entry.voucher_no:
            entry.voucher_no = _next_voucher_no(db, entry.entry_date)
        entry.status = "posted"
        entry.approved_by = approver.id
        entry.approved_at = datetime.now(timezone.utc)
        entry.rejection_reason = None
        record_audit(
            db,
            approver.id,
            "journal.approved",
            "journal_entry",
            entry.voucher_no,
            f"Approved and posted '{entry.memo}'",
        )
        db.commit()
        db.refresh(entry)
        return _serialize_journal(db, entry)
    except Exception:
        db.rollback()
        raise


@router.post("/journals/{journal_id}/reject", response_model=JournalOut, tags=["Journal Workflow"])
def reject_journal(
    journal_id: int,
    payload: JournalRejectInput,
    db: Session = Depends(get_db),
    approver: User = Depends(require_permission("journals:approve")),
):
    entry = db.scalar(
        select(JournalEntry).options(selectinload(JournalEntry.lines)).where(JournalEntry.id == journal_id)
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if entry.status != "pending_approval":
        raise HTTPException(status_code=422, detail="Only pending_approval journals can be rejected")

    entry.status = "rejected"
    entry.rejection_reason = payload.reason
    record_audit(
        db,
        approver.id,
        "journal.rejected",
        "journal_entry",
        entry.voucher_no or str(entry.id),
        f"Rejected: {payload.reason}",
    )
    db.commit()
    db.refresh(entry)
    return _serialize_journal(db, entry)


@router.post("/journals/{journal_id}/reverse", response_model=JournalOut, tags=["Journal Workflow"])
def reverse_posted_journal(
    journal_id: int,
    reversal_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    approver: User = Depends(require_permission("journals:approve")),
):
    original = db.scalar(
        select(JournalEntry).options(selectinload(JournalEntry.lines)).where(JournalEntry.id == journal_id)
    )
    if not original:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    if original.status != "posted":
        raise HTTPException(status_code=422, detail="Only posted journals can be reversed")

    eff_date = reversal_date or original.entry_date
    _ensure_open_fiscal_period(db, eff_date)

    try:
        rev_voucher = _next_voucher_no(db, eff_date)
        now = datetime.now(timezone.utc)
        reversal = JournalEntry(
            voucher_no=rev_voucher,
            entry_date=eff_date,
            memo=f"Reversal of {original.voucher_no or original.id}: {original.memo}",
            reference=original.voucher_no or str(original.id),
            status="posted",
            created_by=approver.id,
            submitted_by=approver.id,
            approved_by=approver.id,
            approved_at=now,
            reversed_entry_id=original.id,
            lines=[
                JournalLine(
                    account_id=l.account_id,
                    description=f"Reversal: {l.description}" if l.description else "Reversal entry",
                    debit=Decimal(str(l.credit)),
                    credit=Decimal(str(l.debit)),
                )
                for l in original.lines
            ],
        )
        original.status = "reversed"
        db.add(reversal)
        db.flush()
        record_audit(
            db,
            approver.id,
            "journal.reversed",
            "journal_entry",
            rev_voucher,
            f"Reversed {original.voucher_no or original.id}",
        )
        db.commit()
        db.refresh(reversal)
        return _serialize_journal(db, reversal)
    except Exception:
        db.rollback()
        raise


def _format_signed_balance(net_dr_minus_cr: Decimal) -> tuple[Decimal, str]:
    if net_dr_minus_cr > ZERO:
        return net_dr_minus_cr, "DR"
    if net_dr_minus_cr < ZERO:
        return abs(net_dr_minus_cr), "CR"
    return ZERO, "ZERO"


@router.get("/reports/general-ledger", response_model=GeneralLedgerOut, tags=["Accounting Reports"])
def general_ledger_report(
    account_id: int = Query(...),
    start_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("reports:view")),
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Include both "posted" and "reversed" (since reversal creates an explicit offsetting posted entry!)
    # Wait: when original is reversed, BOTH original ("reversed") AND offsetting ("posted") lines exist in history,
    # so both must remain in the immutable General Ledger so historical dates show the posting + the reversal!
    POSTED_LEDGER_STATUSES = ("posted", "reversed")

    base_net = Decimal(str(account.opening_debit)) - Decimal(str(account.opening_credit))

    if start_date:
        prior_rows = db.execute(
            select(
                func.coalesce(func.sum(JournalLine.debit), ZERO),
                func.coalesce(func.sum(JournalLine.credit), ZERO),
            )
            .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
            .where(
                JournalLine.account_id == account.id,
                JournalEntry.status.in_(POSTED_LEDGER_STATUSES),
                JournalEntry.entry_date < start_date,
            )
        ).one()
        base_net += Decimal(str(prior_rows[0])).quantize(ZERO) - Decimal(str(prior_rows[1])).quantize(ZERO)

    opening_abs, opening_side = _format_signed_balance(base_net)

    stmt = (
        select(JournalLine, JournalEntry)
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(
            JournalLine.account_id == account.id,
            JournalEntry.status.in_(POSTED_LEDGER_STATUSES),
        )
        .order_by(JournalEntry.entry_date.asc(), JournalEntry.id.asc(), JournalLine.id.asc())
    )
    if start_date:
        stmt = stmt.where(JournalEntry.entry_date >= start_date)
    if end_date:
        stmt = stmt.where(JournalEntry.entry_date <= end_date)

    rows = db.execute(stmt).all()
    running_net = base_net
    period_debit = ZERO
    period_credit = ZERO
    movements: list[LedgerMovementRow] = []

    for jl, je in rows:
        dr = Decimal(str(jl.debit)).quantize(ZERO)
        cr = Decimal(str(jl.credit)).quantize(ZERO)
        period_debit += dr
        period_credit += cr
        running_net += dr - cr
        bal_abs, bal_side = _format_signed_balance(running_net)
        movements.append(
            LedgerMovementRow(
                line_id=jl.id,
                entry_id=je.id,
                voucher_no=je.voucher_no or f"JV-{je.id}",
                entry_date=je.entry_date,
                memo=je.memo,
                line_description=jl.description or "",
                debit=dr,
                credit=cr,
                running_balance=bal_abs,
                balance_side=bal_side,
            )
        )

    closing_abs, closing_side = _format_signed_balance(running_net)

    return GeneralLedgerOut(
        account_id=account.id,
        account_code=account.code,
        account_name_en=account.name_en,
        account_name_bn=account.name_bn,
        account_type=account.account_type,
        normal_balance=account.normal_balance,
        start_date=start_date,
        end_date=end_date,
        opening_balance=opening_abs,
        opening_side=opening_side,
        period_debit=period_debit,
        period_credit=period_credit,
        closing_balance=closing_abs,
        closing_side=closing_side,
        movements=movements,
    )


def _compute_verified_trial_balance(
    db: Session,
    start_date: Optional[str] = None,
    as_of_date: Optional[str] = None,
) -> VerifiedTrialBalanceOut:
    POSTED_LEDGER_STATUSES = ("posted", "reversed")
    accounts = db.scalars(select(Account).order_by(Account.code)).all()

    rows: list[TrialBalanceRow] = []
    total_od = ZERO
    total_oc = ZERO
    total_pd = ZERO
    total_pc = ZERO
    total_cd = ZERO
    total_cc = ZERO
    abnormal_codes: list[str] = []

    for acc in accounts:
        init_od = Decimal(str(acc.opening_debit)).quantize(ZERO)
        init_oc = Decimal(str(acc.opening_credit)).quantize(ZERO)
        open_net = init_od - init_oc

        if start_date:
            prior_q = (
                select(
                    func.coalesce(func.sum(JournalLine.debit), ZERO),
                    func.coalesce(func.sum(JournalLine.credit), ZERO),
                )
                .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
                .where(
                    JournalLine.account_id == acc.id,
                    JournalEntry.status.in_(POSTED_LEDGER_STATUSES),
                    JournalEntry.entry_date < start_date,
                )
            )
            p_dr, p_cr = db.execute(prior_q).one()
            open_net += Decimal(str(p_dr)).quantize(ZERO) - Decimal(str(p_cr)).quantize(ZERO)

        eff_od = open_net if open_net > ZERO else ZERO
        eff_oc = abs(open_net) if open_net < ZERO else ZERO

        mov_q = (
            select(
                func.coalesce(func.sum(JournalLine.debit), ZERO),
                func.coalesce(func.sum(JournalLine.credit), ZERO),
            )
            .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
            .where(
                JournalLine.account_id == acc.id,
                JournalEntry.status.in_(POSTED_LEDGER_STATUSES),
            )
        )
        if start_date:
            mov_q = mov_q.where(JournalEntry.entry_date >= start_date)
        if as_of_date:
            mov_q = mov_q.where(JournalEntry.entry_date <= as_of_date)

        m_dr_raw, m_cr_raw = db.execute(mov_q).one()
        m_dr = Decimal(str(m_dr_raw)).quantize(ZERO)
        m_cr = Decimal(str(m_cr_raw)).quantize(ZERO)

        closing_net = (eff_od + m_dr) - (eff_oc + m_cr)
        c_dr = closing_net if closing_net > ZERO else ZERO
        c_cr = abs(closing_net) if closing_net < ZERO else ZERO

        if eff_od == ZERO and eff_oc == ZERO and m_dr == ZERO and m_cr == ZERO and c_dr == ZERO and c_cr == ZERO:
            continue

        is_abnormal = (
            (acc.normal_balance == "debit" and closing_net < ZERO)
            or (acc.normal_balance == "credit" and closing_net > ZERO)
        )
        if is_abnormal:
            abnormal_codes.append(acc.code)

        total_od += eff_od
        total_oc += eff_oc
        total_pd += m_dr
        total_pc += m_cr
        total_cd += c_dr
        total_cc += c_cr

        rows.append(
            TrialBalanceRow(
                account_id=acc.id,
                account_code=acc.code,
                account_name=acc.name_en,
                account_name_bn=acc.name_bn,
                account_type=acc.account_type,
                normal_balance=acc.normal_balance,
                opening_debit=eff_od,
                opening_credit=eff_oc,
                period_debit=m_dr,
                period_credit=m_cr,
                debit=c_dr,
                credit=c_cr,
                is_abnormal_balance=is_abnormal,
            )
        )

    # Independent cross-reconciliation directly over journal_lines table
    raw_q = (
        select(
            func.coalesce(func.sum(JournalLine.debit), ZERO),
            func.coalesce(func.sum(JournalLine.credit), ZERO),
        )
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .where(JournalEntry.status.in_(POSTED_LEDGER_STATUSES))
    )
    if start_date:
        raw_q = raw_q.where(JournalEntry.entry_date >= start_date)
    if as_of_date:
        raw_q = raw_q.where(JournalEntry.entry_date <= as_of_date)

    raw_dr_val, raw_cr_val = db.execute(raw_q).one()
    raw_dr = Decimal(str(raw_dr_val)).quantize(ZERO)
    raw_cr = Decimal(str(raw_cr_val)).quantize(ZERO)

    unposted_count = db.scalar(
        select(func.count(JournalEntry.id)).where(
            JournalEntry.status.in_(("draft", "pending_approval", "rejected"))
        )
    ) or 0

    algebraic_lhs = (total_od - total_oc) + (total_pd - total_pc)
    algebraic_rhs = total_cd - total_cc
    discrepancy = abs(algebraic_lhs - algebraic_rhs) + abs(total_pd - raw_dr) + abs(total_pc - raw_cr)

    verification = TrialBalanceVerification(
        is_opening_balanced=(total_od == total_oc),
        is_movement_balanced=(total_pd == total_pc),
        is_closing_balanced=(total_cd == total_cc),
        ledger_reconciled=(discrepancy == ZERO and raw_dr == raw_cr),
        raw_journal_debit_sum=raw_dr,
        raw_journal_credit_sum=raw_cr,
        reconciliation_discrepancy=discrepancy,
        excluded_unposted_journals=unposted_count,
        abnormal_balance_codes=abnormal_codes,
        safeguard_notice_en=(
            "Trial Balance applies normal-balance presentation rules and independent ledger sum verification. "
            "Complete year-end closing entries and independent CPA/CA review before statutory financial filing."
        ),
        safeguard_notice_bn=(
            "এই ট্রায়াল ব্যালেন্সে নরমাল-ব্যালেন্স নিয়ম এবং স্বতন্ত্র লেজার যাচাইকরণ প্রয়োগ করা হয়েছে। "
            "আনুষ্ঠানিক আর্থিক বিবরণী দাখিলের পূর্বে বর্ষসমাপ্তি এন্ট্রি ও নিরীক্ষকের যাচাই সম্পন্ন করুন।"
        ),
    )

    return VerifiedTrialBalanceOut(
        start_date=start_date,
        as_of_date=as_of_date,
        rows=rows,
        total_opening_debit=total_od,
        total_opening_credit=total_oc,
        total_period_debit=total_pd,
        total_period_credit=total_pc,
        total_closing_debit=total_cd,
        total_closing_credit=total_cc,
        verification=verification,
    )


@router.get("/reports/trial-balance", response_model=list[TrialBalanceRow], tags=["Accounting Reports"])
def trial_balance(
    start_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    as_of_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("reports:view")),
):
    report = _compute_verified_trial_balance(db, start_date=start_date, as_of_date=as_of_date)
    return report.rows


@router.get("/reports/trial-balance/verified", response_model=VerifiedTrialBalanceOut, tags=["Accounting Reports"])
def verified_trial_balance(
    start_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    as_of_date: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("reports:view")),
):
    return _compute_verified_trial_balance(db, start_date=start_date, as_of_date=as_of_date)
