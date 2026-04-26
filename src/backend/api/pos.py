"""
POINT OF SALE (POS) API ENDPOINTS
"""

import datetime
import json
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager
from core.backup_manager import create_auto_backup

router = APIRouter(prefix="/pos", tags=["pos"])
logger = logging.getLogger(__name__)


@router.post("/transaction")
async def create_pos_transaction(
    transaction_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(require_permission("sales.create"))
):
    """Create POS transaction (complete sale)."""
    try:
        logger.info(f"Creating POS transaction: {json.dumps(transaction_data, default=str)}")
        
        # Validate items exist
        items = transaction_data.get("items", [])
        if not items:
            raise HTTPException(status_code=400, detail="No items in transaction")
            
        logger.info(f"Transaction has {len(items)} items")
        for idx, item in enumerate(items):
            logger.info(f"Item {idx}: product_id={item.get('product_id')}, is_custom={item.get('is_custom')}, name={item.get('product_name')}")
        
        db = get_database_manager()
        
        with db.get_cursor() as cur:
            # Create sale
            # Generate invoice number based on current timestamp to ensure uniqueness
            invoice_number = f"POS-{datetime.datetime.now().strftime('%Y%m%d')}{int(datetime.datetime.now().timestamp() * 1000) % 100000}"
            
            # Get cashier name from current user
            cashier_name = current_user.get("name") or current_user.get("username") or f"User {current_user['id']}"
            
            # Determine payment status based on payment method
            payment_method = transaction_data.get("payment_type", "cash")
            payment_status = "pending" if payment_method.lower() in ["credit", "credit_sale"] else "paid"
            
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
                payment_method,
                payment_status,
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
                is_custom = item.get("is_custom", False)

                if is_custom or not product_id:
                    # Custom item / service — no product lookup or stock deduction
                    product_code = 'CUSTOM'
                    product_name = item.get("product_name") or 'Custom Item'
                    cost_price = 0
                    unit_price = item.get("unit_price", 0)
                    line_total = item.get("total_price", unit_price * quantity)
                    line_profit = line_total  # no cost
                    
                    logger.info(f"Inserting custom item: sale_id={sale_id}, name={product_name}, qty={quantity}, price={unit_price}, total={line_total}")

                    # Use -1 as placeholder product_id to avoid NULL/FK issues
                    cur.execute("""
                        INSERT INTO sale_items (
                            sale_id, product_id, product_code, product_name,
                            quantity, unit_price, cost_price,
                            line_total, line_profit, created_at
                        ) VALUES (?, -1, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        sale_id, product_code, product_name,
                        quantity, unit_price, cost_price,
                        line_total, line_profit,
                        datetime.datetime.now().isoformat(sep=' ')
                    ))
                    
                    logger.info(f"Custom item inserted successfully, lastrowid={cur.lastrowid}")
                    continue

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
                
                # Update product stock — floor at 0 to prevent negative inventory
                new_stock = max(0, current_stock - quantity)
                if quantity > current_stock:
                    logger.warning(
                        f"Oversell: Product {product_id} ({product_name}) — "
                        f"sold {quantity}, had {current_stock}. Stock clamped to 0."
                    )
                cur.execute(
                    "UPDATE products SET current_stock = ? WHERE id = ?",
                    (new_stock, product_id)
                )

                # Record stock movement
                cur.execute("""
                    INSERT INTO stock_movements (
                        product_id, movement_type, quantity,
                        previous_quantity, new_quantity, unit_cost,
                        total_cost, reference_id, reference_type,
                        reason, notes, created_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    product_id,
                    "sale",
                    -(current_stock - new_stock),   # actual deducted amount
                    current_stock,
                    new_stock,
                    cost_price,
                    cost_price * (current_stock - new_stock),
                    sale_id,
                    "sale",
                    f"POS Sale #{sale_id}",
                    f"Stock reduction for POS sale #{sale_id}",
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
            
            # Update customer's credit balance if this is a credit sale
            customer_id = transaction_data.get("customer_id")
            if customer_id:
                payment_method = transaction_data.get("payment_type", "cash")
                total_amount = transaction_data.get("total_amount", 0)
                
                # If payment method is credit, increase the customer's current_balance (outstanding credit)
                if payment_method.lower() in ["credit", "credit_sale"]:
                    cur.execute("""
                        UPDATE customers 
                        SET current_balance = current_balance + ?, updated_at = ?
                        WHERE id = ?
                    """, (total_amount, datetime.datetime.now().isoformat(), customer_id))
                # If payment method is not credit, the balance was paid in full
                elif payment_method.lower() in ["cash", "card", "bank_transfer"] and total_amount > 0:
                    # For non-credit payments, we don't change the current_balance here
                    # The current_balance only increases on credit purchases and decreases on credit payments
                    pass
        
        return {
            "success": True,
            "message": "Transaction completed successfully",
            "sale_id": sale_id,
            "invoice_number": invoice_number
        }
    except Exception as e:
        import traceback
        logger.error(f"Failed to create POS transaction: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Auto-backup at most once per hour (not on every sale)
        try:
            _hour_tag = datetime.datetime.now().strftime('%Y%m%d%H')
            _db = get_database_manager()
            with _db.get_cursor() as _cur:
                _cur.execute(
                    "SELECT id FROM backup_history WHERE backup_type='auto' "
                    "AND notes=? LIMIT 1",
                    (f"hourly_{_hour_tag}",)
                )
                _already_done = _cur.fetchone()

            if not _already_done:
                create_auto_backup()
                # Tag this backup with the hour so we skip subsequent ones
                with _db.get_cursor() as _cur:
                    _cur.execute(
                        "UPDATE backup_history SET notes=? WHERE id="
                        "(SELECT MAX(id) FROM backup_history WHERE backup_type='auto')",
                        (f"hourly_{_hour_tag}",)
                    )
        except Exception as _be:
            logger.warning(f"Auto-backup check failed (non-critical): {_be}")


@router.get("/barcode/{barcode}", dependencies=[Depends(require_permission("pos.access"))])
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


@router.get("/discount/applicable", dependencies=[Depends(require_permission("pos.access"))])
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


@router.post("/calculate-bill", dependencies=[Depends(require_permission("pos.access"))])
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


@router.get("/session/open", dependencies=[Depends(require_permission("pos.access"))])
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


@router.post("/session/close", dependencies=[Depends(require_permission("pos.access"))])
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


@router.post("/hold-sale", dependencies=[Depends(require_permission("pos.access"))])
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
                is_custom = item.get("is_custom", False)

                if is_custom or not product_id:
                    # Custom item / service — no product lookup
                    product_code = 'CUSTOM'
                    product_name = item.get("product_name") or 'Custom Item'
                    cost_price = 0
                    unit_price = item.get("unit_price", 0)
                    line_total = item.get("total_price", unit_price * quantity)
                    line_profit = line_total

                    cur.execute("""
                        INSERT INTO sale_items (
                            sale_id, product_id, product_code, product_name,
                            quantity, unit_price, cost_price,
                            line_total, line_profit, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        sale_id, None, product_code, product_name,
                        quantity, unit_price, cost_price,
                        line_total, line_profit,
                        datetime.datetime.now().isoformat(sep=' ')
                    ))
                    continue

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
            
            # NOTE: Customer credit balance is NOT updated for held sales.
            # The balance is only updated when the held sale is resumed and
            # completed via /pos/transaction. Updating here would double-charge.
        
        return {
            "success": True,
            "message": "Sale held successfully",
            "sale_id": sale_id,
            "invoice_number": invoice_number
        }
    except Exception as e:
        logger.error(f"Failed to hold sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/held-sales", dependencies=[Depends(require_permission("pos.access"))])
async def get_held_sales(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all held sales for the current user."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            user_role = current_user.get("role", "")
            if user_role in ("malik", "munshi"):
                # Managers see all held sales
                cur.execute(
                    "SELECT * FROM sales WHERE sale_status = 'hold' ORDER BY created_at DESC"
                )
            else:
                # Cashiers only see their own held sales
                cur.execute(
                    "SELECT * FROM sales WHERE sale_status = 'hold' "
                    "AND cashier_id = ? ORDER BY created_at DESC",
                    (current_user["id"],)
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


@router.post("/resume-sale/{sale_id}", dependencies=[Depends(require_permission("pos.access"))])
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


@router.delete("/held-sale/{sale_id}", dependencies=[Depends(require_permission("pos.access"))])
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
