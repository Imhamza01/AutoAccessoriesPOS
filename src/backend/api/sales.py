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
            query = "SELECT * FROM sales WHERE deleted_at IS NULL"
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            if customer_id:
                query += " AND customer_id = ?"
                params.append(customer_id)
            
            if status:
                query += " AND status = ?"
                params.append(status)
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            sales = cur.fetchall()
            
            # Get total
            count_query = "SELECT COUNT(*) FROM sales WHERE deleted_at IS NULL"
            count_params = []
            if start_date:
                count_query += " AND created_at >= ?"
                count_params.append(start_date)
            if end_date:
                count_query += " AND created_at <= ?"
                count_params.append(end_date)
            if customer_id:
                count_query += " AND customer_id = ?"
                count_params.append(customer_id)
            if status:
                count_query += " AND status = ?"
                count_params.append(status)
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()[0]
        
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
                "SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL",
                (sale_id,)
            )
            sale = cur.fetchone()
            
            if not sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            # Get items
            cur.execute(
                "SELECT * FROM sale_items WHERE sale_id = ? AND deleted_at IS NULL",
                (sale_id,)
            )
            items = cur.fetchall()
            
            # Get GST info
            cur.execute(
                "SELECT * FROM gst_invoices WHERE sale_id = ?",
                (sale_id,)
            )
            gst_invoice = cur.fetchone()
            
            # Get payments
            cur.execute(
                "SELECT * FROM sale_payments WHERE sale_id = ? AND deleted_at IS NULL",
                (sale_id,)
            )
            payments = cur.fetchall()
        
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
            # Create sale
            cur.execute("""
                INSERT INTO sales (
                    customer_id, total_amount, subtotal, discount_amount, 
                    gst_amount, payment_type, payment_status, notes,
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sale_data.get("customer_id"),
                sale_data.get("total_amount", 0),
                sale_data.get("subtotal", 0),
                sale_data.get("discount_amount", 0),
                sale_data.get("gst_amount", 0),
                sale_data.get("payment_type", "cash"),
                sale_data.get("payment_status", "completed"),
                sale_data.get("notes"),
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
            
            sale_id = db.get_last_insert_id()
            
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
            cur.execute("SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL", (sale_id,))
            original_sale = cur.fetchone()
            
            if not original_sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            # Create return sale
            cur.execute("""
                INSERT INTO sales (
                    customer_id, total_amount, subtotal, discount_amount,
                    gst_amount, payment_type, payment_status, notes,
                    created_by, created_at, updated_at, is_return, return_of_sale_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                original_sale[1],  # customer_id
                -return_data.get("total_amount", 0),
                -return_data.get("subtotal", 0),
                -return_data.get("discount_amount", 0),
                -return_data.get("gst_amount", 0),
                "return",
                "completed",
                return_data.get("reason"),
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat(),
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
            cur.execute("SELECT * FROM sales WHERE id = ? AND deleted_at IS NULL", (sale_id,))
            sale = cur.fetchone()
            
            if not sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            cur.execute("SELECT * FROM sale_items WHERE sale_id = ?", (sale_id,))
            items = cur.fetchall()
        
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
                    SUM(total_amount) as total_revenue,
                    SUM(gst_amount) as total_gst,
                    AVG(total_amount) as avg_transaction
                FROM sales
                WHERE DATE(created_at) = ? AND deleted_at IS NULL
            """, (target_date,))
            summary = cur.fetchone()
            
            # Sales by payment type
            cur.execute("""
                SELECT payment_type, COUNT(*), SUM(total_amount)
                FROM sales
                WHERE DATE(created_at) = ? AND deleted_at IS NULL
                GROUP BY payment_type
            """, (target_date,))
            by_payment = cur.fetchall()
        
        return {
            "success": True,
            "date": target_date,
            "summary": {
                "total_sales": summary[0] or 0,
                "total_revenue": summary[1] or 0,
                "total_gst": summary[2] or 0,
                "avg_transaction": summary[3] or 0
            },
            "by_payment_type": [
                {
                    "payment_type": p[0],
                    "count": p[1],
                    "amount": p[2]
                }
                for p in by_payment
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get daily summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
