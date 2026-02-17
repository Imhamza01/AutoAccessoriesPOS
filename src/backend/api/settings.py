"""
SHOP SETTINGS & CONFIGURATION API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Body, File, UploadFile
from typing import Dict, Any, List
import os
import shutil
import logging
import sqlite3
from pathlib import Path
from tempfile import NamedTemporaryFile

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger(__name__)


@router.get("/shop", dependencies=[Depends(require_permission("settings.view"))])
async def get_shop_settings(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get shop settings."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT shop_name, shop_phone, shop_email, shop_address,
                       shop_city, owner_name, ntn_number, gst_number,
                       currency_symbol, 'Asia/Karachi', '09:00', '18:00',
                       logo_path, created_at, receipt_footer
                FROM shop_settings LIMIT 1
            """)
            row = cur.fetchone()
        
        if not row:
            return {
                "success": True,
                "settings": None,
                "message": "No settings configured yet"
            }
        
        # Convert sqlite3.Row to dict
        settings = dict(row)
        
        return {
            "success": True,
            "settings": {
                "shop_name": settings.get("shop_name"),
                "shop_phone": settings.get("shop_phone"),
                "shop_email": settings.get("shop_email"),
                "shop_address": settings.get("shop_address"),
                "shop_city": settings.get("shop_city"),
                "owner_name": settings.get("owner_name"),
                "shop_tax_id": settings.get("ntn_number"),
                "gst_number": settings.get("gst_number"),
                "currency": settings.get("currency_symbol"),
                "timezone": "Asia/Karachi",
                "business_hours_open": "09:00",
                "business_hours_close": "18:00",
                "logo_path": settings.get("logo_path"),
                "receipt_footer": settings.get("receipt_footer"),
                "updated_at": settings.get("created_at") # Using created_at as updated_at if not present
            }
        }
    except Exception as e:
        logger.error(f"Failed to get shop settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/shop", dependencies=[Depends(require_permission("settings.manage"))])
async def update_shop_settings(
    settings_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update shop settings."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Check if exists
            cur.execute("SELECT id FROM shop_settings LIMIT 1")
            exists = cur.fetchone()
            
            if exists:
                # Update
                updates = []
                params = []
                for field in [
                    "shop_name", "shop_phone", "shop_email", "shop_address",
                    "shop_city", "owner_name", "ntn_number", "gst_number",
                    "currency_symbol", "logo_path", "receipt_footer"
                ]:
                    if field in settings_data:
                        updates.append(f"{field} = ?")
                        params.append(settings_data[field])
                
                if updates:
                    updates.append("updated_at = ?")
                    params.append(datetime.datetime.now().isoformat())
                    
                    query = f"UPDATE shop_settings SET {', '.join(updates)}"
                    cur.execute(query, params)
            else:
                # Insert
                cur.execute("""
                    INSERT INTO shop_settings (
                        shop_name, shop_phone, shop_email, shop_address,
                        shop_city, owner_name, ntn_number, gst_number,
                        currency_symbol, receipt_footer, logo_path,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    settings_data.get("shop_name"),
                    settings_data.get("shop_phone"),
                    settings_data.get("shop_email"),
                    settings_data.get("shop_address"),
                    settings_data.get("shop_city"),
                    settings_data.get("owner_name"),
                    settings_data.get("ntn_number") or settings_data.get("shop_tax_id"),
                    settings_data.get("gst_number"),
                    settings_data.get("currency", settings_data.get("currency_symbol", "₹")),
                    settings_data.get("receipt_footer", ""),
                    settings_data.get("logo_path"),
                    datetime.datetime.now().isoformat(),
                    datetime.datetime.now().isoformat()
                ))
        
        return {
            "success": True,
            "message": "Settings updated successfully"
        }
    except Exception as e:
        logger.error(f"Failed to update shop settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/printer", dependencies=[Depends(require_permission("settings.view"))])
async def get_printer_settings(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get printer configurations."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT id, printer_name, printer_type, connection_string,
                       paper_width, is_default, is_active
                FROM printer_configurations
                ORDER BY is_default DESC
            """)
            rows = cur.fetchall()
            
        # Convert to dicts
        printers = [dict(row) for row in rows]
        
        return {
            "success": True,
            "printers": printers
        }
    except Exception as e:
        logger.error(f"Failed to get printer settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/printer", dependencies=[Depends(require_permission("settings.manage"))])
async def add_printer(
    printer_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Add printer configuration."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO printer_configurations (
                    printer_name, printer_type, connection_string,
                    paper_width, is_default, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                printer_data.get("printer_name"),
                printer_data.get("printer_type", "thermal"),
                printer_data.get("connection_string", printer_data.get("printer_port", "LPT1")),
                printer_data.get("paper_width", 80),
                printer_data.get("is_default", False),
                printer_data.get("is_active", True),
                datetime.datetime.now().isoformat()
            ))
            printer_id = cur.lastrowid
        
        return {
            "success": True,
            "message": "Printer added successfully",
            "printer_id": printer_id
        }
    except Exception as e:
        logger.error(f"Failed to add printer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backup", dependencies=[Depends(require_permission("settings.manage"))])
