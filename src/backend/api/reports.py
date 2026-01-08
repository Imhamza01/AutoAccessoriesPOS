"""
REPORTS & ANALYTICS API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger(__name__)


@router.get("/sales-summary", dependencies=[Depends(require_permission("reports.view"))])
async def sales_summary(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales summary for date range."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Daily sales
            query = """
                SELECT DATE(created_at) as date, COUNT(*) as transactions,
                       SUM(grand_total) as revenue, SUM(gst_amount) as gst
                FROM sales
            """
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY DATE(created_at) ORDER BY date DESC"
            
            cur.execute(query, params)
            daily_sales = cur.fetchall()
            
            # Total metrics
            metrics_query = "SELECT COUNT(*), SUM(grand_total), SUM(gst_amount) FROM sales"
            metrics_params = []
            if start_date:
                metrics_query += " AND created_at >= ?"
                metrics_params.append(start_date)
            if end_date:
                metrics_query += " AND created_at <= ?"
                metrics_params.append(end_date)
            
            cur.execute(metrics_query, metrics_params)
            metrics = cur.fetchone()
        
        return {
            "success": True,
            "metrics": {
                "total_transactions": metrics[0] or 0,
                "total_revenue": metrics[1] or 0,
                "total_gst": metrics[2] or 0
            },
            "daily_sales": [
                {
                    "date": d[0],
                    "transactions": d[1],
                    "revenue": d[2],
                    "gst": d[3]
                }
                for d in daily_sales
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get sales summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-products", dependencies=[Depends(require_permission("reports.view"))])
async def top_products(
    limit: int = Query(10),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get top selling products by quantity and revenue."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT p.id, p.name, SUM(si.quantity) as qty_sold,
                       SUM(si.total_price) as revenue
                FROM sale_items si
                JOIN products p ON si.product_id = p.id
            """
            params = []
            
            if start_date:
                query += " AND si.created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND si.created_at <= ?"
                params.append(end_date)
            
            query += f" GROUP BY p.id ORDER BY qty_sold DESC LIMIT ?"
            params.append(limit)
            
            cur.execute(query, params)
            products = cur.fetchall()
        
        return {
            "success": True,
            "top_products": [
                {
                    "product_id": p[0],
                    "name": p[1],
                    "quantity_sold": p[2],
                    "revenue": p[3]
                }
                for p in products
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get top products: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/customer-sales", dependencies=[Depends(require_permission("reports.view"))])
async def customer_sales(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get sales by customer."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT c.id, c.name, COUNT(*) as transactions,
                       SUM(s.grand_total) as total_spent
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
            """
            params = []
            
            if start_date:
                query += " AND DATE(s.created_at) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND DATE(s.created_at) <= ?"
                params.append(end_date)
            
            query += " GROUP BY c.id ORDER BY total_spent DESC"
            
            cur.execute(query, params)
            customers = cur.fetchall()
        
        return {
            "success": True,
            "customer_sales": [
                {
                    "customer_id": c[0],
                    "customer_name": c[1],
                    "transactions": c[2],
                    "total_spent": c[3]
                }
                for c in customers
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get customer sales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gst-report", dependencies=[Depends(require_permission("reports.view"))])
async def gst_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get GST report for tax filing."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Sales with GST
            query = """
                SELECT DATE(created_at) as date, COUNT(*) as invoices,
                       SUM(subtotal) as taxable_amount, SUM(gst_amount) as gst
                FROM sales
                WHERE gst_amount > 0
            """
            params = []
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY DATE(created_at) ORDER BY date DESC"
            
            cur.execute(query, params)
            gst_sales = cur.fetchall()
            
            # Total GST
            total_query = "SELECT SUM(gst_amount) FROM sales WHERE gst_amount > 0"
            total_params = []
            if start_date:
                total_query += " AND created_at >= ?"
                total_params.append(start_date)
            if end_date:
                total_query += " AND created_at <= ?"
                total_params.append(end_date)
            
            cur.execute(total_query, total_params)
            total_gst = cur.fetchone()[0] or 0
        
        return {
            "success": True,
            "total_gst": total_gst,
            "gst_summary": [
                {
                    "date": g[0],
                    "invoices": g[1],
                    "taxable_amount": g[2],
                    "gst": g[3]
                }
                for g in gst_sales
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get GST report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profit-loss", dependencies=[Depends(require_permission("reports.view"))])
async def profit_loss_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get profit and loss statement."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            # Total revenue
            rev_query = "SELECT SUM(grand_total) FROM sales"
            rev_params = []
            if start_date:
                rev_query += " AND created_at >= ?"
                rev_params.append(start_date)
            if end_date:
                rev_query += " AND created_at <= ?"
                rev_params.append(end_date)
            
            cur.execute(rev_query, rev_params)
            revenue = cur.fetchone()[0] or 0
            
            # Total expenses
            exp_query = "SELECT SUM(amount) FROM expenses"
            exp_params = []
            if start_date:
                exp_query += " AND created_at >= ?"
                exp_params.append(start_date)
            if end_date:
                exp_query += " AND created_at <= ?"
                exp_params.append(end_date)
            
            cur.execute(exp_query, exp_params)
            expenses = cur.fetchone()[0] or 0
            
            # Calculate profit
            profit = revenue - expenses
            profit_margin = (profit / revenue * 100) if revenue > 0 else 0
        
        return {
            "success": True,
            "period": {
                "start_date": start_date,
                "end_date": end_date
            },
            "revenue": revenue,
            "expenses": expenses,
            "profit": profit,
            "profit_margin_percent": round(profit_margin, 2)
        }
    except Exception as e:
        logger.error(f"Failed to get P&L report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/inventory-valuation", dependencies=[Depends(require_permission("reports.view"))])
async def inventory_valuation(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get total inventory valuation."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            cur.execute("""
                SELECT SUM(current_stock * cost_price) as total_value,
                       SUM(current_stock) as total_units
                FROM products
            """)
            result = cur.fetchone()
        
        return {
            "success": True,
            "total_inventory_value": result[0] or 0,
            "total_units": result[1] or 0
        }
    except Exception as e:
        logger.error(f"Failed to get inventory valuation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
