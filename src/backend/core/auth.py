# src/backend/core/auth.py
"""
COMPLETE AUTHENTICATION SYSTEM FOR PAKISTANI AUTO SHOPS
- Pakistani roles: Malik (Owner), Munshi (Manager), Shop Boy, Stock Boy
- JWT Token based authentication
- Permission system
- Session management
"""

from jose import jwt
from jose.exceptions import ExpiredSignatureError
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List, Tuple
from fastapi import HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator, Field
import json

from core.database import get_database_manager
from core.logger import audit_log

logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================

# JWT Configuration
JWT_SECRET = "auto_accessories_pos_secret_key_change_in_production_2024"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours work day
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Security configurations
MAX_LOGIN_ATTEMPTS = 5
ACCOUNT_LOCK_MINUTES = 30
PASSWORD_MIN_LENGTH = 6
PASSWORD_EXPIRE_DAYS = 90

# Pakistani Role Definitions
PAKISTANI_ROLES = {
    "malik": {
        "name": "Malik (Owner)",
        "description": "Full access to all features",
        "permissions": ["*"],  # All permissions
        "can_manage_users": True,
        "can_view_reports": True,
        "can_manage_stock": True,
        "can_manage_products": True,
        "can_manage_customers": True,
        "can_manage_sales": True,
        "can_manage_expenses": True,
        "can_manage_settings": True,
        "can_backup_restore": True,
    },
    "munshi": {
        "name": "Munshi (Manager)",
        "description": "Manager with most access except user management",
        "permissions": [
            "dashboard.view",
            "pos.access",
            "products.manage",
            "customers.manage",
            "sales.manage",
            "inventory.manage",
            "reports.view",
            "expenses.view",
            "expenses.manage",
        ],
        "can_manage_users": False,
        "can_view_reports": True,
        "can_manage_stock": True,
        "can_manage_products": True,
        "can_manage_customers": True,
        "can_manage_sales": True,
        "can_manage_expenses": True,
        "can_manage_settings": False,
        "can_backup_restore": False,
    },
    "shop_boy": {
        "name": "Shop Boy (Cashier)",
        "description": "Can process sales and manage customers",
        "permissions": [
            "dashboard.view",
            "pos.access",
            "products.view",
            "customers.manage",
            "sales.create",
            "sales.view",
            "reports.view",
            "inventory.view",
        ],
        "can_manage_users": False,
        "can_view_reports": False,
        "can_manage_stock": False,
        "can_manage_products": False,
        "can_manage_customers": True,
        "can_manage_sales": True,  # Can create sales but not view all
        "can_manage_expenses": False,
        "can_manage_settings": False,
        "can_backup_restore": False,
    },
    "stock_boy": {
        "name": "Stock Boy",
        "description": "Can manage inventory and stock",
        "permissions": [
            "dashboard.view",
            "products.view",
            "inventory.manage",
            "stock.view",
        ],
        "can_manage_users": False,
        "can_view_reports": False,
        "can_manage_stock": True,
        "can_manage_products": False,  # Can only view
        "can_manage_customers": False,
        "can_manage_sales": False,
        "can_manage_expenses": False,
        "can_manage_settings": False,
        "can_backup_restore": False,
    }
}

# Security instance
security = HTTPBearer(auto_error=False)  # Allow requests without token for dev mode

# ==================== PYDANTIC MODELS ====================

class LoginRequest(BaseModel):
    """Login request model"""
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)
    device_info: Optional[str] = None
    
    @validator('username')
    def username_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Username cannot be empty')
        return v.strip().lower()
    
    @validator('password')
    def password_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Password cannot be empty')
        return v

