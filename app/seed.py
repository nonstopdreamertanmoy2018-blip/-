from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import (
    BOOTSTRAP_ADMIN_PASSWORD,
    BOOTSTRAP_ADMIN_USERNAME,
    SEED_DEMO_DATA,
)
from app.database import Base, SessionLocal, engine
from app.models import (
    ACCOUNT_NORMAL_BALANCE_MAP,
    VALID_ROLES,
    Account,
    AttendanceRecord,
    BusinessDocument,
    BusinessDocumentItem,
    CompanyProfile,
    Employee,
    FiscalPeriod,
    JournalEntry,
    JournalLine,
    RolePermission,
    SalaryPayment,
    User,
)
from app.permissions_catalog import DEFAULT_ROLE_PERMISSIONS, PERMISSIONS_CATALOG
from app.security import password_hash

ZERO = Decimal("0.00")


def bootstrap_database(seed_demo: bool | None = None) -> None:
    Base.metadata.create_all(engine)
    should_seed_demo = SEED_DEMO_DATA if seed_demo is None else seed_demo

    with SessionLocal() as db:
        admin = _ensure_bootstrap_admin(db)
        _ensure_permission_matrix(db, admin.id)
        _ensure_company_and_fiscal_period(db)
        if should_seed_demo:
            _seed_synthetic_demo_data(db, admin)
            _seed_employees_attendance_and_payroll(db, admin)
        else:
            _ensure_clean_production_foundation(db)
        db.commit()


