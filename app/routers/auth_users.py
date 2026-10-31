from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    VALID_ROLES,
    AuditLog,
    CompanyProfile,
    FiscalPeriod,
    RolePermission,
    User,
)
from app.permissions_catalog import (
    ALL_PERMISSION_KEYS,
    DEFAULT_ROLE_PERMISSIONS,
    IMMUTABLE_ADMIN_PERMISSIONS,
    PERMISSIONS_CATALOG,
    ROLES_META,
)
from app.schemas import (
    AuditLogOut,
    CompanyProfileOut,
    CompanyProfileUpdate,
    CurrentUserOut,
    FiscalPeriodCreate,
    FiscalPeriodOut,
    PermissionMatrixUpdate,
    TokenResponse,
    UserCreate,
    UserOut,
    UserPasswordReset,
    UserRoleUpdate,
    UserStatusUpdate,
)
from app.security import (
    create_access_token,
    get_current_user,
    get_effective_permissions,
    password_hash,
    record_audit,
    require_permission,
)

router = APIRouter()


@router.post("/auth/token", response_model=TokenResponse, tags=["Authentication"])
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not user.is_active or not password_hash.verify(form.password, user.password_digest):
        raise HTTPException(status_code=401, detail="Incorrect username, password, or deactivated account")
    return TokenResponse(access_token=create_access_token(user))


@router.get("/auth/me", response_model=CurrentUserOut, tags=["Authentication"])
def who_am_i(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return CurrentUserOut(
        id=user.id,
        username=user.username,
        full_name_en=user.full_name_en,
        full_name_bn=user.full_name_bn,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        permissions=get_effective_permissions(db, user.role),
    )


@router.get("/users", response_model=list[UserOut], tags=["Users & Roles"])
def list_users(
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("users:manage")),
):
    return list(db.scalars(select(User).order_by(User.id)).all())


@router.post("/users", response_model=UserOut, status_code=201, tags=["Users & Roles"])
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("users:manage")),
):
    if db.scalar(select(User).where(User.username == data.username)):
        raise HTTPException(status_code=409, detail="Username already exists")

    try:
        new_user = User(
            username=data.username,
            full_name_en=data.full_name_en,
            full_name_bn=data.full_name_bn,
            email=data.email,
            password_digest=password_hash.hash(data.password),
            role=data.role,
            is_active=True,
        )
        db.add(new_user)
        db.flush()
        record_audit(
            db,
            actor_user_id=actor.id,
            action="user.created",
            entity_type="user",
            entity_id=str(new_user.id),
            details=f"Created user '{new_user.username}' with role '{new_user.role}'",
        )
        db.commit()
        db.refresh(new_user)
        return new_user
    except Exception:
        db.rollback()
        raise


@router.patch("/users/{user_id}/status", response_model=UserOut, tags=["Users & Roles"])
def set_user_active_status(
    user_id: int,
    data: UserStatusUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("users:manage")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if not data.is_active and target.id == actor.id:
        raise HTTPException(status_code=422, detail="Administrators cannot deactivate their own active session account")

    if not data.is_active and target.role == "admin":
        active_admins = db.scalar(
            select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))
        ) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=422, detail="Cannot deactivate the last active administrator")

    try:
        target.is_active = data.is_active
        if not data.is_active:
            target.deactivated_at = datetime.now(timezone.utc)
            target.deactivated_by = actor.id
        else:
            target.deactivated_at = None
            target.deactivated_by = None

        record_audit(
            db,
            actor_user_id=actor.id,
            action="user.activated" if data.is_active else "user.deactivated",
            entity_type="user",
            entity_id=str(target.id),
            details=f"Set is_active={data.is_active} for '{target.username}'",
        )
        db.commit()
        db.refresh(target)
        return target
    except Exception:
        db.rollback()
        raise


@router.patch("/users/{user_id}/role", response_model=UserOut, tags=["Users & Roles"])
def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("users:manage")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "admin" and data.role != "admin":
        active_admins = db.scalar(
            select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))
        ) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=422, detail="Cannot change role of the last active administrator")

    old_role = target.role
    target.role = data.role
    record_audit(
        db,
        actor_user_id=actor.id,
        action="user.role_updated",
        entity_type="user",
        entity_id=str(target.id),
        details=f"Changed role of '{target.username}' from '{old_role}' to '{data.role}'",
    )
    db.commit()
    db.refresh(target)
    return target


@router.post("/users/{user_id}/reset-password", response_model=UserOut, tags=["Users & Roles"])
def reset_user_password(
    user_id: int,
    data: UserPasswordReset,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("users:manage")),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_digest = password_hash.hash(data.new_password)
    record_audit(
        db,
        actor_user_id=actor.id,
        action="user.password_reset",
        entity_type="user",
        entity_id=str(target.id),
        details=f"Administrator reset password for '{target.username}'",
    )
    db.commit()
    db.refresh(target)
    return target


