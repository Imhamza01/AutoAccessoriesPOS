"""
SALES MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission, auth_manager
from core.database import get_database_manager
from fastapi import Query

# Create role-based authorization middleware
sales_auth = auth_manager.create_authorization_middleware(["malik", "munshi", "shop_boy"])

router = APIRouter(prefix="/sales", tags=["sales"])
logger = logging.getLogger(__name__)


@router.get("/", dependencies=[Depends(require_permission("sales.view")), Depends(sales_auth)])
async def list_sales(
    skip: int = Query(0),
    limit: int = Query(50),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    customer_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales transactions with role-based filtering."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Base query
            query = "SELECT * FROM sales WHERE sale_status != 'cancelled'"
            params = []
            count_params = []
            
            # Role-based filtering - cashiers only see their own sales
            if current_user["role"] == "shop_boy":
                query += " AND cashier_id = ?"
                params.append(current_user["id"])
                count_params.append(current_user["id"])
            
            # Date filtering
            if start_date:
                query += " AND DATE(created_at) >= ?"
                params.append(start_date)
                count_params.append(start_date)
            
            if end_date:
                query += " AND DATE(created_at) <= ?"
                params.append(end_date)
                count_params.append(end_date)
            
            # Other filters
            if customer_id:
                query += " AND customer_id = ?"
                params.append(customer_id)
                count_params.append(customer_id)
            
            if status:
                query += " AND sale_status = ?"
                params.append(status)
                count_params.append(status)
            
            # Add ordering and pagination
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            raw_sales = cur.fetchall()
            
            # Convert to list of dictionaries
            sales = []
            for row in raw_sales:
                if hasattr(row, 'keys'):
                    sales.append(dict(row))
                else:
                    sales.append(row)
            
            # Get total count with same filters
            count_query = "SELECT COUNT(*) FROM sales WHERE sale_status != 'cancelled'"
            
            # Apply same role-based filtering to count query
            if current_user["role"] == "shop_boy":
                count_query += " AND cashier_id = ?"
            
            # Apply other filters to count query
            if start_date:
                count_query += " AND DATE(created_at) >= ?"
            if end_date:
                count_query += " AND DATE(created_at) <= ?"
            if customer_id:
                count_query += " AND customer_id = ?"
            if status:
                count_query += " AND sale_status = ?"
            
            cur.execute(count_query, count_params)
            total_result = cur.fetchone()
            
            # Handle Row object properly
            if total_result:
                if hasattr(total_result, 'keys'):
                    total = dict(total_result)['COUNT(*)']
                else:
                    total = total_result[0] if isinstance(total_result, (list, tuple)) else total_result
            else:
                total = 0
            
            return {
                "success": True,
                "sales": sales,
                "total": total,
                "page": skip // limit + 1,
                "pages": (total + limit - 1) // limit
            }
            
    except Exception as e:
        logger.error(f"Error listing sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sale_id}", dependencies=[Depends(require_permission("sales.view"))])
async def get_sale(
    sale_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get specific sale by ID with role-based access."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # For cashiers, verify they created this sale
            if current_user["role"] == "shop_boy":
                cur.execute(
                    "SELECT * FROM sales WHERE id = ? AND cashier_id = ? AND sale_status != 'cancelled'",
                    (sale_id, current_user["id"])
                )
            else:
                cur.execute(
                    "SELECT * FROM sales WHERE id = ? AND sale_status != 'cancelled'",
                    (sale_id,)
                )
            
            sale = cur.fetchone()
            if not sale:
                raise HTTPException(status_code=404, detail="Sale not found")
            
            # Convert to dictionary
            if hasattr(sale, 'keys'):
                sale_dict = dict(sale)
            else:
                # Handle tuple result - need column names
                columns = [desc[0] for desc in cur.description]
                sale_dict = dict(zip(columns, sale))
            
            # Get sale items
            cur.execute(
                "SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id",
                (sale_id,)
            )
            items = cur.fetchall()
            
            # Convert items to dictionaries
            sale_items = []
            for item in items:
                if hasattr(item, 'keys'):
                    sale_items.append(dict(item))
                else:
                    sale_items.append(item)
            
            sale_dict["items"] = sale_items
            
            return {"success": True, "sale": sale_dict}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", dependencies=[Depends(require_permission("sales.create"))])
async def create_sale(
    sale_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create new sale transaction."""
    try:
        # Validate required fields
        if not sale_data.get("items"):
            raise HTTPException(status_code=400, detail="Sale items required")
        
        db = get_database_manager()
        with db.get_transaction() as conn:
            cur = conn.cursor()
            
            # Insert sale record
            cur.execute('''
                INSERT INTO sales (
                    invoice_number, invoice_date, customer_id,
                    subtotal, discount_amount, tax_amount, shipping_charge,
                    round_off, grand_total, amount_paid, balance_due,
                    payment_method, payment_status, sale_type, sale_status,
                    cashier_id, cashier_name, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                sale_data.get("invoice_number") or f"POS-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}",
                sale_data.get("invoice_date") or datetime.datetime.now().isoformat(),
                sale_data.get("customer_id"),
                sale_data.get("subtotal", 0),
                sale_data.get("discount_amount", 0),
                sale_data.get("tax_amount", 0),
                sale_data.get("shipping_charge", 0),
                sale_data.get("round_off", 0),
                sale_data.get("grand_total", 0),
                sale_data.get("amount_paid", 0),
                sale_data.get("balance_due", 0),
                sale_data.get("payment_method", "cash"),
                sale_data.get("payment_status", "paid"),
                sale_data.get("sale_type", "retail"),
                sale_data.get("sale_status", "completed"),
                current_user["id"],
                current_user["full_name"],
                sale_data.get("notes", ""),
                datetime.datetime.now().isoformat()
            ))
            
            sale_id = cur.lastrowid
            
            # Insert sale items
            for item in sale_data["items"]:
                cur.execute('''
                    INSERT INTO sale_items (
                        sale_id, product_id, variant_id, product_code,
                        product_name, barcode, quantity, unit_price,
                        cost_price, discount_amount, tax_rate, tax_amount,
                        total_amount, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    sale_id,
                    item.get("product_id"),
                    item.get("variant_id"),
                    item.get("product_code"),
                    item.get("product_name"),
                    item.get("barcode"),
                    item.get("quantity", 1),
                    item.get("unit_price", 0),
                    item.get("cost_price", 0),
                    item.get("discount_amount", 0),
                    item.get("tax_rate", 0),
                    item.get("tax_amount", 0),
                    item.get("total_amount", 0),
                    datetime.datetime.now().isoformat()
                ))
                
                # Update product stock
                if item.get("product_id"):
                    cur.execute('''
                        UPDATE products 
                        SET current_stock = current_stock - ?,
                            last_stock_update = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (item.get("quantity", 1), item.get("product_id")))
            
            # Update customer balance if credit sale
            if sale_data.get("payment_status") == "pending" and sale_data.get("customer_id"):
                cur.execute('''
                    UPDATE customers 
                    SET current_balance = current_balance + ?,
                        last_purchase_date = DATE('now')
                    WHERE id = ?
                ''', (sale_data.get("balance_due", 0), sale_data.get("customer_id")))
            
            conn.commit()
            
            return {
                "success": True,
                "message": "Sale created successfully",
                "sale_id": sale_id,
                "invoice_number": sale_data.get("invoice_number") or f"POS-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating sale: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check for sales service."""
    return {
        "status": "healthy",
        "service": "sales",
        "timestamp": datetime.datetime.now().isoformat()
    }