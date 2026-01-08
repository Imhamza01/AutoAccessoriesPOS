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
            # Generate invoice number based on current timestamp to ensure uniqueness
            invoice_number = f"POS-{datetime.datetime.now().strftime('%Y%m%d')}{int(datetime.datetime.now().timestamp() * 1000) % 100000}"
            
            # Get cashier name from current user
            cashier_name = current_user.get("name") or current_user.get("username") or f"User {current_user['id']}"
            
            cur.execute("""
                INSERT INTO sales (
                    invoice_number, customer_id, grand_total, subtotal, discount_amount,
                    gst_amount, payment_method, payment_status, notes,
                    cashier_id, cashier_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                invoice_number,
                transaction_data.get("customer_id"),
                transaction_data.get("total_amount", 0),
                transaction_data.get("subtotal", 0),
                transaction_data.get("discount_amount", 0),
                transaction_data.get("gst_amount", 0),
                transaction_data.get("payment_type", "cash"),
                "paid",  # Changed from 'completed' to 'paid' to match CHECK constraint
                transaction_data.get("notes"),
                current_user["id"],  # cashier_id
                cashier_name,  # cashier_name
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
            
            sale_id = cur.lastrowid
            
            # Add items and update stock
            for item in transaction_data.get("items", []):
                product_id = item.get("product_id")
                quantity = item.get("quantity")
                
                # Fetch product details for the invoice
                cur.execute("SELECT product_code, name, cost_price, current_stock FROM products WHERE id = ?", (product_id,))
                product_row = cur.fetchone()
                
                if not product_row:
                    raise HTTPException(status_code=400, detail=f"Product ID {product_id} not found")
                
                product_code = product_row['product_code']
                product_name = product_row['name']
                cost_price = product_row['cost_price']
                current_stock = product_row['current_stock']
                
                unit_price = item.get("unit_price")
                line_total = item.get("total_price")
                
                # Calculate profit
                line_profit = line_total - (cost_price * quantity)
                
                # Add sale item
                cur.execute("""
                    INSERT INTO sale_items (
                        sale_id, product_id, product_code, product_name,
                        quantity, unit_price, cost_price,
                        line_total, line_profit, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sale_id,
                    product_id,
                    product_code,
                    product_name,
                    quantity,
                    unit_price,
                    cost_price,
                    line_total,
                    line_profit,
                    datetime.datetime.now().isoformat(sep=' ')
                ))
                
                # Update product stock
                new_stock = current_stock - quantity
                cur.execute(
                    "UPDATE products SET current_stock = ? WHERE id = ?",
                    (new_stock, product_id)
                )
                
                # Record stock movement
                cur.execute("""
                    INSERT INTO stock_movements (
                        product_id, movement_type, quantity, 
                        previous_quantity, new_quantity,
                        reason, created_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    product_id,
                    "sale",
                    -quantity,
                    current_stock,
                    new_stock,
                    f"POS Sale #{sale_id}",
                    current_user["id"],
                    datetime.datetime.now().isoformat()
                ))
            
            # Record payment
            cur.execute("""
                INSERT INTO payments (
                    sale_id, payment_method, amount, payment_date
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
                WHERE (p.barcode = ? OR p.sku = ?)
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
                WHERE is_active = 1
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


@router.post("/hold-sale", dependencies=[Depends(require_permission("pos.sell"))])
async def hold_sale(
    sale_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Hold a sale for later completion."""
    try:
        db = get_database_manager()
        
        with db.get_cursor() as cur:
            # Generate invoice number based on current timestamp to ensure uniqueness
            invoice_number = f"HOLD-{datetime.datetime.now().strftime('%Y%m%d')}{int(datetime.datetime.now().timestamp() * 1000) % 100000}"
            
            # Get cashier name from current user
            cashier_name = current_user.get("name") or current_user.get("username") or f"User {current_user['id']}"
            
            # Create sale with 'hold' status
            cur.execute("""
                INSERT INTO sales (
                    invoice_number, customer_id, grand_total, subtotal, discount_amount,
                    gst_amount, payment_method, payment_status, notes,
                    cashier_id, cashier_name, created_at, updated_at, sale_status, hold_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                invoice_number,
                sale_data.get("customer_id"),
                sale_data.get("total_amount", 0),
                sale_data.get("subtotal", 0),
                sale_data.get("discount_amount", 0),
                sale_data.get("gst_amount", 0),
                "credit",  # payment_method - using credit for held sales
                "pending",  # payment_status
                sale_data.get("notes", ""),
                current_user["id"],  # cashier_id
                cashier_name,  # cashier_name
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat(),
                "hold",  # sale_status
                sale_data.get("hold_reason", "Sale held by cashier")
            ))
            
            sale_id = cur.lastrowid
            
            # Add items to the sale
            for item in sale_data.get("items", []):
                product_id = item.get("product_id")
                quantity = item.get("quantity")
                
                # Fetch product details for the invoice
                cur.execute("SELECT product_code, name, cost_price FROM products WHERE id = ?", (product_id,))
                product_row = cur.fetchone()
                
                if not product_row:
                    raise HTTPException(status_code=400, detail=f"Product ID {product_id} not found")
                
                product_code = product_row['product_code']
                product_name = product_row['name']
                cost_price = product_row['cost_price']
                
                unit_price = item.get("unit_price")
                line_total = item.get("total_price")
                
                # Calculate profit
                line_profit = line_total - (cost_price * quantity)
                
                # Add sale item
                cur.execute("""
                    INSERT INTO sale_items (
                        sale_id, product_id, product_code, product_name,
                        quantity, unit_price, cost_price,
                        line_total, line_profit, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sale_id,
                    product_id,
                    product_code,
                    product_name,
                    quantity,
                    unit_price,
                    cost_price,
                    line_total,
                    line_profit,
                    datetime.datetime.now().isoformat(sep=' ')
                ))
        
        return {
            "success": True,
            "message": "Sale held successfully",
            "sale_id": sale_id,
            "invoice_number": invoice_number
        }
    except Exception as e:
        logger.error(f"Failed to hold sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/held-sales", dependencies=[Depends(require_permission("pos.sell"))])
async def get_held_sales(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all held sales for the current user."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute(
                "SELECT * FROM sales WHERE sale_status = 'hold' ORDER BY created_at DESC"
            )
            raw_sales = cur.fetchall()
            
            # Convert to list of dictionaries to avoid unpacking issues
            sales = []
            for row in raw_sales:
                if hasattr(row, 'keys'):  # sqlite3.Row object
                    sales.append(dict(row))
                else:
                    sales.append(row)
        
        return {
            "success": True,
            "sales": sales
        }
    except Exception as e:
        logger.error(f"Failed to get held sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resume-sale/{sale_id}", dependencies=[Depends(require_permission("pos.sell"))])
async def resume_sale(
    sale_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Resume a held sale."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute(
                "SELECT * FROM sales WHERE id = ? AND sale_status = 'hold'", (sale_id,)
            )
            sale = cur.fetchone()
            
            if not sale:
                raise HTTPException(status_code=404, detail="Held sale not found")
            
            # Get sale items
            cur.execute("SELECT * FROM sale_items WHERE sale_id = ?", (sale_id,))
            raw_items = cur.fetchall()
            items = []
            for row in raw_items:
                if hasattr(row, 'keys'):  # sqlite3.Row object
                    items.append(dict(row))
                else:
                    items.append(row)
        
        return {
            "success": True,
            "sale": dict(sale) if hasattr(sale, 'keys') else sale,
            "items": items
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resume sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/held-sale/{sale_id}", dependencies=[Depends(require_permission("pos.sell"))])
async def delete_held_sale(
    sale_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete/cancel a held sale."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # First check if the sale exists and is held
            cur.execute(
                "SELECT * FROM sales WHERE id = ? AND sale_status = 'hold'", (sale_id,)
            )
            sale = cur.fetchone()
            
            if not sale:
                raise HTTPException(status_code=404, detail="Held sale not found")
            
            # Update sale status to cancelled
            cur.execute(
                "UPDATE sales SET sale_status = 'cancelled', updated_at = ? WHERE id = ?",
                (datetime.datetime.now().isoformat(), sale_id)
            )
        
        return {
            "success": True,
            "message": "Held sale cancelled successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete held sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))
