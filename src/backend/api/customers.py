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
            query = "SELECT * FROM customers WHERE deleted_at IS NULL"
            params = []
            
            if search:
                query += " AND (name LIKE ? OR email LIKE ?)"
                search_term = f"%{search}%"
                params.extend([search_term, search_term])
            
            if phone:
                query += " AND phone LIKE ?"
                params.append(f"%{phone}%")
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            customers = cur.fetchall()
            
            # Get total count
            count_query = "SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL"
            count_params = []
            if search:
                count_query += " AND (name LIKE ? OR email LIKE ?)"
                count_params.extend([f"%{search}%", f"%{search}%"])
            if phone:
                count_query += " AND phone LIKE ?"
                count_params.append(f"%{phone}%")
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()[0]
        
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
                "SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL",
                (customer_id,)
            )
            customer = cur.fetchone()
            
            if not customer:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            # Get vehicles
            cur.execute(
                "SELECT * FROM customer_vehicles WHERE customer_id = ? AND deleted_at IS NULL",
                (customer_id,)
            )
            vehicles = cur.fetchall()
            
            # Get loyalty info
            cur.execute(
                "SELECT * FROM customer_loyalty WHERE customer_id = ?",
                (customer_id,)
            )
            loyalty = cur.fetchone()
            
            # Get recent transactions
            cur.execute("""
                SELECT * FROM sales 
                WHERE customer_id = ? AND deleted_at IS NULL
                ORDER BY created_at DESC LIMIT 10
            """, (customer_id,))
            transactions = cur.fetchall()
        
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


@router.post("/", dependencies=[Depends(require_permission("customers.manage"))])
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
                    name, phone, email, address, city, province, 
                    credit_limit, credit_used, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                customer_data.get("name"),
                customer_data.get("phone"),
                customer_data.get("email"),
                customer_data.get("address"),
                customer_data.get("city"),
                customer_data.get("province"),
                customer_data.get("credit_limit", 0),
                0,
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Customer created successfully",
            "customer_id": db.get_last_insert_id()
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
            cur.execute("SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL", (customer_id,))
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
            cur.execute(
                "UPDATE customers SET deleted_at = ? WHERE id = ?",
                (datetime.datetime.now().isoformat(), customer_id)
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
        with db.get_cursor() as cur:
            # Get customer credit info
            cur.execute("""
                SELECT credit_limit, credit_used FROM customers 
                WHERE id = ? AND deleted_at IS NULL
            """, (customer_id,))
            result = cur.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Customer not found")
            
            credit_limit, credit_used = result
            
            # Get outstanding sales (not fully paid)
            cur.execute("""
                SELECT COUNT(*), COALESCE(SUM(total_amount), 0) as total_due
                FROM sales
                WHERE customer_id = ? AND payment_status = 'pending' AND deleted_at IS NULL
            """, (customer_id,))
            pending = cur.fetchone()
        
        return {
            "success": True,
            "credit_limit": credit_limit,
            "credit_used": credit_used,
            "credit_available": credit_limit - credit_used,
            "pending_invoices": pending[0],
            "outstanding_amount": pending[1]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get credit summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
