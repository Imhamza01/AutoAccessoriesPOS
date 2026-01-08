"""
SALES MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/sales", tags=["sales"])
logger = logging.getLogger(__name__)


@router.get("/", dependencies=[Depends(require_permission("sales.view"))])
async def list_sales(
    skip: int = Query(0),
    limit: int = Query(50),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all sales transactions with filtering."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT * FROM sales WHERE 1=1"
            params = []
            
            if start_date:
                query += " AND DATE(created_at) >= ?"
                params.append(start_date)
            
            if end_date:
                query += " AND DATE(created_at) <= ?"
                params.append(end_date)
            
            if customer_id:
                query += " AND customer_id = ?"
                params.append(customer_id)
            
            if status:
                query += " AND sale_status = ?"
                params.append(status)
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            # Fetch all results safely
            raw_sales = cur.fetchall()
            # Convert to list of dictionaries to avoid unpacking issues
            sales = []
            for row in raw_sales:
                if hasattr(row, 'keys'):  # sqlite3.Row object
                    sales.append(dict(row))
                else:
                    sales.append(row)
            
            # Get total
            count_query = "SELECT COUNT(*) FROM sales WHERE 1=1"
            count_params = []
            if start_date:
                count_query += " AND DATE(created_at) >= ?"
                count_params.append(start_date)
            if end_date:
                count_query += " AND DATE(created_at) <= ?"
                count_params.append(end_date)
            if customer_id:
                count_query += " AND customer_id = ?"
                count_params.append(customer_id)
            if status:
                count_query += " AND sale_status = ?"
                count_params.append(status)
            
            cur.execute(count_query, count_params)
            total_result = cur.fetchone()
            
            # Handle Row object properly
            if total_result:
                if hasattr(total_result, 'keys'):
                    # It's a Row object, access by key
                    # The column name for COUNT(*) might be different depending on SQLite version
                    total_dict = dict(total_result)
                    # Try different possible column names for COUNT(*)
                    total = (total_dict.get('COUNT(*)') or 
                            total_dict.get('COUNT(*) AS "COUNT(*)"') or 
                            total_dict.get('count(*)') or 
                            total_dict.get('total') or 
                            total_dict.get('0') or  # fallback to index if converted
                            0)
                else:
                    # It's a tuple, access by index
                    total = total_result[0] if len(total_result) > 0 else 0
            else:
                total = 0
        
        return {
            "success": True,
            "sales": sales,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Failed to list sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sale_id}", dependencies=[Depends(require_permission("sales.view"))])
async def get_sale(
    sale_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sale details with items and GST breakdown."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get sale
            cur.execute(
                "SELECT * FROM sales WHERE id = ?",
                (sale_id,)
            )
            raw_sale = cur.fetchone()
            
            if not raw_sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            # Convert to dict to avoid unpacking issues
            sale = dict(raw_sale) if hasattr(raw_sale, 'keys') else raw_sale
            
            # Get items
            cur.execute(
                "SELECT * FROM sale_items WHERE sale_id = ?",
                (sale_id,)
            )
            raw_items = cur.fetchall()
            items = []
            for item in raw_items:
                if hasattr(item, 'keys'):
                    items.append(dict(item))
                else:
                    items.append(item)
            
            # Get GST info
            cur.execute(
                "SELECT * FROM gst_invoices WHERE sale_id = ?",
                (sale_id,)
            )
            raw_gst_invoice = cur.fetchone()
            gst_invoice = dict(raw_gst_invoice) if raw_gst_invoice and hasattr(raw_gst_invoice, 'keys') else raw_gst_invoice
            
            # Get payments
            cur.execute(
                "SELECT * FROM sale_payments WHERE sale_id = ?",
                (sale_id,)
            )
            raw_payments = cur.fetchall()
            payments = []
            for payment in raw_payments:
                if hasattr(payment, 'keys'):
                    payments.append(dict(payment))
                else:
                    payments.append(payment)
        
        return {
            "success": True,
            "sale": sale,
            "items": items or [],
            "gst_invoice": gst_invoice,
            "payments": payments or []
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", dependencies=[Depends(require_permission("sales.manage"))])
async def create_sale(
    sale_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create new sale transaction."""
    try:
        db = get_database_manager()
        
        with db.get_cursor() as cur:
            # Generate invoice number based on current timestamp to ensure uniqueness
            invoice_number = f"SAL-{datetime.datetime.now().strftime('%Y%m%d')}{int(datetime.datetime.now().timestamp() * 1000) % 100000}"
            
            # Get cashier name from current user
            cashier_name = current_user.get("name") or current_user.get("username") or f"User {current_user['id']}"
            
            # Create sale
            cur.execute("""
                INSERT INTO sales (
                    invoice_number, customer_id, grand_total, subtotal, discount_amount, 
                    gst_amount, payment_method, payment_status, notes,
                    cashier_id, cashier_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                invoice_number,
                sale_data.get("customer_id"),
                sale_data.get("total_amount", 0),
                sale_data.get("subtotal", 0),
                sale_data.get("discount_amount", 0),
                sale_data.get("gst_amount", 0),
                sale_data.get("payment_type", "cash"),
                sale_data.get("payment_status", "paid"),  # Changed from 'completed' to 'paid' to match CHECK constraint
                sale_data.get("notes"),
                current_user["id"],
                cashier_name,
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
            
            sale_id = cur.lastrowid
            
            # Add items
            for item in sale_data.get("items", []):
                cur.execute("""
                    INSERT INTO sale_items (
                        sale_id, product_id, quantity, unit_price, 
                        total_price, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    sale_id,
                    item.get("product_id"),
                    item.get("quantity"),
                    item.get("unit_price"),
                    item.get("total_price"),
                    datetime.datetime.now().isoformat(),
                    datetime.datetime.now().isoformat()
                ))
        
        return {
            "success": True,
            "message": "Sale created successfully",
            "sale_id": sale_id
        }
    except Exception as e:
        logger.error(f"Failed to create sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sale_id}/return", dependencies=[Depends(require_permission("sales.manage"))])
