"""
CUSTOMER PAYMENT API ENDPOINTS
Handles customer credit payments and related functionality
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/customer-payments", tags=["customer-payments"])
logger = logging.getLogger(__name__)


@router.post("/{customer_id}/payments", dependencies=[Depends(require_permission("customers.manage"))])
async def process_customer_payment(
    customer_id: int,
    payment_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Process credit payment for customer to reduce their outstanding balance."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Verify customer exists
            cur.execute("SELECT id, current_balance FROM customers WHERE id = ?", (customer_id,))
            customer_row = cur.fetchone()
            if not customer_row:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            customer = dict(customer_row) if hasattr(customer_row, "keys") else {"id": customer_row[0], "current_balance": customer_row[1]}
            
            # Validate payment data
            amount = payment_data.get("amount")
            if not amount or float(amount) <= 0:
                raise HTTPException(status_code=400, detail="Invalid payment amount")
            
            payment_method = payment_data.get("payment_method", "cash")
            payment_type = payment_data.get("payment_type", "credit_payment")
            notes = payment_data.get("notes", f"Credit payment received")
            
            # Check if this is for specific sale IDs
            sale_ids = payment_data.get("sale_ids", [])
            
            if sale_ids:
                # Process payment for specific sales
                return await _process_specific_sales_payment(cur, customer_id, customer, sale_ids, payment_method, notes, current_user)
            else:
                # Process general payment against outstanding balance
                return await _process_general_payment(cur, customer_id, customer, float(amount), payment_method, payment_type, notes, current_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process credit payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _process_general_payment(cur, customer_id: int, customer: Dict[str, Any], payment_amount: float, 
                                  payment_method: str, payment_type: str, notes: str, current_user: Dict[str, Any]):
    """Process a general payment against the customer's outstanding balance."""
    current_balance = float(customer["current_balance"] or 0)
    
    if payment_amount > current_balance:
        raise HTTPException(status_code=400, detail=f"Payment amount exceeds outstanding balance of {current_balance}")
    
    # First, get pending or partial sales ordered by date (oldest first) to apply payment
    cur.execute("""
        SELECT id, grand_total, balance_due, payment_status
        FROM sales 
        WHERE customer_id = ? AND payment_status IN ('pending', 'partial')
        ORDER BY created_at ASC
    """, (customer_id,))
    pending_sales = cur.fetchall()

    pending_sales_list = [dict(sale) if hasattr(sale, 'keys') else {'id': sale[0], 'grand_total': sale[1], 'balance_due': sale[2], 'payment_status': sale[3]} for sale in pending_sales]

    # Apply payment to pending/partial sales (oldest first)
    remaining_payment = payment_amount
    paid_sales = []
    updated_sales = []

    for sale in pending_sales_list:
        if remaining_payment <= 0:
            break

        sale_balance = float(sale.get('balance_due', 0) or sale.get('grand_total', 0))
        amount_to_apply = min(remaining_payment, sale_balance)

        new_balance = round(sale_balance - amount_to_apply, 2)
        new_status = 'paid' if new_balance <= 0 else 'partial'

        # Update the sale
        cur.execute("""
            UPDATE sales 
            SET balance_due = ?, payment_status = ?, updated_at = ?
            WHERE id = ?
        """, (new_balance, new_status, datetime.datetime.now().isoformat(), sale['id']))

        remaining_payment -= amount_to_apply

        if new_status == 'paid':
            paid_sales.append(sale['id'])

        updated_sales.append({
            'sale_id': sale['id'],
            'amount_applied': amount_to_apply,
            'new_balance': new_balance,
            'new_status': new_status
        })

    # Update customer's current balance (reduce it)
    new_balance = round(float(current_balance) - payment_amount, 2)
    if new_balance < 0:
        new_balance = 0.0

    cur.execute("""
        UPDATE customers 
        SET current_balance = ?, updated_at = ?
        WHERE id = ?
    """, (new_balance, datetime.datetime.now().isoformat(), customer_id))

    # Record the payment transaction
    cur.execute("""
        INSERT INTO customer_payments (
            customer_id, amount, payment_method, payment_type, notes,
            received_by, payment_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        customer_id,
        payment_amount,
        payment_method,
        payment_type,
        notes,
        current_user["id"],
        datetime.datetime.now().date().isoformat(),
        datetime.datetime.now().isoformat(),
        datetime.datetime.now().isoformat()
    ))

    payment_id = cur.lastrowid

    # If sale_payments table exists, record allocations for auditability
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sale_payments'")
    if cur.fetchone():
        for us in updated_sales:
            try:
                cur.execute("""
                    INSERT INTO sale_payments (sale_id, customer_payment_id, amount, created_at)
                    VALUES (?, ?, ?, ?)
                """, (us['sale_id'], payment_id, us['amount_applied'], datetime.datetime.now().isoformat()))
            except Exception:
                # If insertion fails for any reason, continue; we still updated balances
                logger.exception('Failed to insert sale_payments allocation')

    return {
        "success": True,
        "message": f"Credit payment of {payment_amount} processed successfully",
        "new_balance": new_balance,
        "paid_sales": paid_sales,
        "updated_sales": updated_sales,
        "payment_id": payment_id
    }


async def _process_specific_sales_payment(cur, customer_id: int, customer: Dict[str, Any], sale_ids: List[int], 
                                         payment_method: str, notes: str, current_user: Dict[str, Any]):
    """Process a payment specifically for certain sales."""
    total_payment = 0.0
    
    # Get details of the specific sales to pay
    placeholders = ','.join(['?' for _ in sale_ids])
    cur.execute(f"""
        SELECT id, grand_total, payment_status, balance_due 
        FROM sales 
        WHERE id IN ({placeholders}) AND customer_id = ?
    """, (*sale_ids, customer_id))
    
    sales = cur.fetchall()
    sales_list = [dict(sale) if hasattr(sale, 'keys') else {'id': sale[0], 'grand_total': sale[1], 'payment_status': sale[2], 'balance_due': sale[3]} for sale in sales]
    
    if len(sales_list) != len(sale_ids):
        raise HTTPException(status_code=400, detail="One or more sales not found or do not belong to this customer")
    
    # Calculate total amount for these sales
    for sale in sales_list:
        if sale['payment_status'] == 'paid':
            raise HTTPException(status_code=400, detail=f"Sale {sale['id']} is already paid")
        
        # Use balance_due if available, otherwise use grand_total
        amount_to_pay = sale.get('balance_due', 0) or sale.get('grand_total', 0)
        total_payment += amount_to_pay
    
    # Check if customer has sufficient outstanding balance
    current_balance = float(customer["current_balance"] or 0)
    if total_payment > current_balance:
        raise HTTPException(status_code=400, detail=f"Total payment amount ({total_payment}) exceeds outstanding balance of {current_balance}")
    
    # Update each sale's balance/status and track allocations
    updated_sales = []
    for sale in sales_list:
        sale_balance = float(sale.get('balance_due', 0) or sale.get('grand_total', 0))
        amount_applied = sale_balance

        new_balance = 0.0
        new_status = 'paid'

        cur.execute("""
            UPDATE sales 
            SET payment_status = ?, balance_due = ?, updated_at = ?
            WHERE id = ?
        """, (new_status, new_balance, datetime.datetime.now().isoformat(), sale['id']))

        updated_sales.append({
            'sale_id': sale['id'],
            'amount_applied': amount_applied,
            'new_balance': new_balance,
            'new_status': new_status
        })

    # Reduce customer's current balance
    new_balance = round(current_balance - total_payment, 2)
    if new_balance < 0:
        new_balance = 0.0

    cur.execute("""
        UPDATE customers 
        SET current_balance = ?, updated_at = ?
        WHERE id = ?
    """, (new_balance, datetime.datetime.now().isoformat(), customer_id))

    # Record the payment transaction
    cur.execute("""
        INSERT INTO customer_payments (
            customer_id, amount, payment_method, payment_type, notes,
            received_by, payment_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        customer_id,
        total_payment,
        payment_method,
        'specific_sales_payment',  # Different type for specific sales
        f"{notes} - Payment for sales: {', '.join(map(str, sale_ids))}",
        current_user["id"],
        datetime.datetime.now().date().isoformat(),
        datetime.datetime.now().isoformat(),
        datetime.datetime.now().isoformat()
    ))

    payment_id = cur.lastrowid

    # If sale_payments table exists, record allocations
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sale_payments'")
    if cur.fetchone():
        for us in updated_sales:
            try:
                cur.execute("""
                    INSERT INTO sale_payments (sale_id, customer_payment_id, amount, created_at)
                    VALUES (?, ?, ?, ?)
                """, (us['sale_id'], payment_id, us['amount_applied'], datetime.datetime.now().isoformat()))
            except Exception:
                logger.exception('Failed to insert sale_payments allocation')

    return {
        "success": True,
        "message": f"Payment of {total_payment} processed for {len(sale_ids)} specific sales",
        "new_balance": new_balance,
        "payment_id": payment_id,
        "paid_sales": sale_ids,
        "updated_sales": updated_sales
    }


