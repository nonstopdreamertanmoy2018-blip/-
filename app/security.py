from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import JWT_EXPIRE_MINUTES, JWT_SECRET
from app.database import get_db
from app.models import AuditLog, RolePermission, User
from app.permissions_catalog import DEFAULT_ROLE_PERMISSIONS

password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid, expired, or deactivated user token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except Exception:
        raise unauthorized

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise unauthorized
    return user


def get_effective_permissions(db: Session, role: str) -> list[str]:
    rows = db.scalars(
        select(RolePermission).where(RolePermission.role == role)
    ).all()
    if not rows:
        return sorted(DEFAULT_ROLE_PERMISSIONS.get(role, set()))
    return sorted(row.permission_key for row in rows if row.allowed)


def has_permission(db: Session, user: User, permission_key: str) -> bool:
    row = db.scalar(
        select(RolePermission).where(
            RolePermission.role == user.role,
            RolePermission.permission_key == permission_key,
        )
    )
    if row is not None:
        return bool(row.allowed)
    return permission_key in DEFAULT_ROLE_PERMISSIONS.get(user.role, set())


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions",
            )
        return user

    return dependency


def require_permission(permission_key: str):
    def dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not has_permission(db, user, permission_key):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: '{permission_key}' is not enabled for role '{user.role}'",
            )
        return user

    return dependency


def record_audit(
    db: Session,
    actor_user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: str = "",
    details: str = "",
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=details,
        )
    )
