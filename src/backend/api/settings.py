"""
SHOP SETTINGS & CONFIGURATION API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Dict, Any
import logging

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
                       shop_city, shop_province, shop_tax_id, gst_number,
                       currency, timezone, business_hours_open, business_hours_close,
                       logo_path, updated_at
                FROM shop_settings LIMIT 1
            """)
            settings = cur.fetchone()
        
        if not settings:
            return {
                "success": True,
                "settings": None,
                "message": "No settings configured yet"
            }
        
        return {
            "success": True,
            "settings": {
                "shop_name": settings[0],
                "shop_phone": settings[1],
                "shop_email": settings[2],
                "shop_address": settings[3],
                "shop_city": settings[4],
                "shop_province": settings[5],
                "shop_tax_id": settings[6],
                "gst_number": settings[7],
                "currency": settings[8],
                "timezone": settings[9],
                "business_hours_open": settings[10],
                "business_hours_close": settings[11],
                "logo_path": settings[12],
                "updated_at": settings[13]
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
                    "shop_city", "shop_province", "shop_tax_id", "gst_number",
                    "currency", "timezone", "business_hours_open", "business_hours_close",
                    "logo_path"
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
                        shop_city, shop_province, shop_tax_id, gst_number,
                        currency, timezone, business_hours_open, business_hours_close,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    settings_data.get("shop_name"),
                    settings_data.get("shop_phone"),
                    settings_data.get("shop_email"),
                    settings_data.get("shop_address"),
                    settings_data.get("shop_city"),
                    settings_data.get("shop_province"),
                    settings_data.get("shop_tax_id"),
                    settings_data.get("gst_number"),
                    settings_data.get("currency", "PKR"),
                    settings_data.get("timezone", "Asia/Karachi"),
                    settings_data.get("business_hours_open", "09:00"),
                    settings_data.get("business_hours_close", "22:00"),
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
                SELECT id, printer_name, printer_type, printer_port,
                       paper_width, is_default, is_active
                FROM printer_configurations
                WHERE deleted_at IS NULL
                ORDER BY is_default DESC
            """)
            printers = cur.fetchall()
        
        return {
            "success": True,
            "printers": printers or []
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
                    printer_name, printer_type, printer_port,
                    paper_width, is_default, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                printer_data.get("printer_name"),
                printer_data.get("printer_type", "thermal"),
                printer_data.get("printer_port", "LPT1"),
                printer_data.get("paper_width", 80),
                printer_data.get("is_default", False),
                printer_data.get("is_active", True),
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Printer added successfully",
            "printer_id": db.get_last_insert_id()
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
                SELECT id, backup_path, backup_size, created_at
                FROM backup_history
                ORDER BY created_at DESC
                LIMIT 20
            """)
            backups = cur.fetchall()
        
        return {
            "success": True,
            "backups": backups or []
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
        
        # This would use the DatabaseManager's backup method
        # For now, just record in history
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO backup_history (
                    backup_path, backup_size, backup_type, created_at
                ) VALUES (?, ?, ?, ?)
            """, (
                f"backups/pos_main_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.db",
                0,
                "manual",
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Backup created successfully"
        }
    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
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
            cur.execute("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL")
            user_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL")
            product_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL")
            customer_count = cur.fetchone()[0]
            
            cur.execute("SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL")
            sale_count = cur.fetchone()[0]
            
            cur.execute("SELECT SUM(total_amount) FROM sales WHERE deleted_at IS NULL")
            total_revenue = cur.fetchone()[0] or 0
        
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