async def return_sale(
    sale_id: int,
    return_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Process sale return (credit memo)."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get original sale
            cur.execute("SELECT * FROM sales WHERE id = ?", (sale_id,))
            original_sale = cur.fetchone()
            
            if not original_sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            # Handle Row object properly
            if hasattr(original_sale, 'keys'):
                original_sale_dict = dict(original_sale)
                customer_id = original_sale_dict.get('customer_id')
            else:
                customer_id = original_sale[1] if len(original_sale) > 1 else None
            
            # Create return sale
            cur.execute("""
                INSERT INTO sales (
                    customer_id, total_amount, subtotal, discount_amount,
                    gst_amount, payment_type, payment_status, notes,
                    created_by, created_at, updated_at, is_return, return_of_sale_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                customer_id,  # customer_id
                -return_data.get("total_amount", 0),
                -return_data.get("subtotal", 0),
                -return_data.get("discount_amount", 0),
                -return_data.get("gst_amount", 0),
                "return",
                "completed",
                return_data.get("reason"),
                current_user["id"],
                datetime.datetime.now().isoformat(sep=' '),
                datetime.datetime.now().isoformat(sep=' '),
                True,
                sale_id
            ))
        
        return {
            "success": True,
            "message": "Return processed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process return: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sale_id}/reprint", dependencies=[Depends(require_permission("sales.view"))])
async def reprint_receipt(
    sale_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sale data for receipt reprint."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("SELECT * FROM sales WHERE id = ?", (sale_id,))
            raw_sale = cur.fetchone()
            
            if not raw_sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            # Handle Row object properly
            if hasattr(raw_sale, 'keys'):
                sale = dict(raw_sale)
            else:
                sale = raw_sale
            
            cur.execute("SELECT * FROM sale_items WHERE sale_id = ?", (sale_id,))
            raw_items = cur.fetchall()
            # Convert items to dictionaries to avoid Row object issues
            items = []
            for item in raw_items:
                if hasattr(item, 'keys'):  # sqlite3.Row object
                    items.append(dict(item))
                else:
                    items.append(item)
        
        return {
            "success": True,
            "receipt_data": {
                "sale": sale,
                "items": items
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get reprint data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/daily-summary", dependencies=[Depends(require_permission("sales.view"))])
async def daily_summary(
    date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get daily sales summary and metrics."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            target_date = date or datetime.datetime.now().strftime("%Y-%m-%d")
            
            # Daily totals
            cur.execute("""
                SELECT 
                    COUNT(*) as total_sales,
                    COALESCE(SUM(grand_total), 0) as total_revenue,
                    COALESCE(SUM(gst_amount), 0) as total_gst,
                    COALESCE(AVG(grand_total), 0) as avg_transaction
                FROM sales
                WHERE DATE(created_at) = ?
            """, (target_date,))
            result = cur.fetchone()
            
            # Handle potential unpacking issues
            if result and hasattr(result, '__getitem__'):
                # If it's a Row object, convert to dictionary
                if hasattr(result, 'keys'):
                    result_dict = dict(result)
                    summary = (
                        result_dict.get('total_sales', 0) or 0,
                        result_dict.get('total_revenue', 0) or 0,
                        result_dict.get('total_gst', 0) or 0,
                        result_dict.get('avg_transaction', 0) or 0
                    )
                else:
                    # Handle tuple format
                    summary = tuple([
                        (val if val is not None else 0) for val in result
                    ])
            else:
                summary = (0, 0, 0, 0)
            
            # Sales by payment type
            cur.execute("""
                SELECT payment_type, COUNT(*), SUM(grand_total)
                FROM sales
                WHERE DATE(created_at) = ?
                GROUP BY payment_type
            """, (target_date,))
            raw_by_payment = cur.fetchall()
            by_payment = []
            for row in raw_by_payment:
                if hasattr(row, 'keys'):  # Row object
                    by_payment.append(tuple(dict(row).values()))
                else:
                    by_payment.append(row)
            # Ensure we have proper data structure even if no results
            if not by_payment:
                by_payment = []
        
        return {
            "success": True,
            "date": target_date,
            "summary": {
                "total_sales": summary[0] if summary and len(summary) > 0 else 0,
                "total_revenue": summary[1] if summary and len(summary) > 1 else 0,
                "total_gst": summary[2] if summary and len(summary) > 2 else 0,
                "avg_transaction": summary[3] if summary and len(summary) > 3 else 0
            },
            "by_payment_type": [
                {
                    "payment_type": p[0] if len(p) > 0 else None,
                    "count": p[1] if len(p) > 1 else 0,
                    "amount": p[2] if len(p) > 2 else 0
                }
                for p in by_payment
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get daily summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
