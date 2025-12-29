"""
POINT OF SALE (POS) API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/pos", tags=["pos"])
logger = logging.getLogger(__name__)


@router.post("/transaction", dependencies=[Depends(require_permission("pos.sell"))])
async def create_pos_transaction(
    transaction_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create POS transaction (complete sale)."""
    try:
        db = get_database_manager()
        
        with db.get_cursor() as cur:
            # Create sale
            cur.execute("""
                INSERT INTO sales (
                    customer_id, total_amount, subtotal, discount_amount,
                    gst_amount, payment_type, payment_status, notes,
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                transaction_data.get("customer_id"),
                transaction_data.get("total_amount", 0),
                transaction_data.get("subtotal", 0),
                transaction_data.get("discount_amount", 0),
                transaction_data.get("gst_amount", 0),
                transaction_data.get("payment_type", "cash"),
                "completed",
                transaction_data.get("notes"),
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
            
            sale_id = db.get_last_insert_id()
            
            # Add items and update stock
            for item in transaction_data.get("items", []):
                product_id = item.get("product_id")
                quantity = item.get("quantity")
                
                # Add sale item
                cur.execute("""
                    INSERT INTO sale_items (
                        sale_id, product_id, quantity, unit_price,
                        total_price, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    sale_id,
                    product_id,
                    quantity,
                    item.get("unit_price"),
                    item.get("total_price"),
                    datetime.datetime.now().isoformat(),
                    datetime.datetime.now().isoformat()
                ))
                
                # Update product stock
                cur.execute(
                    "UPDATE products SET current_stock = current_stock - ? WHERE id = ?",
                    (quantity, product_id)
                )
                
                # Record stock movement
                cur.execute("""
                    INSERT INTO stock_movements (
                        product_id, movement_type, quantity, reason,
                        created_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    product_id,
                    "sale",
                    -quantity,
                    f"POS Sale #{sale_id}",
                    current_user["id"],
                    datetime.datetime.now().isoformat()
                ))
            
            # Record payment
            cur.execute("""
                INSERT INTO sale_payments (
                    sale_id, payment_type, amount, created_at
                ) VALUES (?, ?, ?, ?)
            """, (
                sale_id,
                transaction_data.get("payment_type", "cash"),
                transaction_data.get("total_amount", 0),
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Transaction completed successfully",
            "sale_id": sale_id
        }
    except Exception as e:
        logger.error(f"Failed to create POS transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/barcode/{barcode}", dependencies=[Depends(require_permission("pos.sell"))])
async def get_product_by_barcode(
    barcode: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get product info by barcode for POS."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT p.* FROM products p
                WHERE (p.barcode = ? OR p.sku = ?) AND p.deleted_at IS NULL
                LIMIT 1
            """, (barcode, barcode))
            product = cur.fetchone()
            
            if not product:
                raise HTTPException(status_code=404, detail="Product not found")
        
        return {
            "success": True,
            "product": product
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get product by barcode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discount/applicable", dependencies=[Depends(require_permission("pos.sell"))])
async def get_applicable_discounts(
    customer_id: Optional[int] = Query(None),
    total_amount: float = Query(0),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get available discounts for current transaction."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get all active discounts
            cur.execute("""
                SELECT * FROM price_groups
                WHERE is_active = 1 AND deleted_at IS NULL
                ORDER BY discount_percentage DESC
            """)
            discounts = cur.fetchall()
        
        # Apply logic: check customer eligibility
        applicable = []
        for discount in discounts:
            # Basic logic - can be extended
            applicable.append(discount)
        
        return {
            "success": True,
            "discounts": applicable
        }
    except Exception as e:
        logger.error(f"Failed to get discounts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-bill", dependencies=[Depends(require_permission("pos.sell"))])
async def calculate_bill(
    bill_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Calculate bill with GST and discounts."""
    try:
        items = bill_data.get("items", [])
        discount_percent = bill_data.get("discount_percent", 0)
        
        # Calculate subtotal
        subtotal = sum(item.get("quantity", 0) * item.get("unit_price", 0) for item in items)
        
        # Apply discount
        discount_amount = (subtotal * discount_percent) / 100
        amount_after_discount = subtotal - discount_amount
        
        # Calculate GST (assume 17% as per Pakistan standard)
        gst_percent = 17
        gst_amount = (amount_after_discount * gst_percent) / 100
        
        # Final total
        total_amount = amount_after_discount + gst_amount
        
        return {
            "success": True,
            "subtotal": round(subtotal, 2),
            "discount_amount": round(discount_amount, 2),
            "gst_amount": round(gst_amount, 2),
            "total_amount": round(total_amount, 2),
            "items_count": len(items)
        }
    except Exception as e:
        logger.error(f"Failed to calculate bill: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/open", dependencies=[Depends(require_permission("pos.sell"))])
async def open_session(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Open POS session for cashier."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO pos_sessions (
                    user_id, opening_balance, opened_at, status
                ) VALUES (?, ?, ?, ?)
            """, (
                current_user["id"],
                0,
                datetime.datetime.now().isoformat(),
                "open"
            ))
        
        return {
            "success": True,
            "message": "POS session opened",
            "session_id": db.get_last_insert_id()
        }
    except Exception as e:
        logger.error(f"Failed to open session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/close", dependencies=[Depends(require_permission("pos.sell"))])
async def close_session(
    session_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Close POS session and reconcile cash."""
    try:
        session_id = session_data.get("session_id")
        closing_balance = session_data.get("closing_balance", 0)
        
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                UPDATE pos_sessions
                SET closing_balance = ?, closed_at = ?, status = ?
                WHERE id = ?
            """, (
                closing_balance,
                datetime.datetime.now().isoformat(),
                "closed",
                session_id
            ))
        
        return {
            "success": True,
            "message": "POS session closed successfully"
        }
    except Exception as e:
        logger.error(f"Failed to close session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
