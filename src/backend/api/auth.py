# src/backend/api/auth.py
"""
AUTHENTICATION API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Request, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging

from core.auth import (
    auth_manager,
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserUpdate,
    ChangePasswordRequest,
    get_current_user,
    require_permission,
    create_user,
    get_users,
    update_user,
    delete_user,
    get_active_sessions,
    terminate_session
)
from core.logger import audit_log

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

# ==================== AUTHENTICATION ENDPOINTS ====================

@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    request: Request
):
    """
    User login endpoint.
    
    Returns:
        Access and refresh tokens
    """
    try:
        result = await auth_manager.authenticate_user(
            login_data.username,
            login_data.password,
            request
        )

        # Return the raw result and let FastAPI handle serialization/validation
        return result
        
    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback as _tb
        tb = _tb.format_exc()
        logger.error(f"Login error: {e}\n{tb}")
        # Return error detail for debugging (temporary)
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error during login: {str(e)}"
        )

@router.post("/refresh")
async def refresh_token(
    refresh_token: str = Body(..., embed=True)
):
    """
    Refresh access token using refresh token.
    
    Returns:
        New access token
    """
    try:
        if not refresh_token or not refresh_token.strip():
            raise HTTPException(
                status_code=400,
                detail="Refresh token is required"
            )
            
        result = await auth_manager.refresh_token(refresh_token)
        return result
        
    except ValueError as e:
        logger.warning(f"Invalid refresh token: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired refresh token"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error during token refresh"
        )

@router.post("/logout")
async def logout(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Logout user by invalidating session.
    """
    try:
        session_token = request.headers.get("X-Session-Token")
        await auth_manager.logout_user(current_user["id"], session_token)
        
        return {"success": True, "message": "Logged out successfully"}
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to logout"
        )

@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Change user password.
    """
    try:
        success = await auth_manager.change_password(
            current_user["id"],
            password_data.current_password,
            password_data.new_password,
            request
        )
        
        if success:
            return {"success": True, "message": "Password changed successfully"}
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to change password"
            )
            
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Password change error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to change password"
        )

@router.get("/me")
async def get_current_user_info(
    current_user: dict = Depends(get_current_user)
):
    """
    Get current authenticated user information.
    """
    return current_user

# ==================== USER MANAGEMENT ENDPOINTS ====================

@router.post("/users", dependencies=[Depends(require_permission("users.manage"))])
async def create_new_user(
    user_data: UserCreate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new user (admin only).
    """
    try:
        user = await create_user(user_data, current_user, request)
        return {"success": True, "user": user}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Create user error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create user"
        )

@router.get("/users", dependencies=[Depends(require_permission("users.manage"))])
async def get_all_users(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all users (admin only).
    """
    try:
        users = await get_users(current_user)
        return {"success": True, "users": users}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Get users error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get users"
        )

@router.get("/users/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def get_user_by_id(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Get user by ID (admin only).
    """
    try:
        from core.database import get_database_manager
        
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            cursor.execute('''
                SELECT id, username, full_name, role, status,
                       phone, cnic, salary, commission_rate,
                       last_login, created_at, login_attempts
                FROM users 
                WHERE id = ?
            ''', (user_id,))
            
            user = cursor.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            user_dict = dict(user)
            
            # Add role info
            from core.auth import PAKISTANI_ROLES
            role_config = PAKISTANI_ROLES.get(user_dict["role"], {})
            user_dict.update({
                "role_name": role_config.get("name", user_dict["role"]),
                "permissions": role_config.get("permissions", [])
            })
            
            return {"success": True, "user": user_dict}
            
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Get user error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get user"
        )

@router.put("/users/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def update_user_by_id(
    user_id: int,
    user_data: UserUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Update user by ID (admin only).
    """
    try:
        user = await update_user(user_id, user_data, current_user, request)
        return {"success": True, "user": user}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Update user error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to update user"
        )

@router.delete("/users/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def delete_user_by_id(
    user_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete user by ID (admin only).
    """
    try:
        success = await delete_user(user_id, current_user, request)
        if success:
            return {"success": True, "message": "User deleted successfully"}
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete user"
            )
            
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Delete user error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete user"
        )

# ==================== SESSION MANAGEMENT ENDPOINTS ====================

@router.get("/sessions/{user_id}")
async def get_user_sessions(
    user_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Get active sessions for a user.
    Users can view their own sessions, admins can view all.
    """
    try:
        sessions = await get_active_sessions(user_id, current_user)
        return {"success": True, "sessions": sessions}
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Get sessions error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get sessions"
        )

@router.delete("/sessions/{session_token}")
async def terminate_user_session(
    session_token: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Terminate a specific session.
    Users can terminate their own sessions, admins can terminate any.
    """
    try:
        success = await terminate_session(session_token, current_user, request)
        if success:
            return {"success": True, "message": "Session terminated successfully"}
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to terminate session"
            )
            
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Terminate session error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to terminate session"
        )

# ==================== ROLE MANAGEMENT ENDPOINTS ====================

@router.get("/roles")
async def get_available_roles(
    current_user: dict = Depends(get_current_user)
):
    """
    Get available roles and their permissions.
    """
    try:
        from core.auth import PAKISTANI_ROLES
        
        # Return roles with permissions
        roles = {}
        for role_id, role_config in PAKISTANI_ROLES.items():
            roles[role_id] = {
                "name": role_config["name"],
                "description": role_config["description"],
                "permissions": role_config["permissions"]
            }
        
        return {"success": True, "roles": roles}
        
    except Exception as e:
        logger.error(f"Get roles error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get roles"
        )

@router.get("/permissions")
async def get_user_permissions(
    current_user: dict = Depends(get_current_user)
):
    """
    Get current user's permissions.
    """
    return {
        "success": True,
        "permissions": current_user.get("permissions", []),
        "capabilities": {
            "can_manage_users": current_user.get("can_manage_users", False),
            "can_view_reports": current_user.get("can_view_reports", False),
            "can_manage_stock": current_user.get("can_manage_stock", False),
            "can_manage_products": current_user.get("can_manage_products", False),
            "can_manage_customers": current_user.get("can_manage_customers", False),
            "can_manage_sales": current_user.get("can_manage_sales", False),
            "can_manage_expenses": current_user.get("can_manage_expenses", False),
            "can_manage_settings": current_user.get("can_manage_settings", False),
            "can_backup_restore": current_user.get("can_backup_restore", False),
        }
    }

# ==================== HEALTH CHECK ====================

@router.get("/health")
async def health_check():
    """
    Health check endpoint for authentication service.
    """
    return {
        "status": "healthy",
        "service": "authentication",
        "timestamp": datetime.now().isoformat()
    }