class TokenResponse(BaseModel):
    """Token response model"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]

class UserCreate(BaseModel):
    """User creation model"""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field(..., pattern="^(malik|munshi|shop_boy|stock_boy)$")
    phone: Optional[str] = Field(None, max_length=20)
    cnic: Optional[str] = Field(None, min_length=13, max_length=13)
    salary: Optional[float] = Field(0, ge=0)
    commission_rate: Optional[float] = Field(0, ge=0, le=100)
    
    @validator('username')
    def validate_username(cls, v):
        if not v.replace('_', '').replace('.', '').isalnum():
            raise ValueError('Username can only contain letters, numbers, underscores and dots')
        return v.lower()

class UserUpdate(BaseModel):
    """User update model"""
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    cnic: Optional[str] = Field(None, min_length=13, max_length=13)
    salary: Optional[float] = Field(None, ge=0)
    commission_rate: Optional[float] = Field(None, ge=0, le=100)
    status: Optional[str] = Field(None, pattern="^(active|inactive|suspended)$")

class ChangePasswordRequest(BaseModel):
    """Change password model"""
    current_password: str
    new_password: str = Field(..., min_length=6)
    confirm_password: str
    
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v

# ==================== AUTHENTICATION MANAGER ====================

class AuthenticationManager:
    """Main authentication manager class"""
    
    def __init__(self):
        self.db_manager = get_database_manager()
    
    @staticmethod
    def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
        """
        Hash password with salt using SHA-256.
        
        Args:
            password: Plain text password
            salt: Optional salt (generated if None)
            
        Returns:
            Tuple of (hashed_password, salt)
        """
        if salt is None:
            salt = secrets.token_hex(16)
        
        hash_obj = hashlib.sha256(f"{password}{salt}".encode())
        hashed = f"sha256${salt}${hash_obj.hexdigest()}"
        
        return hashed, salt
    
    @staticmethod
    def verify_password(password: str, hashed_password: str) -> bool:
        """
        Verify password against hash.
        
        Args:
            password: Plain text password
            hashed_password: Hashed password string
            
        Returns:
            True if password matches
        """
        try:
            algorithm, salt, hash_value = hashed_password.split('$')
            if algorithm != 'sha256':
                return False
            
            test_hash = hashlib.sha256(f"{password}{salt}".encode()).hexdigest()
            return test_hash == hash_value
            
        except ValueError:
            return False
    
    @staticmethod
    def create_access_token(user_id: int, username: str, role: str) -> str:
        """
        Create JWT access token.
        
        Args:
            user_id: User ID
            username: Username
            role: User role
            
        Returns:
            JWT token string
        """
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        payload = {
            "sub": str(user_id),
            "username": username,
            "role": role,
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "type": "access"
        }
        
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    @staticmethod
    def create_refresh_token(user_id: int) -> str:
        """
        Create JWT refresh token.
        
        Args:
            user_id: User ID
            
        Returns:
            Refresh token string
        """
        expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "iat": datetime.now(timezone.utc),
            "type": "refresh"
        }
        
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        """
        Decode and verify JWT token.
        
        Args:
            token: JWT token string
            
        Returns:
            Decoded token payload
            
        Raises:
            HTTPException: If token is invalid or expired
        """
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return payload
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=401,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"}
            )
        except jwt.JWTError:
            raise HTTPException(
                status_code=401,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"}
            )
    
    def check_user_lock(self, user_data: Dict[str, Any]) -> bool:
        """
        Check if user account is locked.
        
        Args:
            user_data: User data from database
            
        Returns:
            True if account is locked
        """
        if user_data.get("status") != "active":
            return True
        
        locked_until = user_data.get("locked_until")
        if locked_until:
            try:
                lock_time = datetime.fromisoformat(locked_until)
                if datetime.now(timezone.utc) < lock_time:
                    return True
            except (ValueError, TypeError):
                pass
        
        return False
    
    def check_password_expiry(self, user_data: Dict[str, Any]) -> bool:
        """
        Check if password needs to be changed.
        
        Args:
            user_data: User data from database
            
        Returns:
            True if password has expired
        """
        password_changed_at = user_data.get("password_changed_at")
        if password_changed_at:
            try:
                changed_date = datetime.fromisoformat(password_changed_at)
                expiry_date = changed_date + timedelta(days=PASSWORD_EXPIRE_DAYS)
                return datetime.now(timezone.utc) > expiry_date
            except (ValueError, TypeError):
                pass
        
        return False
    
    async def authenticate_user(self, username: str, password: str, request: Request) -> Dict[str, Any]:
        """
        Authenticate user with username and password.
        
        Args:
            username: Username
            password: Password
            request: FastAPI request object
            
        Returns:
            User data if authentication successful
            
        Raises:
            HTTPException: If authentication fails
        """
        try:
            with self.db_manager.get_cursor() as cursor:
                # Get user by username
                cursor.execute('''
                    SELECT id, username, password_hash, full_name, role, status,
                           login_attempts, locked_until, password_changed_at,
                           last_login
                    FROM users 
                    WHERE username = ?
                ''', (username.lower(),))
                
                user = cursor.fetchone()
                
                if not user:
                    # Log failed attempt
                    audit_log(
                        user_id=None,
                        action="login_failed",
                        table_name="users",
                        record_id=None,
                        old_values=None,
                        new_values={"username": username},
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent")
                    )
                    raise HTTPException(
                        status_code=401,
                        detail="Invalid username or password"
                    )
                
                user_dict = dict(user)
                
                # Check if account is locked
                if self.check_user_lock(user_dict):
                    raise HTTPException(
                        status_code=403,
                        detail="Account is locked. Please contact administrator."
                    )
                
                # Verify password
                if not self.verify_password(password, user_dict["password_hash"]):
                    # Increment failed login attempts
                    attempts = user_dict.get("login_attempts", 0) + 1
                    
                    if attempts >= MAX_LOGIN_ATTEMPTS:
                        # Lock account for 30 minutes
                        lock_until = datetime.now(timezone.utc) + timedelta(minutes=ACCOUNT_LOCK_MINUTES)
                        cursor.execute('''
                            UPDATE users 
                            SET login_attempts = ?, locked_until = ?
                            WHERE id = ?
                        ''', (attempts, lock_until.isoformat(), user_dict["id"]))
                        
                        # Log account lock
                        audit_log(
                            user_id=user_dict["id"],
                            action="account_locked",
                            table_name="users",
                            record_id=user_dict["id"],
                            old_values={"login_attempts": attempts - 1},
                            new_values={
                                "login_attempts": attempts,
                                "locked_until": lock_until.isoformat()
                            },
                            ip_address=request.client.host if request.client else None,
                            user_agent=request.headers.get("user-agent")
                        )
                        
                        raise HTTPException(
                            status_code=403,
                            detail="Account locked due to too many failed attempts. Try again after 30 minutes."
                        )
                    else:
                        # Update login attempts
                        cursor.execute('''
                            UPDATE users SET login_attempts = ? WHERE id = ?
                        ''', (attempts, user_dict["id"]))
                        
                        # Log failed attempt
                        audit_log(
                            user_id=user_dict["id"],
                            action="login_failed",
                            table_name="users",
                            record_id=user_dict["id"],
                            old_values={"login_attempts": attempts - 1},
                            new_values={"login_attempts": attempts},
                            ip_address=request.client.host if request.client else None,
                            user_agent=request.headers.get("user-agent")
                        )
                        
                        remaining_attempts = MAX_LOGIN_ATTEMPTS - attempts
                        raise HTTPException(
                            status_code=401,
                            detail=f"Invalid password. {remaining_attempts} attempts remaining."
                        )
                
                # Reset login attempts on successful login
                cursor.execute('''
                    UPDATE users 
                    SET login_attempts = 0, 
                        locked_until = NULL,
                        last_login = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (user_dict["id"],))
                
                # Create session token
                session_token = secrets.token_urlsafe(32)
                expiry_time = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
                
                # Insert session record
                cursor.execute('''
                    INSERT INTO user_sessions 
                    (user_id, session_token, device_info, ip_address, expiry_time)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    user_dict["id"],
                    session_token,
                    request.headers.get("user-agent"),
                    request.client.host if request.client else None,
                    expiry_time.isoformat()
                ))
                
                # Create tokens
                access_token = self.create_access_token(
                    user_dict["id"],
                    user_dict["username"],
                    user_dict["role"]
                )
                refresh_token = self.create_refresh_token(user_dict["id"])
                
                # Check if password needs to be changed
                password_expired = self.check_password_expiry(user_dict)
                
                # Prepare user response
                # Ensure values are JSON serializable (datetimes -> ISO strings)
                last_login_val = user_dict.get("last_login")
                if isinstance(last_login_val, (str,)):
                    last_login_serialized = last_login_val
                else:
                    try:
                        last_login_serialized = last_login_val.isoformat() if last_login_val is not None else None
                    except Exception:
                        last_login_serialized = None

                user_response = {
                    "id": user_dict["id"],
                    "username": user_dict["username"],
                    "full_name": user_dict["full_name"],
                    "role": user_dict["role"],
                    "role_name": PAKISTANI_ROLES.get(user_dict["role"], {}).get("name", user_dict["role"]),
                    "status": user_dict["status"],
                    "phone": user_dict.get("phone"),
                    "last_login": last_login_serialized,
                    "password_expired": password_expired,
                    "session_token": session_token,
                    "permissions": PAKISTANI_ROLES.get(user_dict["role"], {}).get("permissions", []),
                    "can_manage_users": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_users", False),
                    "can_view_reports": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_view_reports", False),
                    "can_manage_stock": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_stock", False),
                    "can_manage_products": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_products", False),
                    "can_manage_customers": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_customers", False),
                    "can_manage_sales": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_sales", False),
                    "can_manage_expenses": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_expenses", False),
                    "can_manage_settings": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_manage_settings", False),
                    "can_backup_restore": PAKISTANI_ROLES.get(user_dict["role"], {}).get("can_backup_restore", False),
                }
                
                # Log successful login
                audit_log(
                    user_id=user_dict["id"],
                    action="login_success",
                    table_name="users",
                    record_id=user_dict["id"],
                    old_values={"last_login": user_dict.get("last_login")},
                    new_values={"last_login": datetime.now(timezone.utc).isoformat()},
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent")
                )
                
                return {
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                    "user": user_response
                }
                
        except HTTPException:
            raise
        except Exception as e:
            import traceback as _tb
            tb = _tb.format_exc()
            # Log and print traceback to ensure it appears in console logs
            logger.exception(f"Authentication error: {e}\n{tb}")
            try:
                print('Authentication exception traceback:\n', tb)
            except Exception:
                pass
            raise HTTPException(
                status_code=500,
                detail="Internal server error during authentication"
            )
    
    async def refresh_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh access token using refresh token.
        
        Args:
            refresh_token: Refresh token
            
        Returns:
            New access token data
        """
        try:
            # Decode refresh token
            payload = self.decode_token(refresh_token)
            
            if payload.get("type") != "refresh":
                raise HTTPException(
                    status_code=401,
                    detail="Invalid token type"
                )
            
            user_id = int(payload["sub"])
            
            # Verify user exists and is active
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    SELECT id, username, role, status
                    FROM users 
                    WHERE id = ? AND status = 'active'
                ''', (user_id,))
                
                user = cursor.fetchone()
                if not user:
                    raise HTTPException(
                        status_code=401,
                        detail="User not found or inactive"
                    )
                
                user_dict = dict(user)
                
                # Create new access token
                access_token = self.create_access_token(
                    user_dict["id"],
                    user_dict["username"],
                    user_dict["role"]
                )
                
                return {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
                }
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to refresh token"
            )
    
    async def logout_user(self, user_id: int, session_token: str = None):
        """
        Logout user by invalidating session.
        
        Args:
            user_id: User ID
            session_token: Optional specific session token
        """
        try:
            with self.db_manager.get_cursor() as cursor:
                if session_token:
                    # Invalidate specific session
                    cursor.execute('''
                        UPDATE user_sessions 
                        SET is_active = 0 
                        WHERE session_token = ? AND user_id = ?
                    ''', (session_token, user_id))
                else:
                    # Invalidate all sessions for user
                    cursor.execute('''
                        UPDATE user_sessions 
                        SET is_active = 0 
                        WHERE user_id = ?
                    ''', (user_id,))
                
                # Log logout
                audit_log(
                    user_id=user_id,
                    action="logout",
                    table_name="users",
                    record_id=user_id,
                    old_values=None,
                    new_values=None,
                    ip_address=None,
                    user_agent=None
                )
                
        except Exception as e:
            logger.error(f"Logout error: {e}")
            # Don't raise error for logout failures
    
    async def change_password(self, user_id: int, current_password: str, new_password: str, request: Request) -> bool:
        """
        Change user password.
        
        Args:
            user_id: User ID
            current_password: Current password
            new_password: New password
            request: FastAPI request
            
        Returns:
            True if successful
            
        Raises:
            HTTPException: If change fails
        """
        try:
            with self.db_manager.get_cursor() as cursor:
                # Get current password hash
                cursor.execute('''
                    SELECT password_hash FROM users WHERE id = ?
                ''', (user_id,))
                
                user = cursor.fetchone()
                if not user:
                    raise HTTPException(status_code=404, detail="User not found")
                
                # Handle Row object properly
                if hasattr(user, 'keys'):
                    user_dict = dict(user)
                    password_hash = user_dict.get("password_hash")
                else:
                    # Assuming password_hash is at index 0 in the tuple
                    password_hash = user[0] if len(user) > 0 else None
                
                # Verify current password
                if not self.verify_password(current_password, password_hash):
                    raise HTTPException(
                        status_code=401,
                        detail="Current password is incorrect"
                    )
                
                # Hash new password
                new_hash, _ = self.hash_password(new_password)
                
                # Update password
                cursor.execute('''
                    UPDATE users 
                    SET password_hash = ?, 
                        password_changed_at = CURRENT_TIMESTAMP,
                        login_attempts = 0,
                        locked_until = NULL
                    WHERE id = ?
                ''', (new_hash, user_id))
                
                # Log password change
                audit_log(
                    user_id=user_id,
                    action="password_change",
                    table_name="users",
                    record_id=user_id,
                    old_values=None,
                    new_values={"password_changed": True},
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent")
                )
                
                return True
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Password change error: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to change password"
            )
    
    def validate_permission(self, user_role: str, required_permission: str) -> bool:
        """
        Check if user role has required permission.
        
        Args:
            user_role: User role
            required_permission: Required permission string
            
        Returns:
            True if user has permission
        """
        role_config = PAKISTANI_ROLES.get(user_role, {})
        permissions = role_config.get("permissions", [])
        
        # Malik (owner) has all permissions
        if user_role == "malik":
            return True
        
        # Check for exact permission or wildcard
        if required_permission in permissions:
            return True
        
        # Check for wildcard permissions (e.g., "products.*" for "products.view")
        for perm in permissions:
            if perm.endswith(".*"):
                prefix = perm[:-2]
                if required_permission.startswith(prefix):
                    return True
        
        return False

    def create_authorization_middleware(self, allowed_roles: List[str]):
        """
        Create FastAPI dependency for role-based authorization.
        
        Args:
            allowed_roles: List of roles allowed to access endpoint
            
        Returns:
            Dependency function
        """
        async def role_authorization_dependency(current_user: Dict[str, Any] = Depends(get_current_user)):
            if current_user["role"] not in allowed_roles:
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied. Required roles: {allowed_roles}"
                )
            return current_user
        
        return role_authorization_dependency

    def create_sales_filter_middleware(self):
        """
        Create middleware for filtering sales by user role.
        Cashiers only see their own sales.
        
        Returns:
            Dependency function that modifies query based on role
        """
        async def sales_filter_dependency(
            current_user: Dict[str, Any] = Depends(get_current_user),
            skip: int = Query(0),
            limit: int = Query(50),
            start_date: Optional[str] = Query(None),
            end_date: Optional[str] = Query(None),
            customer_id: Optional[int] = Query(None),
            status: Optional[str] = Query(None)
        ):
            # Return filter parameters with role-based restrictions
            filters = {
                "skip": skip,
                "limit": limit,
                "start_date": start_date,
                "end_date": end_date,
                "customer_id": customer_id,
                "status": status,
                "user_id": current_user["id"] if current_user["role"] == "shop_boy" else None
            }
            return filters
        
        return sales_filter_dependency

# ==================== DEPENDENCY INJECTION ====================

auth_manager = AuthenticationManager()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None
) -> Dict[str, Any]:
    """
    Dependency to get current authenticated user.
    
    Args:
        credentials: HTTP Bearer credentials (optional in dev mode)
        request: FastAPI request
        
    Returns:
        Current user data
    """
    import os
    
    # DEVELOPMENT / PREVIEW MODE BYPASS (EXPLICIT)
    # For safety we only return a mock admin user when either the
    # `?preview=1` query parameter is present OR the environment is
    # explicitly set to development (`ENV=development`). Previously the
    # code implicitly trusted requests coming from localhost which could
    # lead to inconsistent behavior when the frontend and backend
    # disagree about preview/auth modes. Making this explicit keeps both
    # sides consistent.
    if request:
        try:
            import os
            # Check explicit preview query param
            preview_flag = request.query_params.get('preview') == '1'
            env_dev = os.environ.get('ENV') == 'development'
            if preview_flag or env_dev:
                return {
                    "id": 1,
                    "username": "dev_admin",
                    "full_name": "System Administrator",
                    "role": "malik",
                    "role_name": "Malik (Owner)",
                    "status": "active",
                    "permissions": ["*"],
                    "can_manage_users": True,
                    "can_view_reports": True,
                    "can_manage_stock": True,
                    "can_manage_products": True,
                    "can_manage_customers": True,
                    "can_manage_sales": True,
                    "can_manage_expenses": True,
                    "can_manage_settings": True,
                    "can_backup_restore": True,
                }
        except Exception:
            # If anything goes wrong while checking preview mode, fall
            # through and require normal authentication.
            pass
    
    # For non-localhost, require token
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = credentials.credentials
    
    try:
        # Decode token
        payload = auth_manager.decode_token(token)
        
        # Get user from database
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            cursor.execute('''
                SELECT id, username, full_name, role, status, phone,
                       last_login, password_changed_at
                FROM users 
                WHERE id = ? AND status = 'active'
            ''', (int(payload["sub"]),))
            
            user = cursor.fetchone()
            
            if not user:
                raise HTTPException(
                    status_code=401,
                    detail="User not found or inactive"
                )
            
            user_dict = dict(user)
            
            # Check session (optional)
            session_token = request.headers.get("X-Session-Token") if request else None
            if session_token:
                cursor.execute('''
                    SELECT 1 FROM user_sessions 
                    WHERE session_token = ? 
                      AND user_id = ? 
                      AND is_active = 1 
                      AND expiry_time > CURRENT_TIMESTAMP
                ''', (session_token, user_dict["id"]))
                
                if not cursor.fetchone():
                    raise HTTPException(
                        status_code=401,
                        detail="Session expired"
                    )
            
            # Update last activity for session
            if session_token:
                cursor.execute('''
                    UPDATE user_sessions 
                    SET last_activity = CURRENT_TIMESTAMP 
                    WHERE session_token = ?
                ''', (session_token,))
            
            # Add role permissions to user data
            role_config = PAKISTANI_ROLES.get(user_dict["role"], {})
            user_dict.update({
                "role_name": role_config.get("name", user_dict["role"]),
                "permissions": role_config.get("permissions", []),
                "can_manage_users": role_config.get("can_manage_users", False),
                "can_view_reports": role_config.get("can_view_reports", False),
                "can_manage_stock": role_config.get("can_manage_stock", False),
                "can_manage_products": role_config.get("can_manage_products", False),
                "can_manage_customers": role_config.get("can_manage_customers", False),
                "can_manage_sales": role_config.get("can_manage_sales", False),
                "can_manage_expenses": role_config.get("can_manage_expenses", False),
                "can_manage_settings": role_config.get("can_manage_settings", False),
                "can_backup_restore": role_config.get("can_backup_restore", False),
            })
            
            return user_dict
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting current user: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )

def require_permission(permission: str):
    """
    Dependency to require specific permission.

    Args:
        permission: Required permission string

    Returns:
        Dependency function
    """
    async def permission_dependency(current_user: Dict[str, Any] = Depends(get_current_user)):
        if not auth_manager.validate_permission(current_user["role"], permission):
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient permissions. Required: {permission}"
            )
        return current_user

    return permission_dependency# ==================== USER MANAGEMENT FUNCTIONS ====================

async def create_user(user_data: UserCreate, current_user: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """
    Create a new user.
    
    Args:
        user_data: User creation data
        current_user: Current authenticated user
        request: FastAPI request
        
    Returns:
        Created user data
        
    Raises:
        HTTPException: If creation fails
    """
    # Check if current user can manage users
    if not current_user.get("can_manage_users", False):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions to create users"
        )
    
    try:
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            # Check if username already exists
            cursor.execute("SELECT id FROM users WHERE username = ?", (user_data.username,))
            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Username already exists"
                )
            
            # Hash password
            password_hash, _ = auth_manager.hash_password(user_data.password)
            
            # Insert user
            cursor.execute('''
                INSERT INTO users (
                    username, password_hash, full_name, role,
                    phone, cnic, salary, commission_rate,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ''', (
                user_data.username,
                password_hash,
                user_data.full_name,
                user_data.role,
                user_data.phone,
                user_data.cnic,
                user_data.salary,
                user_data.commission_rate
            ))
            
            user_id = cursor.lastrowid
            
            # Get created user
            cursor.execute('''
                SELECT id, username, full_name, role, status,
                       phone, cnic, salary, commission_rate,
                       created_at, last_login
                FROM users WHERE id = ?
            ''', (user_id,))
            
            created_user = dict(cursor.fetchone())
            
            # Add role info
            role_config = PAKISTANI_ROLES.get(created_user["role"], {})
            created_user.update({
                "role_name": role_config.get("name", created_user["role"]),
                "permissions": role_config.get("permissions", [])
            })
            
            # Log user creation
            audit_log(
                user_id=current_user["id"],
                action="create_user",
                table_name="users",
                record_id=user_id,
                old_values=None,
                new_values={
                    "username": user_data.username,
                    "role": user_data.role,
                    "full_name": user_data.full_name
                },
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent")
            )
            
            return created_user
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create user"
        )

async def get_users(current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get all users (with permission check).
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        List of users
    """
    # Check if current user can manage users
    if not current_user.get("can_manage_users", False):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions to view users"
        )
    
    try:
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            cursor.execute('''
                SELECT id, username, full_name, role, status,
                       phone, cnic, salary, commission_rate,
                       last_login, created_at, login_attempts
                FROM users 
                ORDER BY created_at DESC
            ''')
            
            users = []
            for row in cursor.fetchall():
                user_dict = dict(row)
                
                # Add role info
                role_config = PAKISTANI_ROLES.get(user_dict["role"], {})
                user_dict.update({
                    "role_name": role_config.get("name", user_dict["role"]),
                    "permissions": role_config.get("permissions", [])
                })
                
                users.append(user_dict)
            
            return users
            
    except Exception as e:
        logger.error(f"Error getting users: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get users"
        )

async def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: Dict[str, Any],
    request: Request
) -> Dict[str, Any]:
    """
    Update user information.
    
    Args:
        user_id: User ID to update
        user_data: Update data
        current_user: Current authenticated user
        request: FastAPI request
        
    Returns:
        Updated user data
    """
    # Check if current user can manage users
    if not current_user.get("can_manage_users", False):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions to update users"
        )
    
    try:
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            # Get current user data
            cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
            existing_user = cursor.fetchone()
            
            if not existing_user:
                raise HTTPException(status_code=404, detail="User not found")
            
            existing_dict = dict(existing_user)
            
            # Build update query
            update_fields = []
            update_values = []
            
            if user_data.full_name is not None:
                update_fields.append("full_name = ?")
                update_values.append(user_data.full_name)
            
            if user_data.phone is not None:
                update_fields.append("phone = ?")
                update_values.append(user_data.phone)
            
            if user_data.cnic is not None:
                update_fields.append("cnic = ?")
                update_values.append(user_data.cnic)
            
            if user_data.salary is not None:
                update_fields.append("salary = ?")
                update_values.append(user_data.salary)
            
            if user_data.commission_rate is not None:
                update_fields.append("commission_rate = ?")
                update_values.append(user_data.commission_rate)
            
            if user_data.status is not None:
                update_fields.append("status = ?")
                update_values.append(user_data.status)
            
            if update_fields:
                update_fields.append("updated_at = CURRENT_TIMESTAMP")
                update_values.append(user_id)
                
                update_query = f"UPDATE users SET {', '.join(update_fields)} WHERE id = ?"
                cursor.execute(update_query, update_values)
            
            # Get updated user
            cursor.execute('''
                SELECT id, username, full_name, role, status,
                       phone, cnic, salary, commission_rate,
                       last_login, created_at, updated_at
                FROM users WHERE id = ?
            ''', (user_id,))
            
            updated_user = dict(cursor.fetchone())
            
            # Add role info
            role_config = PAKISTANI_ROLES.get(updated_user["role"], {})
            updated_user.update({
                "role_name": role_config.get("name", updated_user["role"]),
                "permissions": role_config.get("permissions", [])
            })
            
            # Log user update
            audit_log(
                user_id=current_user["id"],
                action="update_user",
                table_name="users",
                record_id=user_id,
                old_values=existing_dict,
                new_values=updated_user,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent")
            )
            
            return updated_user
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to update user"
        )

async def delete_user(user_id: int, current_user: Dict[str, Any], request: Request) -> bool:
    """
    Delete a user (soft delete).
    
    Args:
        user_id: User ID to delete
        current_user: Current authenticated user
        request: FastAPI request
        
    Returns:
        True if successful
    """
    # Check if current user can manage users
    if not current_user.get("can_manage_users", False):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions to delete users"
        )
    
    # Prevent deleting self
    if user_id == current_user["id"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account"
        )
    
    try:
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            # Get user before deletion
            cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
            user = cursor.fetchone()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Soft delete (update status)
            cursor.execute('''
                UPDATE users 
                SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (user_id,))
            
            # Log user deletion
            audit_log(
                user_id=current_user["id"],
                action="delete_user",
                table_name="users",
                record_id=user_id,
                old_values=dict(user),
                new_values={"status": "inactive"},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent")
            )
            
            return True
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete user"
        )

