from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_NAME
from app.database import Base, SessionLocal, engine, get_db
from app.models import (
    Account,
    AttendanceRecord,
    AuditLog,
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
from app.routers import accounting, auth_users, backup, documents, hr_payroll
from app.seed import bootstrap_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bootstrap_database()
    yield


app = FastAPI(
    title=APP_NAME,
    version="0.3.0",
    description=(
        "NEXTGEN TECHNIX LIMITED ERP — Premier IT Company & Custom Software Engineering Studio · "
        "Salary, Payments, Attendance, Accounting & Backup Suite. "
        "Synthetic demonstration environment; complete production hardening and accountant review before live use."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_users.router)
app.include_router(accounting.router)
app.include_router(hr_payroll.router)
app.include_router(documents.router)
app.include_router(backup.router)


@app.get("/health", tags=["System"])
def health():
    return {"status": "ok", "service": APP_NAME, "version": "0.3.0"}


@app.get("/", tags=["System"])
def root():
    return {
        "service": APP_NAME,
        "version": "0.3.0",
        "milestone": "Salary, Payments, Attendance, Accounting & Backup",
        "message_en": "ERP API is running",
        "message_bn": "ইআরপি এপিআই চালু আছে",
        "docs": "/docs",
        "warning": "Synthetic demo environment only; complete production security review before real use.",
    }


__all__ = [
    "app",
    "Base",
    "engine",
    "SessionLocal",
    "get_db",
    "User",
    "RolePermission",
    "CompanyProfile",
    "FiscalPeriod",
    "Account",
    "Employee",
    "AttendanceRecord",
    "SalaryPayment",
    "JournalEntry",
    "JournalLine",
    "BusinessDocument",
    "BusinessDocumentItem",
    "AuditLog",
]
