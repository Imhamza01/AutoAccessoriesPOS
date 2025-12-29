"""
EXPENSES MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/expenses", tags=["expenses"])
logger = logging.getLogger(__name__)


@router.get("/", dependencies=[Depends(require_permission("expenses.view"))])
async def list_expenses(
    skip: int = Query(0),
    limit: int = Query(50),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all expenses with filtering."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT * FROM expenses WHERE deleted_at IS NULL"
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            if category:
                query += " AND category = ?"
                params.append(category)
            
            query += f" ORDER BY created_at DESC LIMIT ? OFFSET ?"
            params.extend([limit, skip])
            
            cur.execute(query, params)
            expenses = cur.fetchall()
            
            # Get total
            count_query = "SELECT COUNT(*) FROM expenses WHERE deleted_at IS NULL"
            count_params = []
            if start_date:
                count_query += " AND created_at >= ?"
                count_params.append(start_date)
            if end_date:
                count_query += " AND created_at <= ?"
                count_params.append(end_date)
            if category:
                count_query += " AND category = ?"
                count_params.append(category)
            
            cur.execute(count_query, count_params)
            total = cur.fetchone()[0]
        
        return {
            "success": True,
            "expenses": expenses,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        logger.error(f"Failed to list expenses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", dependencies=[Depends(require_permission("expenses.manage"))])
async def create_expense(
    expense_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create new expense entry."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                INSERT INTO expenses (
                    date, category, description, amount, 
                    payment_method, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                expense_data.get("date", datetime.datetime.now().isoformat()),
                expense_data.get("category"),
                expense_data.get("description"),
                expense_data.get("amount"),
                expense_data.get("payment_method", "cash"),
                current_user["id"],
                datetime.datetime.now().isoformat(),
                datetime.datetime.now().isoformat()
            ))
        
        return {
            "success": True,
            "message": "Expense created successfully",
            "expense_id": db.get_last_insert_id()
        }
    except Exception as e:
        logger.error(f"Failed to create expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{expense_id}", dependencies=[Depends(require_permission("expenses.view"))])
async def get_expense(
    expense_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get expense details."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute(
                "SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL",
                (expense_id,)
            )
            expense = cur.fetchone()
            
            if not expense:
                raise HTTPException(status_code=404, detail="Expense not found")
        
        return {
            "success": True,
            "expense": expense
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{expense_id}", dependencies=[Depends(require_permission("expenses.manage"))])
async def update_expense(
    expense_id: int,
    expense_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update expense entry."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Verify exists
            cur.execute("SELECT id FROM expenses WHERE id = ? AND deleted_at IS NULL", (expense_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Expense not found")
            
            # Update
            updates = []
            params = []
            for field in ["date", "category", "description", "amount", "payment_method"]:
                if field in expense_data:
                    updates.append(f"{field} = ?")
                    params.append(expense_data[field])
            
            if updates:
                updates.append("updated_at = ?")
                params.append(datetime.datetime.now().isoformat())
                params.append(expense_id)
                
                query = f"UPDATE expenses SET {', '.join(updates)} WHERE id = ?"
                cur.execute(query, params)
        
        return {
            "success": True,
            "message": "Expense updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{expense_id}", dependencies=[Depends(require_permission("expenses.manage"))])
async def delete_expense(
    expense_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Soft delete expense."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute(
                "UPDATE expenses SET deleted_at = ? WHERE id = ?",
                (datetime.datetime.now().isoformat(), expense_id)
            )
        
        return {
            "success": True,
            "message": "Expense deleted successfully"
        }
    except Exception as e:
        logger.error(f"Failed to delete expense: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/summary", dependencies=[Depends(require_permission("expenses.view"))])
async def expense_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get expense summary and analytics."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Total by category
            query = "SELECT category, COUNT(*), SUM(amount) FROM expenses WHERE deleted_at IS NULL"
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY category ORDER BY SUM(amount) DESC"
            
            cur.execute(query, params)
            by_category = cur.fetchall()
            
            # Grand total
            total_query = "SELECT SUM(amount) FROM expenses WHERE deleted_at IS NULL"
            total_params = []
            if start_date:
                total_query += " AND created_at >= ?"
                total_params.append(start_date)
            if end_date:
                total_query += " AND created_at <= ?"
                total_params.append(end_date)
            
            cur.execute(total_query, total_params)
            total = cur.fetchone()[0] or 0
        
        return {
            "success": True,
            "total_expenses": total,
            "by_category": [
                {"category": c[0], "count": c[1], "amount": c[2]}
                for c in by_category
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get expense summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