@router.get("/{customer_id}/pending-credits", dependencies=[Depends(require_permission("customers.view"))])
async def get_pending_credits(
    customer_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all pending credit sales for a customer."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get pending credit sales for the customer
            cur.execute("""
                SELECT id, invoice_number, grand_total, balance_due, created_at, payment_status
                FROM sales
                WHERE customer_id = ? AND payment_status = 'pending'
                ORDER BY created_at DESC
            """, (customer_id,))
            
            raw_sales = cur.fetchall()
            sales = [dict(sale) if hasattr(sale, 'keys') else {'id': sale[0], 'invoice_number': sale[1], 'grand_total': sale[2], 'balance_due': sale[3], 'created_at': sale[4], 'payment_status': sale[5]} for sale in raw_sales]
        
        return {
            "success": True,
            "pending_credits": sales
        }
    except Exception as e:
        logger.error(f"Failed to get pending credits: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{customer_id}/payments", dependencies=[Depends(require_permission("customers.view"))])
async def get_customer_payments(
    customer_id: int,
    skip: int = Query(0),
    limit: int = Query(50),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get payment history for a customer."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT cp.*, u.username as received_by_name
                FROM customer_payments cp
                LEFT JOIN users u ON cp.received_by = u.id
                WHERE cp.customer_id = ?
                ORDER BY cp.payment_date DESC, cp.created_at DESC
                LIMIT ? OFFSET ?
            """, (customer_id, limit, skip))
            
            raw_payments = cur.fetchall()
            payments = []
            for row in raw_payments:
                if hasattr(row, 'keys'):
                    payments.append(dict(row))
                else:
                    payments.append(row)
            
            # Get total count
            cur.execute("SELECT COUNT(*) FROM customer_payments WHERE customer_id = ?", (customer_id,))
            total_result = cur.fetchone()
            total = total_result[0] if total_result else 0
        
        return {
            "success": True,
            "payments": payments,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Failed to get customer payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reconcile/customers", dependencies=[Depends(require_permission("customers.manage"))])
async def reconcile_customer_balances(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Reconcile all customer balances by recalculating from sales data."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get all customers
            cur.execute("SELECT id, full_name FROM customers")
            customers = cur.fetchall()
            
            updated_count = 0
            
            for customer_row in customers:
                customer_id = customer_row[0] if not hasattr(customer_row, 'keys') else customer_row['id']
                customer_name = customer_row[1] if not hasattr(customer_row, 'keys') else customer_row['full_name']
                
                # Calculate total outstanding from sales
                cur.execute("""
                    SELECT SUM(balance_due) 
                    FROM sales 
                    WHERE customer_id = ? AND payment_status IN ('pending', 'partial')
                """, (customer_id,))
                
                balance_result = cur.fetchone()
                calculated_balance = float(balance_result[0]) if balance_result and balance_result[0] is not None else 0.0
                
                # Get current balance
                cur.execute("SELECT current_balance FROM customers WHERE id = ?", (customer_id,))
                current_result = cur.fetchone()
                current_balance = float(current_result[0]) if current_result and current_result[0] is not None else 0.0
                
                # Update if different
                if abs(calculated_balance - current_balance) > 0.01:  # Allow for small floating point differences
                    cur.execute("""
                        UPDATE customers 
                        SET current_balance = ?, updated_at = ?
                        WHERE id = ?
                    """, (calculated_balance, datetime.datetime.now().isoformat(), customer_id))
                    updated_count += 1
            
            return {
                "success": True,
                "message": f"Reconciled {updated_count} customers",
                "updated": updated_count
            }
    except Exception as e:
        logger.error(f"Failed to reconcile customer balances: {e}")
        raise HTTPException(status_code=500, detail=str(e))