@router.get("/permissions/matrix", tags=["Permissions"])
def get_permission_matrix(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    rows = db.scalars(select(RolePermission)).all()
    lookup: dict[tuple[str, str], bool] = {
        (r.role, r.permission_key): r.allowed for r in rows
    }

    matrix: dict[str, dict[str, bool]] = {}
    for role in VALID_ROLES:
        matrix[role] = {}
        defaults = DEFAULT_ROLE_PERMISSIONS.get(role, set())
        for perm in PERMISSIONS_CATALOG:
            pkey = perm["key"]
            matrix[role][pkey] = lookup.get((role, pkey), pkey in defaults)

    return {
        "roles": ROLES_META,
        "permissions": PERMISSIONS_CATALOG,
        "immutable_admin_permissions": sorted(IMMUTABLE_ADMIN_PERMISSIONS),
        "matrix": matrix,
    }


@router.put("/permissions/matrix", tags=["Permissions"])
def update_permission_matrix(
    payload: PermissionMatrixUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("permissions:manage")),
):
    for role, perms in payload.matrix.items():
        if role not in VALID_ROLES:
            raise HTTPException(status_code=422, detail=f"Unknown role: '{role}'")
        for pkey, allowed in perms.items():
            if pkey not in ALL_PERMISSION_KEYS:
                raise HTTPException(status_code=422, detail=f"Unknown permission key: '{pkey}'")
            if role == "admin" and pkey in IMMUTABLE_ADMIN_PERMISSIONS and not allowed:
                raise HTTPException(
                    status_code=422,
                    detail=f"Administrator role must retain core governance permission '{pkey}'",
                )

    try:
        existing_rows = db.scalars(select(RolePermission)).all()
        existing_map = {(r.role, r.permission_key): r for r in existing_rows}

        for role, perms in payload.matrix.items():
            for pkey, allowed in perms.items():
                row = existing_map.get((role, pkey))
                if row:
                    row.allowed = bool(allowed)
                    row.updated_by = actor.id
                else:
                    db.add(
                        RolePermission(
                            role=role,
                            permission_key=pkey,
                            allowed=bool(allowed),
                            updated_by=actor.id,
                        )
                    )

        record_audit(
            db,
            actor_user_id=actor.id,
            action="permissions.matrix_updated",
            entity_type="role_permissions",
            entity_id="matrix",
            details="Updated configurable role permission matrix",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_permission_matrix(db=db, _user=actor)


@router.get("/company", response_model=CompanyProfileOut, tags=["Company Foundation"])
def get_company_profile(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    profile = db.scalar(select(CompanyProfile).order_by(CompanyProfile.id))
    if not profile:
        profile = CompanyProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.put("/company", response_model=CompanyProfileOut, tags=["Company Foundation"])
def update_company_profile(
    data: CompanyProfileUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("company:manage")),
):
    profile = db.scalar(select(CompanyProfile).order_by(CompanyProfile.id))
    if not profile:
        profile = CompanyProfile()
        db.add(profile)

    for k, v in data.model_dump().items():
        setattr(profile, k, v)

    record_audit(
        db,
        actor_user_id=actor.id,
        action="company.updated",
        entity_type="company_profile",
        entity_id=str(profile.id or 1),
        details=f"Updated company profile '{data.name_en}'",
    )
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/fiscal-periods", response_model=list[FiscalPeriodOut], tags=["Company Foundation"])
def list_fiscal_periods(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return list(db.scalars(select(FiscalPeriod).order_by(FiscalPeriod.start_date.desc())).all())


@router.post("/fiscal-periods", response_model=FiscalPeriodOut, status_code=201, tags=["Company Foundation"])
def create_fiscal_period(
    data: FiscalPeriodCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("company:manage")),
):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=422, detail="end_date must be on or after start_date")
    if db.scalar(select(FiscalPeriod).where(FiscalPeriod.name == data.name)):
        raise HTTPException(status_code=409, detail="Fiscal period name already exists")
    fp = FiscalPeriod(name=data.name, start_date=data.start_date, end_date=data.end_date, is_closed=False)
    db.add(fp)
    record_audit(db, actor.id, "fiscal_period.created", "fiscal_period", data.name, f"{data.start_date} to {data.end_date}")
    db.commit()
    db.refresh(fp)
    return fp


@router.post("/fiscal-periods/{period_id}/toggle-close", response_model=FiscalPeriodOut, tags=["Company Foundation"])
def toggle_close_fiscal_period(
    period_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permission("company:manage")),
):
    fp = db.get(FiscalPeriod, period_id)
    if not fp:
        raise HTTPException(status_code=404, detail="Fiscal period not found")
    fp.is_closed = not fp.is_closed
    fp.closed_at = datetime.now(timezone.utc) if fp.is_closed else None
    fp.closed_by = actor.id if fp.is_closed else None
    record_audit(
        db,
        actor.id,
        "fiscal_period.closed" if fp.is_closed else "fiscal_period.reopened",
        "fiscal_period",
        str(fp.id),
        f"Fiscal period '{fp.name}' is_closed={fp.is_closed}",
    )
    db.commit()
    db.refresh(fp)
    return fp


@router.get("/audit-logs", response_model=list[AuditLogOut], tags=["Company Foundation"])
def list_audit_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("users:manage")),
):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 200))).all()
    user_ids = {l.actor_user_id for l in logs if l.actor_user_id}
    users_by_id = {}
    if user_ids:
        for u in db.scalars(select(User).where(User.id.in_(user_ids))).all():
            users_by_id[u.id] = u.username
    return [
        AuditLogOut(
            id=l.id,
            actor_user_id=l.actor_user_id,
            actor_username=users_by_id.get(l.actor_user_id or 0, "system"),
            action=l.action,
            entity_type=l.entity_type,
            entity_id=l.entity_id,
            details=l.details,
            created_at=l.created_at,
        )
        for l in logs
    ]