async def get_backup_list(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get list of database backups."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT id, file_path, file_size, created_at
                FROM backup_history
                ORDER BY created_at DESC
                LIMIT 20
            """)
            rows = cur.fetchall()
        
        # FIX: Convert sqlite3.Row objects to dicts to avoid "not enough values to unpack"
        # or serialization errors in FastAPI/Starlette
        backups = []
        for row in rows:
            if isinstance(row, sqlite3.Row) or hasattr(row, 'keys'):
                backups.append(dict(row))
            else:
                # Fallback for tuples (id, file_path, file_size, created_at)
                try:
                    backups.append({
                        "id": row[0],
                        "file_path": row[1],
                        "file_size": row[2],
                        "created_at": row[3]
                    })
                except IndexError:
                    pass # Skip invalid rows
        
        return {
            "success": True,
            "backups": backups
        }
    except Exception as e:
        logger.error(f"Failed to get backup list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/create", dependencies=[Depends(require_permission("settings.manage"))])
async def create_backup(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create database backup."""
    try:
        db = get_database_manager()
        backup_path = db.backup_database()
        
        # Copy to local backups folder for user visibility
        try:
            local_backups = Path.cwd() / "backups"
            local_backups.mkdir(exist_ok=True)
            if backup_path and os.path.exists(backup_path):
                 shutil.copy2(backup_path, local_backups / os.path.basename(backup_path))
        except Exception as e:
            logger.warning(f"Failed to copy backup to local folder: {e}")
        
        return {
            "success": True,
            "message": "Backup created successfully",
            "file_path": backup_path
        }
    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/{backup_id}/restore", dependencies=[Depends(require_permission("settings.manage"))])
async def restore_backup(
    backup_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Restore database from backup ID."""
    try:
        db = get_database_manager()
        
        # Get backup path
        with db.get_cursor() as cur:
            cur.execute("SELECT file_path FROM backup_history WHERE id = ?", (backup_id,))
            row = cur.fetchone()
            
        if not row:
            raise HTTPException(status_code=404, detail="Backup not found")
            
        file_path = row[0]
        
        # Verify file exists
        if not os.path.exists(file_path):
             raise HTTPException(status_code=404, detail="Backup file not found on disk")
             
        # Perform restore
        if db.restore_database(file_path):
            return {
                "success": True,
                "message": "Database restored successfully. Please restart the application."
            }
        else:
            raise HTTPException(status_code=500, detail="Restore failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to restore backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/restore-from-file", dependencies=[Depends(require_permission("settings.manage"))])
async def restore_from_file(
    file_payload: Dict[str, str] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Restore from a specific file path."""
    try:
        file_path = file_payload.get("file_path")
        if not file_path:
             raise HTTPException(status_code=400, detail="File path required")

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Backup file not found")
            
        db = get_database_manager()
        if db.restore_database(file_path):
             return {"success": True, "message": "Database restored successfully. Please restart the application."}
        else:
             raise HTTPException(status_code=500, detail="Restore failed")
    except Exception as e:
        logger.error(f"Restore failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-logo", dependencies=[Depends(require_permission("settings.manage"))])
async def upload_logo(
    file_payload: Dict[str, str] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Upload logo from local path (desktop) to app uploads."""
    try:
        file_path = file_payload.get("file_path")
        if not file_path:
            raise HTTPException(status_code=400, detail="File path required")
            
        source_path = Path(file_path)
        if not source_path.exists():
             raise HTTPException(status_code=404, detail="File not found")

        db = get_database_manager()
        destination_dir = db.app_data_path / "uploads"
        destination_dir.mkdir(parents=True, exist_ok=True)
        
        # Determine target name
        extension = source_path.suffix
        if not extension:
            extension = ".png" # Default
            
        target_name = f"shop_logo{extension}"
        destination_path = destination_dir / target_name
        
        shutil.copy2(source_path, destination_path)
        
        # Update settings with relative path for frontend
        logo_url = f"/uploads/{target_name}"
        
        with db.get_cursor() as cur:
            # Check if exists to update or insert (though update_shop_settings handles insert, this is specific)
            cur.execute("UPDATE shop_settings SET logo_path = ?, updated_at = ? WHERE id = (SELECT id FROM shop_settings LIMIT 1)", 
                        (logo_url, datetime.datetime.now().isoformat()))
            
        return {"success": True, "logo_path": logo_url}
    except Exception as e:
        logger.error(f"Failed to upload logo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-logo-file", dependencies=[Depends(require_permission("settings.manage"))])
async def upload_logo_file(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Upload logo via multipart form data (Browser fallback)."""
    try:
        db = get_database_manager()
        destination_dir = db.app_data_path / "uploads"
        destination_dir.mkdir(parents=True, exist_ok=True)
        
        # Determine target name
        filename = file.filename or "logo.png"
        extension = Path(filename).suffix or ".png"
        target_name = f"shop_logo{extension}"
        destination_path = destination_dir / target_name
        
        # Save uploaded file
        with open(destination_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Update settings
        logo_url = f"/uploads/{target_name}"
        
        with db.get_cursor() as cur:
            cur.execute("UPDATE shop_settings SET logo_path = ?, updated_at = ? WHERE id = (SELECT id FROM shop_settings LIMIT 1)", 
                        (logo_url, datetime.datetime.now().isoformat()))
            
        return {"success": True, "logo_path": logo_url}
    except Exception as e:
        logger.error(f"Failed to upload logo file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/restore-upload", dependencies=[Depends(require_permission("settings.manage"))])
async def restore_backup_upload(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Restore database from uploaded file (Browser fallback)."""
    try:
        # Save to temp file first
        suffix = Path(file.filename).suffix if file.filename else ".db"
        with NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
            
        try:
            db = get_database_manager()
            if db.restore_database(tmp_path):
                 return {"success": True, "message": "Database restored successfully. Please restart the application."}
            else:
                 raise HTTPException(status_code=500, detail="Restore failed")
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except:
                    pass
                    
    except Exception as e:
        logger.error(f"Restore upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/factory-reset", dependencies=[Depends(require_permission("settings.manage"))])
async def factory_reset(
    confirmation: Dict[str, str] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Perform Factory Reset.
    Requires 'RESET' confirmation string.
    """
    try:
        if confirmation.get("confirm", "").upper() != "RESET":
            raise HTTPException(status_code=400, detail="Invalid confirmation code")
            
        db = get_database_manager()
        
        if db.factory_reset():
            return {
                "success": True,
                "message": "Factory reset completed successfully. Application will now restart."
            }
        else:
            raise HTTPException(status_code=500, detail="Factory reset failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to perform factory reset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system-info", dependencies=[Depends(require_permission("settings.view"))])
async def system_info(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get system information and statistics."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Count statistics
            cur.execute("SELECT COUNT(*) FROM users")
            user_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM products")
            product_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM customers")
            customer_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM sales")
            sale_count = cur.fetchone()[0]
            
            cur.execute("SELECT SUM(grand_total) FROM sales")
            result = cur.fetchone()
            total_revenue = result[0] if result and result[0] else 0
        
        return {
            "success": True,
            "system_info": {
                "application": "Auto Accessories POS",
                "version": "1.0.0",
                "users": user_count,
                "products": product_count,
                "customers": customer_count,
                "total_sales": sale_count,
                "total_revenue": total_revenue,
                "timestamp": datetime.datetime.now().isoformat()
            }
        }
    except Exception as e:
        logger.error(f"Failed to get system info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users", dependencies=[Depends(require_permission("users.view"))])
async def get_users(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get list of users."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT id, username, full_name, role, status,
                       created_at, updated_at
                FROM users
                ORDER BY created_at DESC
            """)
            rows = cur.fetchall()
        
        # Convert to dicts and add dummy email field
        users = []
        for row in rows:
            u = dict(row)
            u['email'] = u.get('email', '') # Placeholder for frontend compatibility
            u['phone'] = u.get('phone', '') # Placeholder for frontend compatibility
            users.append(u)
        
        return {
            "success": True,
            "users": users
        }
    except Exception as e:
        logger.error(f"Failed to get users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users", dependencies=[Depends(require_permission("users.manage"))])
async def create_user(
    user_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create a new user."""
    try:
        db = get_database_manager()
        
        # Check if username already exists
        with db.get_cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = ?", (user_data.get("username"),))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Username already exists")
        
        # Hash password
        from core.auth import AuthenticationManager
        hashed_password, _ = AuthenticationManager.hash_password(user_data.get("password"))
        
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO users (
                    username, password_hash, full_name, role,
                    status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                user_data.get("username"),
                hashed_password,
                user_data.get("full_name"),
                user_data.get("role") if user_data.get("role") in ["malik", "munshi", "shop_boy", "stock_boy"] else "shop_boy",
                "active" if user_data.get("is_active", True) else "inactive",
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
            user_id = cur.lastrowid
        
        return {
            "success": True,
            "message": "User created successfully",
            "user_id": user_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def update_user(
    user_id: int,
    user_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update user information."""
    try:
        db = get_database_manager()
        
        with db.get_cursor() as cur:
            updates = []
            params = []
            
            for field in ["full_name", "status"]:
                if field in user_data:
                    updates.append(f"{field} = ?")
                    params.append(user_data[field])
            
            # Validate and add role separately
            if "role" in user_data:
                role = user_data["role"] if user_data["role"] in ["malik", "munshi", "shop_boy", "stock_boy"] else "shop_boy"
                updates.append("role = ?")
                params.append(role)
            
            # Map is_active to status
            if "is_active" in user_data:
                status = "active" if user_data["is_active"] else "inactive"
                updates.append("status = ?")
                params.append(status)
            
            if "password" in user_data and user_data["password"]:
                from core.auth import AuthenticationManager
                hashed_password, _ = AuthenticationManager.hash_password(user_data["password"])
                updates.append("password_hash = ?")
                params.append(hashed_password)
            
            if updates:
                updates.append("updated_at = ?")
                params.append(datetime.datetime.now().isoformat())
                
                query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
                params.append(user_id)
                cur.execute(query, params)
        
        return {
            "success": True,
            "message": "User updated successfully"
        }
    except Exception as e:
        logger.error(f"Failed to update user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}", dependencies=[Depends(require_permission("users.manage"))])
async def delete_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete a user (soft delete by deactivating)."""
    try:
        db = get_database_manager()
        
        with db.get_cursor() as cur:
            cur.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
        
        return {
            "success": True,
            "message": "User deactivated successfully"
        }
    except Exception as e:
        logger.error(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/system-preferences", dependencies=[Depends(require_permission("settings.manage"))])
async def update_system_preferences(
    prefs_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update system preferences."""
    try:
        # This would update system-wide preferences
        # Could be stored in a preferences table or configuration file
        
        return {
            "success": True,
            "message": "Preferences updated successfully",
            "preferences": {
                "auto_print_receipts": prefs_data.get("auto_print_receipts", False),
                "gst_enabled": prefs_data.get("gst_enabled", True),
                "credit_sales_enabled": prefs_data.get("credit_sales_enabled", True),
                "employee_commissions": prefs_data.get("employee_commissions", False)
            }
        }
    except Exception as e:
        logger.error(f"Failed to update preferences: {e}")
        raise HTTPException(status_code=500, detail=str(e))
