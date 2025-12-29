"""
INVENTORY MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/inventory", tags=["inventory"])
logger = logging.getLogger(__name__)


@router.get("/stock", dependencies=[Depends(require_permission("inventory.view"))])
async def get_stock_levels(
    product_id: Optional[int] = Query(None),
    category_id: Optional[int] = Query(None),
    low_stock_only: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get current stock levels for products."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT * FROM products WHERE deleted_at IS NULL"
            params = []
            
            if product_id:
                query += " AND id = ?"
                params.append(product_id)
            
            if category_id:
                query += " AND category_id = ?"
                params.append(category_id)
            
            if low_stock_only:
                query += " AND current_stock <= reorder_level"
            
            cur.execute(query, params)
            products = cur.fetchall()
        
        return {
            "success": True,
            "products": products,
            "total": len(products)
        }
    except Exception as e:
        logger.error(f"Failed to get stock levels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stock/adjust", dependencies=[Depends(require_permission("inventory.manage"))])
async def adjust_stock(
    adjustment_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Adjust stock for a product."""
    try:
        db = get_database_manager()
        product_id = adjustment_data.get("product_id")
        quantity_change = adjustment_data.get("quantity_change", 0)
        reason = adjustment_data.get("reason", "manual_adjustment")
        
        with db.get_cursor() as cur:
            # Get current stock
            cur.execute("SELECT current_stock FROM products WHERE id = ?", (product_id,))
            result = cur.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Product not found")
            
            current_stock = result[0]
            new_stock = current_stock + quantity_change
            
            if new_stock < 0:
                raise ValueError("Stock cannot be negative")
            
            # Update product stock
            cur.execute(
                "UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?",
                (new_stock, datetime.datetime.now().isoformat(), product_id)
            )
            
            # Record movement
            cur.execute("""
                INSERT INTO stock_movements (
                    product_id, movement_type, quantity, reason,
                    created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                product_id,
                "adjustment",
                quantity_change,
                reason,
                current_user["id"],
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Stock adjusted successfully",
            "product_id": product_id,
            "new_stock": new_stock
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to adjust stock: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/movements", dependencies=[Depends(require_permission("inventory.view"))])
async def get_stock_movements(
    skip: int = Query(0),
    limit: int = Query(50),
    product_id: Optional[int] = Query(None),
    movement_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get stock movement history."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT * FROM stock_movements WHERE 1=1"
            params = []
            
            if product_id:
                query += " AND product_id = ?"
                params.append(product_id)
            
            if movement_type:
                query += " AND movement_type = ?"
                params.append(movement_type)
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            movements = cur.fetchall()
            
            # Get count
            count_query = "SELECT COUNT(*) FROM stock_movements WHERE 1=1"
            count_params = []
            if product_id:
                count_query += " AND product_id = ?"
                count_params.append(product_id)
            if movement_type:
                count_query += " AND movement_type = ?"
                count_params.append(movement_type)
            if start_date:
                count_query += " AND created_at >= ?"
                count_params.append(start_date)
            if end_date:
                count_query += " AND created_at <= ?"
                count_params.append(end_date)
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()[0]
        
        return {
            "success": True,
            "movements": movements,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Failed to get movements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts", dependencies=[Depends(require_permission("inventory.view"))])
async def get_stock_alerts(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get products that need restocking."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Low stock
            cur.execute("""
                SELECT id, name, current_stock, reorder_level
                FROM products
                WHERE current_stock <= reorder_level AND deleted_at IS NULL
                ORDER BY current_stock ASC
            """)
            low_stock = cur.fetchall()
            
            # Out of stock
            cur.execute("""
                SELECT id, name FROM products
                WHERE current_stock = 0 AND deleted_at IS NULL
            """)
            out_of_stock = cur.fetchall()
        
        return {
            "success": True,
            "low_stock_alert": low_stock or [],
            "out_of_stock_alert": out_of_stock or [],
            "total_alerts": len(low_stock or []) + len(out_of_stock or [])
        }
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reorder-level/{product_id}", dependencies=[Depends(require_permission("inventory.manage"))])
async def set_reorder_level(
    product_id: int,
    reorder_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Set reorder level for product."""
    try:
        reorder_level = reorder_data.get("reorder_level")
        
        if reorder_level < 0:
            raise ValueError("Reorder level must be positive")
        
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute(
                "UPDATE products SET reorder_level = ?, updated_at = ? WHERE id = ?",
                (reorder_level, datetime.datetime.now().isoformat(), product_id)
            )
        
        return {
            "success": True,
            "message": "Reorder level updated successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to set reorder level: {e}")
        raise HTTPException(status_code=500, detail=str(e))