def _ensure_bootstrap_admin(db: Session) -> User:
    admin = db.scalar(select(User).where(User.username == BOOTSTRAP_ADMIN_USERNAME))
    if not admin:
        admin = User(
            username=BOOTSTRAP_ADMIN_USERNAME,
            full_name_en="System Administrator",
            full_name_bn="সিস্টেম প্রশাসক",
            email="admin@nextgentechnix.com",
            password_digest=password_hash.hash(BOOTSTRAP_ADMIN_PASSWORD),
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.flush()
    return admin


def _ensure_clean_production_foundation(db: Session) -> None:
    role_accounts = [
        ("accountant", "Chief Accountant", "প্রধান হিসাবরক্ষক", "accounts@nextgentechnix.com", "accountant", "NextGen-Acc-2026!"),
        ("hr_payroll", "HR & Payroll Manager", "মানবসম্পদ ও পেরোল ব্যবস্থাপক", "hr@nextgentechnix.com", "hr", "NextGen-HR-2026!"),
        ("project_manager", "Lead Project Manager", "লিড প্রজেক্ট ম্যানেজার", "pm@nextgentechnix.com", "project_manager", "NextGen-PM-2026!"),
        ("sales_exec", "Senior Sales Executive", "সিনিয়র বিক্রয় কর্মকর্তা", "sales@nextgentechnix.com", "sales", "NextGen-Sales-2026!"),
        ("employee", "Software Engineer", "সফটওয়্যার প্রকৌশলী", "engineer@nextgentechnix.com", "employee", "NextGen-Staff-2026!"),
    ]
    for uname, name_en, name_bn, email, role, init_pw in role_accounts:
        if not db.scalar(select(User).where(User.username == uname)):
            db.add(
                User(
                    username=uname,
                    full_name_en=name_en,
                    full_name_bn=name_bn,
                    email=email,
                    password_digest=password_hash.hash(init_pw),
                    role=role,
                    is_active=True,
                )
            )
    if (db.scalar(select(func.count(Account.id))) or 0) == 0:
        coa_specs = [
            ("1010", "Petty Cash in Hand", "হাতে খুচরা নগদ", "asset", "Corporate office petty cash float"),
            ("1020", "Operating Bank Account (BDT)", "চলতি ব্যাংক হিসাব (বিডিটি)", "asset", "Primary corporate operating bank account"),
            ("1100", "Accounts Receivable — Clients", "প্রাপ্য হিসাব — গ্রাহকবৃন্দ", "asset", "Billed software engineering & AMC client receivables"),
            ("1200", "Staff Salary Advance & Deposits", "কর্মী অগ্রিম ও নিরাপত্তা জমা", "asset", "Employee salary advances and security deposits"),
            ("1500", "Server & Workstation Hardware", "সার্ভার ও কম্পিউটার সরঞ্জাম", "asset", "Engineering workstations, servers, and office equipment"),
            ("2010", "Accounts Payable — Vendors", "প্রদেয় হিসাব — সরবরাহকারী", "liability", "Cloud infrastructure and supplier bills payable"),
            ("2100", "Unearned AMC & Retainer Revenue", "অনুপার্জিত রক্ষণাবেক্ষণ আয়", "liability", "Advance client retainers pending milestone delivery"),
            ("2200", "Accrued Salaries & Statutory Payable", "বকেয়া বেতন ও বিধিবদ্ধ প্রদেয়", "liability", "Accrued monthly payroll and withholding tax obligations"),
            ("3010", "Paid-Up Share Capital", "পরিশোধিত শেয়ার মূলধন", "equity", "Authorized and paid-up company share capital"),
            ("3020", "Retained Earnings", "সংরক্ষিত আয়", "equity", "Accumulated retained earnings and reserves"),
            ("4010", "Custom Software Engineering Revenue", "কাস্টম সফটওয়্যার উন্নয়ন আয়", "revenue", "Custom software, web, mobile, and ERP project billing"),
            ("4020", "Cloud Hosting & AMC Support Revenue", "ক্লাউড ও বার্ষিক রক্ষণাবেক্ষণ আয়", "revenue", "Recurring SLA maintenance, cloud hosting, and DevOps fees"),
            ("5010", "Staff Salaries & Allowances", "কর্মকর্তা ও কর্মচারীদের বেতন-ভাতা", "expense", "Monthly employee salaries, allowances, bonuses, and overtime"),
            ("5020", "Office Rent & Utilities", "অফিস ভাড়া ও উপযোগ খরচ", "expense", "Corporate office lease, electricity, water, and fiber internet"),
            ("5030", "Cloud Infrastructure & DevOps Cost", "ক্লাউড অবকাঠামো ও ডেভঅপস ব্যয়", "expense", "Production servers, domains, CI/CD, and software licenses"),
            ("5040", "Office, Marketing & Conveyance", "অফিস, মার্কেটিং ও যাতায়াত ব্যয়", "expense", "Stationery, business development, conveyance, and admin costs"),
        ]
        for code, name_en, name_bn, atype, desc in coa_specs:
            db.add(
                Account(
                    code=code,
                    name_en=name_en,
                    name_bn=name_bn,
                    account_type=atype,
                    normal_balance=ACCOUNT_NORMAL_BALANCE_MAP[atype],
                    description_en=desc,
                    opening_debit=ZERO,
                    opening_credit=ZERO,
                    is_system=True,
                    is_active=True,
                )
            )
    db.flush()


def _ensure_permission_matrix(db: Session, admin_id: int) -> None:
    existing = {
        (r.role, r.permission_key)
        for r in db.scalars(select(RolePermission)).all()
    }
    for role in VALID_ROLES:
        defaults = DEFAULT_ROLE_PERMISSIONS.get(role, set())
        for perm in PERMISSIONS_CATALOG:
            pkey = perm["key"]
            if (role, pkey) not in existing:
                db.add(
                    RolePermission(
                        role=role,
                        permission_key=pkey,
                        allowed=(pkey in defaults),
                        updated_by=admin_id,
                    )
                )
    db.flush()


def _ensure_company_and_fiscal_period(db: Session) -> None:
    cp = db.scalar(select(CompanyProfile))
    if not cp:
        db.add(
            CompanyProfile(
                name_en="NEXTGEN TECHNIX LIMITED",
                name_bn="নেক্সটজেন টেকনিক্স লিমিটেড",
                tagline_en="Premier IT Company & Custom Software Engineering Studio · Enterprise ERP",
                tagline_bn="শীর্ষস্থানীয় আইটি ও সফটওয়্যার নির্মাতা প্রতিষ্ঠান · এন্টারপ্রাইজ ইআরপি",
                logo_url="/company-logo.jpg",
                banner_url="/company-hq.jpg",
                email="info@nextgentechnix.com",
                website="https://www.nextgentechnix.com",
                is_demo_environment=False,
            )
        )
    else:
        if not cp.logo_url:
            cp.logo_url = "/company-logo.jpg"
        if not cp.banner_url:
            cp.banner_url = "/company-hq.jpg"

    if not db.scalar(select(FiscalPeriod)):
        db.add(
            FiscalPeriod(
                name="FY 2026-2027 (Jul 2026 – Jun 2027)",
                start_date="2026-07-01",
                end_date="2027-06-30",
                is_closed=False,
            )
        )
        db.add(
            FiscalPeriod(
                name="FY 2025-2026 (Jul 2025 – Jun 2026)",
                start_date="2025-07-01",
                end_date="2026-06-30",
                is_closed=False,
            )
        )
    db.flush()


def _seed_synthetic_demo_data(db: Session, admin: User) -> None:
    if (db.scalar(select(func.count(Account.id))) or 0) > 0:
        return

    demo_pw = password_hash.hash("DemoPass-2026!")
    demo_staff = [
        ("rahim_acc", "Rahim Uddin (Demo)", "রহিম উদ্দিন (ডেমো)", "rahim.acc@nextgentechnix-demo.example", "accountant", True),
        ("nusrat_hr", "Nusrat Jahan (Demo)", "নুসরাত জাহান (ডেমো)", "nusrat.hr@nextgentechnix-demo.example", "hr", True),
        ("tanvir_pm", "Tanvir Ahmed (Demo)", "তানভীর আহমেদ (ডেমো)", "tanvir.pm@nextgentechnix-demo.example", "project_manager", True),
        ("farhana_sales", "Farhana Karim (Demo)", "ফারহানা করিম (ডেমো)", "farhana.sales@nextgentechnix-demo.example", "sales", True),
        ("kamal_dev", "Kamal Hossain (Demo)", "কামাল হোসেন (ডেমো)", "kamal.dev@nextgentechnix-demo.example", "employee", True),
        ("former_intern", "Sadia Akter (Inactive Demo)", "সাদিয়া আক্তার (নিষ্ক্রিয় ডেমো)", "sadia@nextgentechnix-demo.example", "employee", False),
    ]
    users_by_username: dict[str, User] = {admin.username: admin}
    for uname, name_en, name_bn, email, role, active in demo_staff:
        existing_u = db.scalar(select(User).where(User.username == uname))
        if not existing_u:
            existing_u = User(
                username=uname,
                full_name_en=name_en,
                full_name_bn=name_bn,
                email=email,
                password_digest=demo_pw,
                role=role,
                is_active=active,
                deactivated_at=None if active else datetime.now(timezone.utc),
                deactivated_by=None if active else admin.id,
            )
            db.add(existing_u)
            db.flush()
        users_by_username[uname] = existing_u

    accountant = users_by_username["rahim_acc"]

    # ALL OPENING BALANCES STRICTLY ZERO (0.00 DR / 0.00 CR)
    coa_specs = [
        ("1010", "Petty Cash in Hand", "হাতে খুচরা নগদ", "asset", "Dhaka office petty cash float"),
        ("1020", "Operating Bank Account (BDT)", "চলতি ব্যাংক হিসাব (বিডিটি)", "asset", "Primary corporate operating bank account"),
        ("1100", "Accounts Receivable — Clients", "প্রাপ্য হিসাব — গ্রাহকবৃন্দ", "asset", "Billed software development & AMC receivables"),
        ("1200", "Staff Salary Advance & Deposits", "কর্মী অগ্রিম ও নিরাপত্তা জমা", "asset", "Employee advances & office deposits"),
        ("1500", "Server & Workstation Hardware", "সার্ভার ও কম্পিউটার সরঞ্জাম", "asset", "Development laptops and test rack hardware"),
        ("2010", "Accounts Payable — Vendors", "প্রদেয় হিসাব — সরবরাহকারী", "liability", "Supplier and hosting invoices payable"),
        ("2100", "Unearned AMC & Retainer Revenue", "অনুপার্জিত রক্ষণাবেক্ষণ আয়", "liability", "Advance client retainers pending service delivery"),
        ("2200", "Accrued Salaries & Statutory Payable", "বকেয়া বেতন ও বিধিবদ্ধ প্রদেয়", "liability", "Monthly payroll obligations"),
        ("3010", "Paid-Up Share Capital", "পরিশোধিত শেয়ার মূলধন", "equity", "Authorized synthetic founder capital"),
        ("3020", "Retained Earnings", "সংরক্ষিত আয়", "equity", "Accumulated net surplus/deficit"),
        ("4010", "Custom Software Engineering Revenue", "কাস্টম সফটওয়্যার উন্নয়ন আয়", "revenue", "Milestone billing for custom ERP and web platforms"),
        ("4020", "Cloud Hosting & AMC Support Revenue", "ক্লাউড ও বার্ষিক রক্ষণাবেক্ষণ আয়", "revenue", "Recurring SLA and DevOps support fees"),
        ("5010", "Staff Salaries & Allowances", "কর্মকর্তা ও কর্মচারীদের বেতন-ভাতা", "expense", "Monthly staff salary, allowances, and overtime"),
        ("5020", "Dhaka Office Rent & Utilities", "ঢাকা অফিস ভাড়া ও উপযোগ খরচ", "expense", "Office lease, electricity, and fiber internet"),
        ("5030", "Cloud Infrastructure & DevOps Cost", "ক্লাউড অবকাঠামো ও ডেভঅপস ব্যয়", "expense", "Production cluster, CI/CD, and backup storage"),
        ("5040", "Printing, Stationery & Conveyance", "মুদ্রণ, স্টেশনারি ও যাতায়াত ব্যয়", "expense", "Office supplies, conveyance, and documentation"),
    ]

    acc_by_code: dict[str, Account] = {}
    for code, name_en, name_bn, atype, desc in coa_specs:
        acc = Account(
            code=code,
            name_en=name_en,
            name_bn=name_bn,
            account_type=atype,
            normal_balance=ACCOUNT_NORMAL_BALANCE_MAP[atype],
            description_en=desc,
            opening_debit=ZERO,
            opening_credit=ZERO,
            is_system=True,
            is_active=True,
        )
        db.add(acc)
        db.flush()
        acc_by_code[code] = acc

    now = datetime.now(timezone.utc)

    journals_seed = [
        (
            "JV-2026-0001",
            "2026-10-01",
            "Founder share capital deposited into Operating Bank & Workstation assets",
            "CAP-2026-01",
            "posted",
            accountant.id,
            admin.id,
            [
                ("1020", "Bank capital deposit", Decimal("600000.00"), ZERO),
                ("1500", "Workstation & biometric attendance equipment", Decimal("150000.00"), ZERO),
                ("3010", "Paid-up share capital issuance", ZERO, Decimal("750000.00")),
            ],
        ),
        (
            "JV-2026-0002",
            "2026-10-04",
            "Billed Meghna Logistics Ltd (Demo) for ERP Phase-1 Architecture Milestone",
            "INV-2026-0001",
            "posted",
            accountant.id,
            admin.id,
            [
                ("1100", "Client receivable INV-2026-0001", Decimal("185000.00"), ZERO),
                ("4010", "ERP Phase-1 milestone delivery", ZERO, Decimal("185000.00")),
            ],
        ),
        (
            "JV-2026-0003",
            "2026-10-08",
            "Received RTGS bank settlement from Meghna Logistics Ltd against INV-2026-0001",
            "MR-2026-0001",
            "posted",
            accountant.id,
            admin.id,
            [
                ("1020", "RTGS bank settlement received", Decimal("120000.00"), ZERO),
                ("1100", "Applied against INV-2026-0001", ZERO, Decimal("120000.00")),
            ],
        ),
        (
            "JV-2026-0004",
            "2026-10-12",
            "Paid October Gulshan office rent and redundant fiber connectivity",
            "PV-2026-0001",
            "posted",
            accountant.id,
            admin.id,
            [
                ("5020", "October office lease & dual-ISP fiber", Decimal("65000.00"), ZERO),
                ("1020", "Paid via corporate bank transfer", ZERO, Decimal("65000.00")),
            ],
        ),
        (
            "JV-2026-0005",
            "2026-10-18",
            "Transferred petty cash float for Dhaka office conveyance & stationery",
            "PC-2026-10",
            "posted",
            accountant.id,
            accountant.id,
            [
                ("1010", "Petty cash replenishment", Decimal("35000.00"), ZERO),
                ("1020", "Cash withdrawal from operating bank", ZERO, Decimal("35000.00")),
            ],
        ),
        (
            "JV-2026-0006",
            "2026-10-25",
            "Accrued October cloud cluster hosting & managed PostgreSQL staging bill (Awaiting Approval)",
            "VENDOR-CLOUD-10",
            "pending_approval",
            accountant.id,
            None,
            [
                ("5030", "October Kubernetes & staging DB hosting", Decimal("28500.00"), ZERO),
                ("2010", "Payable to Bengal Cloud Host (Demo)", ZERO, Decimal("28500.00")),
            ],
        ),
    ]

    for vno, edate, memo, ref, st, c_by, a_by, lines in journals_seed:
        je = JournalEntry(
            voucher_no=vno,
            entry_date=edate,
            memo=memo,
            reference=ref,
            status=st,
            created_by=c_by,
            submitted_by=c_by if st in ("pending_approval", "posted") else None,
            approved_by=a_by,
            approved_at=now if a_by else None,
            lines=[
                JournalLine(
                    account_id=acc_by_code[acode].id,
                    description=ldesc,
                    debit=dr,
                    credit=cr,
                )
                for acode, ldesc, dr, cr in lines
            ],
        )
        db.add(je)
    db.flush()

    docs_seed = [
        BusinessDocument(
            doc_type="letterhead",
            doc_number="LH-2026-0001",
            issue_date="2026-10-20",
            party_name_en="Director of Information Systems, Padma Textiles PLC (Synthetic Demo)",
            party_name_bn="পরিচালক (তথ্যপ্রযুক্তি), পদ্মা টেক্সটাইলস পিএলসি (সিনথেটিক ডেমো)",
            party_address="Plot 19, Tejgaon Industrial Area, Dhaka-1208",
            subject_en="Project Kickoff Confirmation & Monthly Attendance-Payroll Integration",
            subject_bn="প্রজেক্ট সূচনা নিশ্চিতকরণ ও উপস্থিতি-বেতন ইন্টিগ্রেশন প্রসঙ্গে",
            body_en=(
                "Dear Sir/Madam,\n\n"
                "We are pleased to confirm the formal commencement of the Custom Software Engineering, Biometric Attendance, "
                "Payroll & Enterprise Accounting engagement between NEXTGEN TECHNIX LIMITED and Padma Textiles PLC (Synthetic Demo).\n\n"
                "Sincerely,\nSoftware Engineering & Management Office\nNEXTGEN TECHNIX LIMITED"
            ),
            body_bn=(
                "মহোদয়,\n\n"
                "আনন্দের সাথে জানানো যাচ্ছে যে শীর্ষস্থানীয় আইটি ও সফটওয়্যার নির্মাতা প্রতিষ্ঠান নেক্সটজেন টেকনিক্স লিমিটেড এবং "
                "পদ্মা টেক্সটাইলস পিএলসি (সিনথেটিক ডেমো)-এর মধ্যে কাস্টম সফটওয়্যার, উপস্থিতি, পেরোল ও অ্যাকাউন্টিং প্রকল্পের আনুষ্ঠানিক কার্যক্রম শুরু হয়েছে।"
            ),
            payment_method="N/A — Official Correspondence",
            created_by=admin.id,
        ),
        BusinessDocument(
            doc_type="payment_voucher",
            doc_number="PV-2026-0001",
            issue_date="2026-10-12",
            party_name_en="Gulshan Commercial Properties Ltd (Synthetic Demo)",
            party_name_bn="গুলশান কমার্শিয়াল প্রপার্টিজ লিমিটেড (সিনথেটিক ডেমো)",
            party_address="Gulshan-2 Circle, Dhaka-1212",
            subject_en="October 2026 Office Lease & Redundant Fiber Facility Settlement",
            subject_bn="অক্টোবর ২০২৬ অফিস ভাড়া ও ফাইবার ইন্টারনেট বিল পরিশোধ",
            payment_method="Corporate Bank EFTN",
            created_by=accountant.id,
            items=[
                BusinessDocumentItem(
                    description_en="Monthly Office Floor Lease — October 2026 (Demo)",
                    description_bn="মাসিক অফিস ফ্লোর ভাড়া — অক্টোবর ২০২৬ (ডেমো)",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("55000.00"),
                    amount=Decimal("55000.00"),
                ),
                BusinessDocumentItem(
                    description_en="Dedicated Dual-ISP Fiber Connectivity & Backup Power",
                    description_bn="ডেডিকেটেড ডুয়াল-আইএসপি ফাইবার ও ব্যাকআপ পাওয়ার চার্জ",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("10000.00"),
                    amount=Decimal("10000.00"),
                ),
            ],
        ),
        BusinessDocument(
            doc_type="receipt",
            doc_number="MR-2026-0001",
            issue_date="2026-10-08",
            party_name_en="Meghna Logistics Ltd (Synthetic Demo)",
            party_name_bn="মেঘনা লজিস্টিকস লিমিটেড (সিনথেটিক ডেমো)",
            party_address="Banani Liaison Office, Dhaka",
            subject_en="Partial Settlement Received Against Invoice INV-2026-0001",
            subject_bn="ইনভয়েস INV-2026-0001 এর বিপরীতে আংশিক অর্থ প্রাপ্তি",
            payment_method="RTGS Bank Transfer (Ref: DEMO-RTGS-88412)",
            created_by=accountant.id,
            items=[
                BusinessDocumentItem(
                    description_en="First Milestone Receipt — ERP Phase-1 Architecture (Against INV-2026-0001)",
                    description_bn="প্রথম মাইলস্টোন রসিদ — ইআরপি ফেজ-১ আর্কিটেকচার (INV-2026-0001)",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("120000.00"),
                    amount=Decimal("120000.00"),
                ),
            ],
        ),
        BusinessDocument(
            doc_type="quotation",
            doc_number="QT-2026-0001",
            issue_date="2026-10-22",
            due_date="2026-11-22",
            party_name_en="Surma Healthcare Diagnostics Ltd (Synthetic Demo)",
            party_name_bn="সুরমা হেলথকেয়ার ডায়াগনস্টিকস লিমিটেড (সিনথেটিক ডেমো)",
            party_address="Zindabazar, Sylhet-3100, Bangladesh",
            subject_en="Commercial Proposal for Biometric Attendance, Salary & Billing Suite",
            subject_bn="বায়োমেট্রিক হাজিরা, বেতন ও বিলিং সফটওয়্যার প্রস্তাবনা",
            payment_method="50% Mobilization / 50% UAT Sign-off",
            discount_amount=Decimal("15000.00"),
            tax_rate_percent=Decimal("5.00"),
            created_by=users_by_username["farhana_sales"].id,
            items=[
                BusinessDocumentItem(
                    description_en="Bilingual Attendance, Shift & Automated Salary Sheet Engine",
                    description_bn="দ্বিভাষিক উপস্থিতি ও স্বয়ংক্রিয় বেতন শীট ইঞ্জিন",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("160000.00"),
                    amount=Decimal("160000.00"),
                ),
                BusinessDocumentItem(
                    description_en="Payment Voucher, Payslip PDF Print & Encrypted Backup Module",
                    description_bn="পেমেন্ট ভাউচার, পে-স্লিপ প্রিন্ট ও ব্যাকআপ মডিউল",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("85000.00"),
                    amount=Decimal("85000.00"),
                ),
            ],
        ),
        BusinessDocument(
            doc_type="invoice",
            doc_number="INV-2026-0001",
            issue_date="2026-10-04",
            due_date="2026-11-03",
            party_name_en="Meghna Logistics Ltd (Synthetic Demo)",
            party_name_bn="মেঘনা লজিস্টিকস লিমিটেড (সিনথেটিক ডেমো)",
            party_address="Banani Road 11, Dhaka-1213, Bangladesh",
            subject_en="Milestone-1 Invoice: Core Accounting & Fleet Dispatch Module",
            subject_bn="মাইলস্টোন-১ চালান: কোর অ্যাকাউন্টিং ও ফ্লিট ডিসপ্যাচ মডিউল",
            payment_method="Crossed Account Payee Cheque / RTGS",
            created_by=accountant.id,
            items=[
                BusinessDocumentItem(
                    description_en="System Architecture, PostgreSQL Schema & Alembic Migration Setup",
                    description_bn="সিস্টেম আর্কিটেকচার, পোস্টগ্রেএসকিউএল স্কিমা ও মাইগ্রেশন সেটআপ",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("95000.00"),
                    amount=Decimal("95000.00"),
                ),
                BusinessDocumentItem(
                    description_en="Role Permission Matrix & Double-Entry Voucher Engine",
                    description_bn="রোল পারমিশন ম্যাট্রিক্স ও ডাবল-এন্ট্রি ভাউচার ইঞ্জিন",
                    quantity=Decimal("1.00"),
                    unit_price=Decimal("90000.00"),
                    amount=Decimal("90000.00"),
                ),
            ],
        ),
    ]
    for d in docs_seed:
        db.add(d)
    db.flush()


def _seed_employees_attendance_and_payroll(db: Session, admin: User) -> None:
    if (db.scalar(select(func.count(Employee.id))) or 0) > 0:
        return

    emp_specs = [
        ("EMP-001", "Tanvir Ahmed", "তানভীর আহমেদ", "Lead Project Manager", "লিড প্রজেক্ট ম্যানেজার", "Engineering", "+880 1700-000001", "2025-07-01", Decimal("45000.00"), Decimal("20000.00"), Decimal("5000.00"), Decimal("5000.00"), "Bank Transfer", "SB-DEMO-1001"),
        ("EMP-002", "Rahim Uddin", "রহিম উদ্দিন", "Senior Accountant", "সিনিয়র হিসাবরক্ষক", "Finance & Accounts", "+880 1700-000002", "2025-08-01", Decimal("36000.00"), Decimal("16000.00"), Decimal("4000.00"), Decimal("4000.00"), "Bank Transfer", "SB-DEMO-1002"),
        ("EMP-003", "Nusrat Jahan", "নুসরাত জাহান", "HR & Admin Specialist", "মানবসম্পদ ও প্রশাসন কর্মকর্তা", "HR & Administration", "+880 1700-000003", "2025-09-15", Decimal("30000.00"), Decimal("14000.00"), Decimal("3500.00"), Decimal("3500.00"), "Bank Transfer", "SB-DEMO-1003"),
        ("EMP-004", "Kamal Hossain", "কামাল হোসেন", "Full-Stack Software Engineer", "ফুল-স্ট্যাক সফটওয়্যার প্রকৌশলী", "Engineering", "+880 1700-000004", "2026-01-10", Decimal("34000.00"), Decimal("15000.00"), Decimal("3500.00"), Decimal("3500.00"), "Bank Transfer", "SB-DEMO-1004"),
        ("EMP-005", "Farhana Karim", "ফারহানা করিম", "Corporate Sales Executive", "কর্পোরেট বিক্রয় কর্মকর্তা", "Sales & Growth", "+880 1700-000005", "2026-02-01", Decimal("28000.00"), Decimal("12000.00"), Decimal("3000.00"), Decimal("3000.00"), "bKash Corporate", "BKASH-DEMO-05"),
        ("EMP-006", "Arifur Rahman", "আরিফুর রহমান", "Office Support & Dispatch Coordinator", "অফিস সহায়তা ও ডিসপ্যাচ সমন্বয়ক", "Administration", "+880 1700-000006", "2026-03-01", Decimal("16000.00"), Decimal("7000.00"), Decimal("2000.00"), Decimal("2000.00"), "Cash", "CASH-PAYROLL"),
    ]

    employees: list[Employee] = []
    for code, nen, nbn, den, dbn, dept, ph, jdate, basic, hr, med, tr, pm, bank in emp_specs:
        emp = Employee(
            emp_code=code,
            full_name_en=nen,
            full_name_bn=nbn,
            designation_en=den,
            designation_bn=dbn,
            department=dept,
            phone=ph,
            email=f"{code.lower()}@nextgentechnix-demo.example",
            join_date=jdate,
            basic_salary=basic,
            house_rent=hr,
            medical_allowance=med,
            transport_allowance=tr,
            payment_method_pref=pm,
            bank_account_no=bank,
            is_active=True,
        )
        db.add(emp)
        db.flush()
        employees.append(emp)

    # Seed realistic attendance days in October 2026 (including 2026-10-28 today!)
    sample_dates = [
        "2026-10-22",
        "2026-10-24",
        "2026-10-25",
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
    ]
    for d_idx, dt in enumerate(sample_dates):
        for e_idx, emp in enumerate(employees):
            status = "present"
            cin = "09:00"
            cout = "18:05"
            ot = ZERO
            note = ""
            if e_idx == 3 and d_idx == 2:
                status = "late"
                cin = "09:42"
                note = "Traffic delay"
            elif e_idx == 4 and d_idx == 1:
                status = "leave"
                cin = "--:--"
                cout = "--:--"
                note = "Approved casual leave"
            elif e_idx == 5 and d_idx == 3:
                status = "absent"
                cin = "--:--"
                cout = "--:--"
                note = "Uninformed absence"
            elif e_idx == 3 and d_idx == 5:
                ot = Decimal("3.00")
                cout = "21:00"
                note = "Release deployment overtime"

            db.add(
                AttendanceRecord(
                    employee_id=emp.id,
                    attendance_date=dt,
                    status=status,
                    check_in=cin,
                    check_out=cout,
                    overtime_hours=ot,
                    note=note,
                )
            )
    db.flush()

    # Generate initial October 2026 payroll slips (with EMP-001 already paid via Bank Transfer!)
    sal_exp_acc = db.scalar(select(Account).where(Account.code == "5010"))
    bank_acc = db.scalar(select(Account).where(Account.code == "1020"))

    for emp in employees:
        basic = Decimal(str(emp.basic_salary))
        gross = basic + Decimal(str(emp.house_rent)) + Decimal(str(emp.medical_allowance)) + Decimal(str(emp.transport_allowance))
        absent_d = 1 if emp.emp_code == "EMP-006" else 0
        leave_d = 1 if emp.emp_code == "EMP-005" else 0
        late_d = 1 if emp.emp_code == "EMP-004" else 0
        ot_hrs = Decimal("3.00") if emp.emp_code == "EMP-004" else ZERO

        abs_ded = ((Decimal(absent_d) * basic) / Decimal("30.00")).quantize(ZERO)
        ot_pay = (ot_hrs * ((basic / Decimal("208.00")) * Decimal("1.50"))).quantize(ZERO)
        bonus = Decimal("5000.00") if emp.emp_code == "EMP-001" else ZERO
        net = (gross + ot_pay + bonus - abs_ded).quantize(ZERO)

        is_paid = emp.emp_code == "EMP-001"
        linked_jid = None

        if is_paid and sal_exp_acc and bank_acc:
            je = JournalEntry(
                voucher_no="JV-2026-0007",
                entry_date="2026-10-28",
                memo=f"Salary Disbursement (2026-10) — {emp.full_name_en} (PAY-202610-{emp.id:03d})",
                reference=f"PAY-202610-{emp.id:03d}",
                status="posted",
                created_by=admin.id,
                submitted_by=admin.id,
                approved_by=admin.id,
                approved_at=datetime.now(timezone.utc),
                lines=[
                    JournalLine(account_id=sal_exp_acc.id, description=f"Salary 2026-10 {emp.emp_code}", debit=net, credit=ZERO),
                    JournalLine(account_id=bank_acc.id, description="Salary bank transfer", debit=ZERO, credit=net),
                ],
            )
            db.add(je)
            db.flush()
            linked_jid = je.id

        db.add(
            SalaryPayment(
                payslip_no=f"PAY-202610-{emp.id:03d}",
                employee_id=emp.id,
                salary_month="2026-10",
                payment_date="2026-10-28" if is_paid else None,
                working_days=26,
                present_days=22 - absent_d - leave_d,
                late_days=late_d,
                half_days=0,
                leave_days=leave_d,
                absent_days=absent_d,
                overtime_hours=ot_hrs,
                basic_salary=basic,
                house_rent=emp.house_rent,
                medical_allowance=emp.medical_allowance,
                transport_allowance=emp.transport_allowance,
                gross_salary=gross,
                overtime_pay=ot_pay,
                bonus_amount=bonus,
                absent_deduction=abs_ded,
                advance_deduction=ZERO,
                tax_deduction=ZERO,
                net_payable=net,
                payment_method=emp.payment_method_pref,
                status="paid" if is_paid else "pending",
                linked_journal_id=linked_jid,
                notes="Performance milestone bonus included" if is_paid else "",
                created_by=admin.id,
            )
        )
    db.flush()