# ==================== SESSION MANAGEMENT ====================

async def get_active_sessions(user_id: int, current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Get active sessions for a user.
    
    Args:
        user_id: User ID
        current_user: Current authenticated user
        
    Returns:
        List of active sessions
    """
    # User can only view their own sessions unless they're admin
    if user_id != current_user["id"] and not current_user.get("can_manage_users", False):
        raise HTTPException(
            status_code=403,
            detail="Cannot view other user's sessions"
        )
    
    try:
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            cursor.execute('''
                SELECT id, session_token, device_info, ip_address,
                       login_time, last_activity, expiry_time, is_active
                FROM user_sessions 
                WHERE user_id = ? AND is_active = 1
                ORDER BY last_activity DESC
            ''', (user_id,))
            
            sessions = [dict(row) for row in cursor.fetchall()]
            return sessions
            
    except Exception as e:
        logger.error(f"Error getting sessions: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get sessions"
        )

async def terminate_session(session_token: str, current_user: Dict[str, Any], request: Request) -> bool:
    """
    Terminate a specific session.
    
    Args:
        session_token: Session token to terminate
        current_user: Current authenticated user
        request: FastAPI request
        
    Returns:
        True if successful
    """
    try:
        db_manager = get_database_manager()
        with db_manager.get_cursor() as cursor:
            # Get session details
            cursor.execute('''
                SELECT user_id FROM user_sessions 
                WHERE session_token = ? AND is_active = 1
            ''', (session_token,))
            
            session = cursor.fetchone()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            
            # Check permission (user can terminate own sessions, admin can terminate any)
            if session["user_id"] != current_user["id"] and not current_user.get("can_manage_users", False):
                raise HTTPException(
                    status_code=403,
                    detail="Cannot terminate other user's sessions"
                )
            
            # Terminate session
            cursor.execute('''
                UPDATE user_sessions 
                SET is_active = 0 
                WHERE session_token = ?
            ''', (session_token,))
            
            # Log session termination
            audit_log(
                user_id=current_user["id"],
                action="terminate_session",
                table_name="user_sessions",
                record_id=None,
                old_values={"is_active": 1},
                new_values={"is_active": 0},
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent")
            )
            
            return True
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error terminating session: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to terminate session"
        )
