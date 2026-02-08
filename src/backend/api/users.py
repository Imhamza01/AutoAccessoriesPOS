"""
USER MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging
import bcrypt
from datetime import timezone

from core.auth import get_current_user, require_permission
from core.database import get_database_manager
import secrets

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)


@router.get("/", dependencies=[Depends(require_permission("users.view"))])
async def list_users(
    skip: int = Query(0),
    limit: int = Query(50),
    role: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all users."""
    try:
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
            query = "SELECT id, username, email, full_name, role, is_active, created_at FROM users WHERE 1=1"
            params = []
            
            if role:
                query += " AND role = ?"
                params.append(role)
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            users = cur.fetchall()
            
            # Get count
            count_query = "SELECT COUNT(*) FROM users"
            count_params = []
            if role:
                count_query += " AND role = ?"
                count_params.append(role)
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()[0]
        
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


@router.get("/{user_id}", dependencies=[Depends(require_permission("users.view"))])
async def get_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get user details with permissions."""
    try:
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
            cur.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,)
            )
            user = cur.fetchone()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Get permissions for role - handle potential index errors
            try:
                role = user[4] if len(user) > 4 else None  # role column
            except (IndexError, TypeError):
                role = None
                
            if role:
                try:
                    cur.execute(
                        "SELECT permission_name FROM role_permissions WHERE role = ?",
                        (role,)
                    )
                    permissions = [p[0] for p in cur.fetchall()]
                except Exception as e:
                    logger.warning(f"Failed to get permissions for role {role}: {e}")
                    permissions = []
            else:
                permissions = []
        
        return {
            "success": True,
            "user": user,
            "permissions": permissions
        }
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
    """Create new user."""
    try:
        username = user_data.get("username")
        email = user_data.get("email")
        password = user_data.get("password")
        full_name = user_data.get("full_name")
        role = user_data.get("role", "shop_boy")
        
        # Validate
        if not username or not password:
            raise ValueError("Username and password required")
        
        # Hash password securely with bcrypt
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Check if user exists
            cur.execute("SELECT id FROM users WHERE username = ?", (username,))
            if cur.fetchone():
                raise ValueError("User already exists")
            
            cur.execute("""
                INSERT INTO users (
                    username, email, password_hash, full_name, role,
                    is_active, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                username,
                email,
                password_hash,
                full_name,
                role,
                True,
                current_user["id"],
                datetime.datetime.now(timezone.utc).isoformat(),
                datetime.datetime.now(timezone.utc).isoformat()
            ))
        
        return {
            "success": True,
            "message": "User created successfully",
            "user_id": db.get_last_insert_id()
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def update_user(
    user_id: int,
    user_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update user information."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Verify exists
            cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
            
            # Update
            updates = []
            params = []
            for field in ["email", "full_name", "role", "is_active"]:
                if field in user_data:
                    updates.append(f"{field} = ?")
                    params.append(user_data[field])
            
            if updates:
                updates.append("updated_at = ?")
                params.append(datetime.datetime.now(timezone.utc).isoformat())
                params.append(user_id)
                
                query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
                cur.execute(query, params)
        
        return {
            "success": True,
            "message": "User updated successfully"
        }
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
    """Soft delete user."""
    try:
        # Log the deletion action with current user info
        logger.info(f"User {current_user.get('username', 'unknown')} deleting user {user_id}")
        
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
                
            # Verify user exists before deletion
            cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
                
            # Actually delete the record since soft delete column doesn't exist
            cur.execute(
                "DELETE FROM users WHERE id = ?",
                (user_id,)
            )
        
        return {
            "success": True,
            "message": "User deleted successfully"
        }
    except Exception as e:
        logger.error(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{user_id}/reset-password", dependencies=[Depends(require_permission("users.manage"))])
async def reset_user_password(
    user_id: int,
    pwd_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Reset user password."""
    try:
        new_password = pwd_data.get("password")
        
        if not new_password:
            raise ValueError("Password required")
        
        # Hash password securely with bcrypt
        password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
                
            # Verify user exists before updating password
            cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
                
            cur.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (password_hash, datetime.datetime.now(timezone.utc).isoformat(), user_id)
            )
            
            # Check if the update was successful
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="User not found or password not updated")
        
        return {
            "success": True,
            "message": "Password reset successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to reset password: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{user_id}/activity", dependencies=[Depends(require_permission("users.view"))])
async def user_activity(
    user_id: int,
    limit: int = Query(50),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get user activity log."""
    try:
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
                
            cur.execute("""
                SELECT * FROM user_activity_log
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            """, (user_id, limit))
            activities = cur.fetchall()
        
        return {
            "success": True,
            "activities": activities
        }
    except Exception as e:
        logger.error(f"Failed to get activity: {e}")
        raise HTTPException(status_code=500, detail=str(e))
