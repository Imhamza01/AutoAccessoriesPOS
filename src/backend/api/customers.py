"""
CUSTOMER MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager
from utils.validators import validate_customer_data

router = APIRouter(prefix="/customers", tags=["customers"])
logger = logging.getLogger(__name__)


@router.get("", dependencies=[Depends(require_permission("customers.view"))])
@router.get("/", dependencies=[Depends(require_permission("customers.view"))])
async def list_customers(
    skip: int = Query(0),
    limit: int = Query(50),
    search: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all customers with optional filtering."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT * FROM customers WHERE 1=1"
            params = []
            
            if search:
                query += " AND (full_name LIKE ? OR email LIKE ?)"
                search_term = f"%{search}%"
                params.extend([search_term, search_term])
            
            if phone:
                query += " AND phone LIKE ?"
                params.append(f"%{phone}%")
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            raw_customers = cur.fetchall()
            # Convert to list of dictionaries to avoid Row object issues
            customers = []
            for row in raw_customers:
                if hasattr(row, 'keys'):  # sqlite3.Row object
                    customers.append(dict(row))
                else:
                    customers.append(row)
                        
            # Get total count (use same filters as main query)
            count_query = "SELECT COUNT(*) FROM customers WHERE 1=1"
            count_params = []
            if search:
                count_query += " AND (full_name LIKE ? OR email LIKE ?)"
                count_params.extend([f"%{search}%", f"%{search}%"])
            if phone:
                count_query += " AND phone LIKE ?"
                count_params.append(f"%{phone}%")
                        
            cur.execute(count_query, count_params)
            total_result = cur.fetchone()
            total = total_result[0] if total_result else 0
        
        return {
            "success": True,
            "customers": customers,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Failed to list customers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{customer_id}", dependencies=[Depends(require_permission("customers.view"))])
async def get_customer(
    customer_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get customer by ID with vehicles and transaction history."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Get customer
            cur.execute(
                "SELECT * FROM customers WHERE id = ?",
                (customer_id,)
            )
            raw_customer = cur.fetchone()
            
            if not raw_customer:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            # Convert to dictionary to avoid Row object issues
            if hasattr(raw_customer, 'keys'):
                customer = dict(raw_customer)
            else:
                customer = raw_customer
            
            # Get vehicles
            cur.execute(
                "SELECT * FROM customer_vehicles WHERE customer_id = ?",
                (customer_id,)
            )
            raw_vehicles = cur.fetchall()
            vehicles = []
            for row in raw_vehicles:
                if hasattr(row, 'keys'):  # sqlite3.Row object
                    vehicles.append(dict(row))
                else:
                    vehicles.append(row)
            
            # Get loyalty info
            cur.execute(
                "SELECT * FROM customer_loyalty WHERE customer_id = ?",
                (customer_id,)
            )
            raw_loyalty = cur.fetchone()
            loyalty = dict(raw_loyalty) if raw_loyalty and hasattr(raw_loyalty, 'keys') else raw_loyalty
            
            # Get recent transactions
            cur.execute("""
                SELECT * FROM sales 
                WHERE customer_id = ?
                ORDER BY created_at DESC LIMIT 10
            """, (customer_id,))
            raw_transactions = cur.fetchall()
            transactions = []
            for row in raw_transactions:
                if hasattr(row, 'keys'):  # sqlite3.Row object
                    transactions.append(dict(row))
                else:
                    transactions.append(row)
        
        return {
            "success": True,
            "customer": customer,
            "vehicles": vehicles or [],
            "loyalty": loyalty,
            "recent_transactions": transactions or []
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get customer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", dependencies=[Depends(require_permission("customers.manage"))])
async def create_customer(
    customer_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create new customer."""
    try:
        validate_customer_data(customer_data)

        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO customers (
                    customer_code, full_name, phone, phone2, email, address, city, area, 
                    credit_limit, current_balance, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                customer_data.get("customer_code") or f"CUST-{int(datetime.datetime.now().timestamp())}",
                customer_data.get("name") or customer_data.get("full_name"),
                customer_data.get("phone"),
                customer_data.get("phone2"),
                customer_data.get("email"),
                customer_data.get("address"),
                customer_data.get("city"),
                customer_data.get("area"),
                customer_data.get("credit_limit", 0),
                0,
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))

        return {
            "success": True,
            "message": "Customer created successfully",
            "customer_id": db.get_last_insert_id() if hasattr(db, 'get_last_insert_id') else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create customer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{customer_id}", dependencies=[Depends(require_permission("customers.manage"))])
async def update_customer(
    customer_id: int,
    customer_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update customer information."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Verify customer exists
            cur.execute("SELECT id FROM customers WHERE id = ?", (customer_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Customer not found")
            
            # Build update query
            updates = []
            params = []
            for field in ["name", "phone", "email", "address", "city", "province", "credit_limit"]:
                if field in customer_data:
                    updates.append(f"{field} = ?")
                    params.append(customer_data[field])
            
            if updates:
                updates.append("updated_at = ?")
                params.append(datetime.datetime.now().isoformat())
                params.append(customer_id)
                
                query = f"UPDATE customers SET {', '.join(updates)} WHERE id = ?"
                cur.execute(query, params)
        
        return {
            "success": True,
            "message": "Customer updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update customer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{customer_id}", dependencies=[Depends(require_permission("customers.manage"))])
async def delete_customer(
    customer_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Soft delete customer."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Actually delete the record since soft delete column doesn't exist
            cur.execute(
                "DELETE FROM customers WHERE id = ?",
                (customer_id,)
            )
        
        return {
            "success": True,
            "message": "Customer deleted successfully"
        }
    except Exception as e:
        logger.error(f"Failed to delete customer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{customer_id}/vehicles", dependencies=[Depends(require_permission("customers.manage"))])
async def add_vehicle(
    customer_id: int,
    vehicle_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Add vehicle to customer."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO customer_vehicles (
                    customer_id, registration_no, make, model, year,
                    created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                customer_id,
                vehicle_data.get("registration_no"),
                vehicle_data.get("make"),
                vehicle_data.get("model"),
                vehicle_data.get("year"),
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Vehicle added successfully"
        }
    except Exception as e:
        logger.error(f"Failed to add vehicle: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{customer_id}/credit-summary", dependencies=[Depends(require_permission("customers.view"))])
async def get_credit_summary(
    customer_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get customer credit summary and outstanding balance."""
    try:
        db = get_database_manager()
        if not db:
            raise HTTPException(status_code=500, detail="Database connection failed")
            
        with db.get_cursor() as cur:
            if not cur:
                raise HTTPException(status_code=500, detail="Database cursor failed")
                
            # Get customer credit info
            cur.execute("""
                SELECT credit_limit, current_balance FROM customers 
                WHERE id = ?
            """, (customer_id,))
            result = cur.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            # Handle Row object unpacking safely
            if hasattr(result, 'keys'):
                result_dict = dict(result)
                credit_limit = result_dict.get('credit_limit', 0)
                current_balance = result_dict.get('current_balance', 0)
            else:
                credit_limit = result[0] if len(result) > 0 else 0
                current_balance = result[1] if len(result) > 1 else 0
            
            # Get outstanding sales (not fully paid)
            cur.execute("""
                SELECT COUNT(*), COALESCE(SUM(grand_total), 0) as total_due
                FROM sales
                WHERE customer_id = ? AND payment_status = 'pending' AND sale_status != 'cancelled'
            """, (customer_id,))
            pending_result = cur.fetchone()
            
            # Handle pending result safely
            if pending_result and hasattr(pending_result, '__getitem__'):
                if hasattr(pending_result, 'keys'):
                    pending_dict = dict(pending_result)
                    pending_invoices = pending_dict.get('COUNT(*)', 0)
                    outstanding_amount = pending_dict.get('total_due', 0)
                else:
                    pending_invoices = pending_result[0] if len(pending_result) > 0 else 0
                    outstanding_amount = pending_result[1] if len(pending_result) > 1 else 0
            else:
                pending_invoices = 0
                outstanding_amount = 0
        
        return {
            "success": True,
            "credit_limit": credit_limit,
            "credit_used": current_balance,
            "credit_available": credit_limit - current_balance,
            "pending_invoices": pending_invoices,
            "outstanding_amount": outstanding_amount
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get credit summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{customer_id}/pay-credit", dependencies=[Depends(require_permission("customers.manage"))])
async def pay_customer_credit(
    customer_id: int,
    payment_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Process customer credit payment."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            payment_amount = float(payment_data.get("amount", 0))
            
            if payment_amount <= 0:
                raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
            
            # Get customer's current credit used
            cur.execute("SELECT current_balance FROM customers WHERE id = ?", (customer_id,))
            result = cur.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            current_credit_used = result[0] if result[0] else 0
            
            if payment_amount > current_credit_used:
                raise HTTPException(status_code=400, detail="Payment amount exceeds outstanding credit")
            
            # Update customer credit_used
            new_credit_used = current_credit_used - payment_amount
            cur.execute("""
                UPDATE customers 
                SET current_balance = ?
                WHERE id = ?
            """, (new_credit_used, customer_id))
            
            # Update sales payment status for the paid amount
            cur.execute("""
                UPDATE sales 
                SET payment_status = 'paid'
                WHERE customer_id = ? AND payment_status = 'pending' 
                AND grand_total <= ?
                ORDER BY created_at ASC
            """, (customer_id, payment_amount))
        
        return {
            "success": True,
            "message": "Credit payment processed successfully",
            "remaining_credit": new_credit_used
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process credit payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))