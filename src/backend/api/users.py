"""
USER MANAGEMENT API ENDPOINTS
Uses the correct users table schema from database.py
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging
from datetime import timezone

from core.auth import get_current_user, require_permission, AuthenticationManager, PAKISTANI_ROLES
from core.database import get_database_manager

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)


@router.get("/", dependencies=[Depends(require_permission("users.manage"))])
async def list_users(
    skip: int = Query(0),
    limit: int = Query(200),
    role: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all users."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Correct columns from actual schema
            query = """
                SELECT id, username, full_name, role, phone, status,
                       last_login, created_at, login_attempts
                FROM users
                WHERE 1=1
            """
            params = []

            if role:
                query += " AND role = ?"
                params.append(role)

            query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])

            cur.execute(query, params)
            rows = cur.fetchall()

            # Count with same filters
            count_query = "SELECT COUNT(*) FROM users WHERE 1=1"
            count_params = []
            if role:
                count_query += " AND role = ?"
                count_params.append(role)
            cur.execute(count_query, count_params)
            total = cur.fetchone()[0]

            users = []
            for row in rows:
                u = dict(row) if hasattr(row, 'keys') else {
                    'id': row[0], 'username': row[1], 'full_name': row[2],
                    'role': row[3], 'phone': row[4], 'status': row[5],
                    'last_login': row[6], 'created_at': row[7], 'login_attempts': row[8]
                }
                # Add role display name from PAKISTANI_ROLES
                role_config = PAKISTANI_ROLES.get(u.get('role'), {})
                u['role_name'] = role_config.get('name', u.get('role', ''))
                users.append(u)

        return {
            "success": True,
            "users": users,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def get_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get user details."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT id, username, full_name, role, phone, cnic,
                       salary, commission_rate, status, last_login,
                       created_at, login_attempts
                FROM users WHERE id = ?
            """, (user_id,))
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="User not found")

            u = dict(row) if hasattr(row, 'keys') else {
                'id': row[0], 'username': row[1], 'full_name': row[2],
                'role': row[3], 'phone': row[4], 'cnic': row[5],
                'salary': row[6], 'commission_rate': row[7], 'status': row[8],
                'last_login': row[9], 'created_at': row[10], 'login_attempts': row[11]
            }
            # Add permissions from PAKISTANI_ROLES
            role_config = PAKISTANI_ROLES.get(u.get('role'), {})
            u['role_name'] = role_config.get('name', u.get('role', ''))
            u['permissions'] = role_config.get('permissions', [])

        return {"success": True, "user": u}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", dependencies=[Depends(require_permission("users.manage"))])
async def create_user(
    user_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create new user using correct table schema."""
    try:
        username = (user_data.get("username") or "").strip().lower()
        password = user_data.get("password", "")
        full_name = (user_data.get("full_name") or "").strip()
        role = user_data.get("role", "shop_boy")
        phone = user_data.get("phone")
        cnic = user_data.get("cnic")
        salary = float(user_data.get("salary") or 0)
        commission_rate = float(user_data.get("commission_rate") or 0)
        status = user_data.get("status", "active")

        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        if not password or len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        if not full_name:
            raise HTTPException(status_code=400, detail="Full name is required")
        if role not in ('malik', 'munshi', 'shop_boy', 'stock_boy'):
            raise HTTPException(status_code=400, detail=f"Invalid role: {role}")

        # Hash with SHA-256 (same as auth.py)
        password_hash, _ = AuthenticationManager.hash_password(password)

        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username already exists")

            cur.execute("""
                INSERT INTO users (
                    username, password_hash, full_name, role,
                    phone, cnic, salary, commission_rate, status,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                username, password_hash, full_name, role,
                phone, cnic, salary, commission_rate, status,
                datetime.datetime.now(timezone.utc).isoformat(),
                datetime.datetime.now(timezone.utc).isoformat()
            ))
            new_id = cur.lastrowid

        return {
            "success": True,
            "message": "User created successfully",
            "user_id": new_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def update_user(
    user_id: int,
    user_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update user. Only fields present in the request body are updated."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            # Only allow updating columns that actually exist in the schema
            allowed_fields = {
                "full_name": "full_name",
                "role": "role",
                "phone": "phone",
                "cnic": "cnic",
                "salary": "salary",
                "commission_rate": "commission_rate",
                "status": "status",
            }

            updates = []
            params = []
            for req_key, col_name in allowed_fields.items():
                if req_key in user_data and user_data[req_key] is not None:
                    updates.append(f"{col_name} = ?")
                    params.append(user_data[req_key])

            # Handle password change if provided
            if user_data.get("password"):
                if len(user_data["password"]) < 6:
                    raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
                new_hash, _ = AuthenticationManager.hash_password(user_data["password"])
                updates.append("password_hash = ?")
                params.append(new_hash)
                updates.append("password_changed_at = ?")
                params.append(datetime.datetime.now(timezone.utc).isoformat())

            if not updates:
                return {"success": True, "message": "No fields to update"}

            updates.append("updated_at = ?")
            params.append(datetime.datetime.now(timezone.utc).isoformat())
            params.append(user_id)

            cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)

        return {"success": True, "message": "User updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def delete_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete user. Cannot delete yourself."""
    try:
        if user_id == current_user["id"]:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            # Check if user has sales records
            cur.execute("SELECT COUNT(*) FROM sales WHERE cashier_id = ?", (user_id,))
            sales_count = cur.fetchone()[0]
            if sales_count > 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot delete user — they have {sales_count} sales records. "
                           f"Deactivate the user instead."
                )
            cur.execute("DELETE FROM users WHERE id = ?", (user_id,))

        return {"success": True, "message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{user_id}/reset-password", dependencies=[Depends(require_permission("users.manage"))])
async def reset_user_password(
    user_id: int,
    pwd_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Reset user password using SHA-256 (consistent with auth.py)."""
    try:
        new_password = pwd_data.get("password", "")
        if not new_password or len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        password_hash, _ = AuthenticationManager.hash_password(new_password)

        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            cur.execute("""
                UPDATE users
                SET password_hash = ?,
                    password_changed_at = ?,
                    login_attempts = 0,
                    locked_until = NULL,
                    updated_at = ?
                WHERE id = ?
            """, (
                password_hash,
                datetime.datetime.now(timezone.utc).isoformat(),
                datetime.datetime.now(timezone.utc).isoformat(),
                user_id
            ))

        return {"success": True, "message": "Password reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reset password: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/activity", dependencies=[Depends(require_permission("users.manage"))])
async def user_activity(
    user_id: int,
    limit: int = Query(50),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get user activity log."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT * FROM user_activity_log
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (user_id, limit))
            rows = cur.fetchall()
            activities = [dict(r) if hasattr(r, 'keys') else r for r in rows]

        return {"success": True, "activities": activities}
    except Exception as e:
        logger.error(f"Failed to get activity: {e}")
        raise HTTPException(status_code=500, detail=str(e))