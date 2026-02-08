"""
MODERN CREDIT MANAGEMENT API ENDPOINTS
Comprehensive credit management system with proper tracking and reporting
"""
import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/credit-management", tags=["credit-management"])
logger = logging.getLogger(__name__)


@router.get("/customers-with-credit", dependencies=[Depends(require_permission("customers.view"))])
async def get_customers_with_credit(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all customers with outstanding credit balances."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get customers with outstanding credit (positive current_balance means customer owes us)
            query = """
                SELECT c.id, c.full_name, c.phone, c.email, c.credit_limit, c.current_balance,
                       c.is_credit_allowed, c.credit_days,
                       (SELECT COUNT(*) FROM sales WHERE customer_id = c.id AND payment_status = 'pending') as pending_sales_count,
                       (SELECT SUM(balance_due) FROM sales WHERE customer_id = c.id AND payment_status = 'pending') as total_pending_amount
                FROM customers c
                WHERE c.current_balance > 0 OR EXISTS(SELECT 1 FROM sales WHERE customer_id = c.id AND payment_status = 'pending')
                ORDER BY c.current_balance DESC, c.full_name ASC
            """
            
            cur.execute(query)
            raw_customers = cur.fetchall()
            customers = []
            for row in raw_customers:
                if hasattr(row, 'keys'):
                    customers.append(dict(row))
                else:
                    customers.append({
                        'id': row[0], 'full_name': row[1], 'phone': row[2], 'email': row[3],
                        'credit_limit': row[4], 'current_balance': row[5], 'is_credit_allowed': row[6],
                        'credit_days': row[7], 'pending_sales_count': row[8], 'total_pending_amount': row[9]
                    })
        
        return {
            "success": True,
            "customers": customers,
            "total_customers": len(customers)
        }
    except Exception as e:
        logger.error(f"Failed to get customers with credit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customer/{customer_id}/credit-history", dependencies=[Depends(require_permission("customers.view"))])
async def get_customer_credit_history(
    customer_id: int,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get comprehensive credit history for a customer including sales and payments."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get customer details
            cur.execute("SELECT id, full_name, current_balance FROM customers WHERE id = ?", (customer_id,))
            customer = cur.fetchone()
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            customer_dict = dict(customer) if hasattr(customer, 'keys') else {
                'id': customer[0], 'full_name': customer[1], 'current_balance': customer[2]
            }
            
            # Get all sales for this customer
            sales_query = """
                SELECT id, invoice_number, created_at, grand_total, balance_due, payment_status
                FROM sales
                WHERE customer_id = ?
            """
            sales_params = [customer_id]
            
            if start_date:
                sales_query += " AND DATE(created_at) >= ?"
                sales_params.append(start_date)
            if end_date:
                sales_query += " AND DATE(created_at) <= ?"
                sales_params.append(end_date)
            
            sales_query += " ORDER BY created_at DESC"
            
            cur.execute(sales_query, sales_params)
            raw_sales = cur.fetchall()
            sales = []
            for row in raw_sales:
                if hasattr(row, 'keys'):
                    sales.append(dict(row))
                else:
                    sales.append({
                        'id': row[0], 'invoice_number': row[1], 'created_at': row[2],
                        'grand_total': row[3], 'balance_due': row[4], 'payment_status': row[5]
                    })
            
            # Get all payments for this customer
            payments_query = """
                SELECT cp.id, cp.amount, cp.payment_method, cp.payment_type, cp.notes,
                       cp.payment_date, cp.created_at, u.username as received_by_name
                FROM customer_payments cp
                LEFT JOIN users u ON cp.received_by = u.id
                WHERE cp.customer_id = ?
            """
            payments_params = [customer_id]
            
            if start_date:
                payments_query += " AND DATE(cp.payment_date) >= ?"
                payments_params.append(start_date)
            if end_date:
                payments_query += " AND DATE(cp.payment_date) <= ?"
                payments_params.append(end_date)
            
            payments_query += " ORDER BY cp.payment_date DESC, cp.created_at DESC"
            
            cur.execute(payments_query, payments_params)
            raw_payments = cur.fetchall()
            payments = []
            for row in raw_payments:
                if hasattr(row, 'keys'):
                    payments.append(dict(row))
                else:
                    payments.append({
                        'id': row[0], 'amount': row[1], 'payment_method': row[2],
                        'payment_type': row[3], 'notes': row[4], 'payment_date': row[5],
                        'created_at': row[6], 'received_by_name': row[7]
                    })
            
            return {
                "success": True,
                "customer": customer_dict,
                "sales": sales,
                "payments": payments,
                "sales_count": len(sales),
                "payments_count": len(payments)
            }
    except Exception as e:
        logger.error(f"Failed to get customer credit history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credit-sales", dependencies=[Depends(require_permission("sales.view"))])
async def get_credit_sales(
    customer_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),  # pending, partial, paid
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all credit sales with filtering options."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT s.id, s.invoice_number, s.customer_id, c.full_name as customer_name,
                       s.created_at, s.grand_total, s.balance_due, s.payment_status,
                       s.customer_phone, s.notes
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
                WHERE s.payment_status IN ('pending', 'partial')
            """
            params = []
            
            if customer_id:
                query += " AND s.customer_id = ?"
                params.append(customer_id)
            if start_date:
                query += " AND DATE(s.created_at) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND DATE(s.created_at) <= ?"
                params.append(end_date)
            if status:
                query += " AND s.payment_status = ?"
                params.append(status)
            
            query += " ORDER BY s.created_at DESC"
            
            cur.execute(query, params)
            raw_sales = cur.fetchall()
            sales = []
            for row in raw_sales:
                if hasattr(row, 'keys'):
                    sales.append(dict(row))
                else:
                    sales.append({
                        'id': row[0], 'invoice_number': row[1], 'customer_id': row[2],
                        'customer_name': row[3], 'created_at': row[4], 'grand_total': row[5],
                        'balance_due': row[6], 'payment_status': row[7], 'customer_phone': row[8],
                        'notes': row[9]
                    })
            
            return {
                "success": True,
                "credit_sales": sales,
                "total_sales": len(sales)
            }
    except Exception as e:
        logger.error(f"Failed to get credit sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-credit-payment", dependencies=[Depends(require_permission("customers.manage"))])
async def process_comprehensive_credit_payment(
    payment_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Process credit payment with flexible options for specific sales or general payment."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            customer_id = payment_data.get('customer_id')
            if not customer_id:
                raise HTTPException(status_code=400, detail="Customer ID is required")
            
            # Verify customer exists
            cur.execute("SELECT id, current_balance, full_name FROM customers WHERE id = ?", (customer_id,))
            customer = cur.fetchone()
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            customer_dict = dict(customer) if hasattr(customer, 'keys') else {
                'id': customer[0], 'current_balance': customer[1], 'full_name': customer[2]
            }
            
            amount = payment_data.get('amount')
            if not amount or float(amount) <= 0:
                raise HTTPException(status_code=400, detail="Valid payment amount is required")
            
            payment_method = payment_data.get('payment_method', 'cash')
            notes = payment_data.get('notes', f'Credit payment received')
            
            # Check if this is for specific sales
            sale_ids = payment_data.get('sale_ids', [])
            
            if sale_ids:
                # Process payment for specific sales
                return await _process_payment_for_specific_sales(
                    cur, customer_dict, sale_ids, float(amount), payment_method, notes, current_user
                )
            else:
                # Process general payment against customer balance
                return await _process_general_credit_payment(
                    cur, customer_dict, float(amount), payment_method, notes, current_user
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process comprehensive credit payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _process_payment_for_specific_sales(cur, customer, sale_ids, payment_amount, payment_method, notes, current_user):
    """Process payment for specific sales."""
    # Get details of the specific sales to pay
    placeholders = ','.join(['?' for _ in sale_ids])
    cur.execute(f"""
        SELECT id, grand_total, payment_status, balance_due 
        FROM sales 
        WHERE id IN ({placeholders}) AND customer_id = ?
    """, (*sale_ids, customer['id']))
    
    sales = cur.fetchall()
    sales_list = [dict(sale) if hasattr(sale, 'keys') else {
        'id': sale[0], 'grand_total': sale[1], 'payment_status': sale[2], 'balance_due': sale[3]
    } for sale in sales]
    
    if len(sales_list) != len(sale_ids):
        raise HTTPException(status_code=400, detail="One or more sales not found or do not belong to this customer")
    
    # Calculate total balance due for these sales
    total_balance_due = sum(sale.get('balance_due', 0) or sale.get('grand_total', 0) for sale in sales_list)
    
    # Validate payment amount
    if payment_amount > total_balance_due:
        raise HTTPException(status_code=400, detail=f"Payment amount ({payment_amount}) exceeds total balance due ({total_balance_due})")
    
    # Apply payment to sales proportionally or to oldest first
    remaining_payment = payment_amount
    paid_sales = []
    updated_sales = []
    
    # Sort sales by date (oldest first) to apply payment
    sales_list.sort(key=lambda x: x['id'])  # Using ID as proxy for date since we don't have the date in this subset
    
    for sale in sales_list:
        if remaining_payment <= 0:
            break
            
        current_balance = sale.get('balance_due', 0) or sale.get('grand_total', 0)
        amount_to_apply = min(remaining_payment, current_balance)
        
        new_balance = current_balance - amount_to_apply
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
    
    # Update customer's overall balance
    customer_current_balance = float(customer["current_balance"] or 0)
    new_customer_balance = max(0, customer_current_balance - payment_amount)
    
    cur.execute("""
        UPDATE customers 
        SET current_balance = ?, updated_at = ?
        WHERE id = ?
    """, (new_customer_balance, datetime.datetime.now().isoformat(), customer['id']))
    
    # Record the payment transaction
    cur.execute("""
        INSERT INTO customer_payments (
            customer_id, amount, payment_method, payment_type, notes,
            received_by, payment_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        customer['id'],
        payment_amount,
        payment_method,
        'credit_payment',
        f"{notes} - Applied to sales: {', '.join(map(str, sale_ids))}",
        current_user["id"],
        datetime.datetime.now().date().isoformat(),
        datetime.datetime.now().isoformat(),
        datetime.datetime.now().isoformat()
    ))
    
    return {
        "success": True,
        "message": f"Payment of {payment_amount} applied to {len(sale_ids)} sales",
        "new_customer_balance": new_customer_balance,
        "paid_sales": paid_sales,
        "updated_sales": updated_sales,
        "payment_id": cur.lastrowid
    }


async def _process_general_credit_payment(cur, customer, payment_amount, payment_method, notes, current_user):
    """Process general payment against customer's overall credit balance."""
    customer_current_balance = float(customer["current_balance"] or 0)
    
    if payment_amount > customer_current_balance:
        raise HTTPException(status_code=400, detail=f"Payment amount ({payment_amount}) exceeds customer's outstanding balance of {customer_current_balance}")
    
    # Get all pending sales for this customer, ordered by date (oldest first)
    cur.execute("""
        SELECT id, grand_total, balance_due, payment_status, created_at
        FROM sales 
        WHERE customer_id = ? AND payment_status IN ('pending', 'partial')
        ORDER BY created_at ASC, id ASC
    """, (customer['id'],))
    
    pending_sales = cur.fetchall()
    pending_sales_list = [dict(sale) if hasattr(sale, 'keys') else {
        'id': sale[0], 'grand_total': sale[1], 'balance_due': sale[2], 
        'payment_status': sale[3], 'created_at': sale[4]
    } for sale in pending_sales]
    
    # Apply payment to pending sales (oldest first)
    remaining_payment = payment_amount
    paid_sales = []
    updated_sales = []
    
    for sale in pending_sales_list:
        if remaining_payment <= 0:
            break
            
        current_balance = sale.get('balance_due', 0) or sale.get('grand_total', 0)
        amount_to_apply = min(remaining_payment, current_balance)
        
        new_balance = current_balance - amount_to_apply
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
    
    # Update customer's overall balance
    new_customer_balance = customer_current_balance - payment_amount
    
    cur.execute("""
        UPDATE customers 
        SET current_balance = ?, updated_at = ?
        WHERE id = ?
    """, (new_customer_balance, datetime.datetime.now().isoformat(), customer['id']))
    
    # Record the payment transaction
    cur.execute("""
        INSERT INTO customer_payments (
            customer_id, amount, payment_method, payment_type, notes,
            received_by, payment_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        customer['id'],
        payment_amount,
        payment_method,
        'credit_payment',
        notes,
        current_user["id"],
        datetime.datetime.now().date().isoformat(),
        datetime.datetime.now().isoformat(),
        datetime.datetime.now().isoformat()
    ))
    
    return {
        "success": True,
        "message": f"General credit payment of {payment_amount} processed successfully",
        "new_customer_balance": new_customer_balance,
        "paid_sales": paid_sales,
        "updated_sales": updated_sales,
        "payment_id": cur.lastrowid
    }


@router.get("/credit-dashboard-stats", dependencies=[Depends(require_permission("reports.view"))])
async def get_credit_dashboard_stats(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get comprehensive credit dashboard statistics."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Today's date
            today = datetime.datetime.now().date().isoformat()
            
            # Total outstanding credit across all customers
            cur.execute("SELECT SUM(current_balance) FROM customers WHERE current_balance > 0")
            total_outstanding_result = cur.fetchone()
            total_outstanding = total_outstanding_result[0] if total_outstanding_result and total_outstanding_result[0] is not None else 0
            
            # Today's pending credit sales
            cur.execute("""
                SELECT SUM(balance_due) FROM sales 
                WHERE payment_status = 'pending' AND DATE(created_at) = ?
            """, (today,))
            todays_pending_result = cur.fetchone()
            todays_pending = todays_pending_result[0] if todays_pending_result and todays_pending_result[0] is not None else 0
            
            # Total pending credit sales
            cur.execute("SELECT COUNT(*) FROM sales WHERE payment_status = 'pending'")
            total_pending_sales_result = cur.fetchone()
            total_pending_sales = total_pending_sales_result[0] if total_pending_sales_result else 0
            
            # Total customers with outstanding credit
            cur.execute("SELECT COUNT(*) FROM customers WHERE current_balance > 0")
            customers_with_credit_result = cur.fetchone()
            customers_with_credit = customers_with_credit_result[0] if customers_with_credit_result else 0
            
            # Total overdue credit (sales past due date)
            cur.execute("""
                SELECT SUM(balance_due) FROM sales 
                WHERE payment_status IN ('pending', 'partial') 
                AND DATE(created_at) < DATE('now', '-30 days')
            """)
            overdue_amount_result = cur.fetchone()
            overdue_amount = overdue_amount_result[0] if overdue_amount_result and overdue_amount_result[0] is not None else 0
            
            # Recent credit payments (last 7 days)
            cur.execute("""
                SELECT SUM(amount) FROM customer_payments 
                WHERE payment_date >= DATE('now', '-7 days') 
                AND payment_type LIKE '%credit%'
            """)
            recent_payments_result = cur.fetchone()
            recent_payments = recent_payments_result[0] if recent_payments_result and recent_payments_result[0] is not None else 0
            
            return {
                "success": True,
                "stats": {
                    "total_outstanding_credit": float(total_outstanding),
                    "todays_pending_credit": float(todays_pending),
                    "total_pending_sales": total_pending_sales,
                    "customers_with_credit": customers_with_credit,
                    "overdue_amount": float(overdue_amount),
                    "recent_credit_payments": float(recent_payments)
                }
            }
    except Exception as e:
        logger.error(f"Failed to get credit dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credit-payments", dependencies=[Depends(require_permission("customers.view"))])
async def get_credit_payments(
    customer_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get credit payments with filtering options."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT cp.id, cp.amount, cp.payment_method, cp.payment_type, cp.notes,
                       cp.payment_date, cp.created_at, u.username as received_by_name,
                       c.full_name as customer_name, c.id as customer_id
                FROM customer_payments cp
                LEFT JOIN users u ON cp.received_by = u.id
                LEFT JOIN customers c ON cp.customer_id = c.id
                WHERE cp.payment_type LIKE '%credit%'
            """
            params = []
            
            if customer_id:
                query += " AND cp.customer_id = ?"
                params.append(customer_id)
            if start_date:
                query += " AND DATE(cp.payment_date) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND DATE(cp.payment_date) <= ?"
                params.append(end_date)
            
            query += " ORDER BY cp.payment_date DESC, cp.created_at DESC"
            
            cur.execute(query, params)
            raw_payments = cur.fetchall()
            payments = []
            for row in raw_payments:
                if hasattr(row, 'keys'):
                    payments.append(dict(row))
                else:
                    payments.append({
                        'id': row[0], 'amount': row[1], 'payment_method': row[2],
                        'payment_type': row[3], 'notes': row[4], 'payment_date': row[5],
                        'created_at': row[6], 'received_by_name': row[7],
                        'customer_name': row[8], 'customer_id': row[9]
                    })
            
            return {
                "success": True,
                "payments": payments,
                "total_payments": len(payments)
            }
    except Exception as e:
        logger.error(f"Failed to get credit payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))
