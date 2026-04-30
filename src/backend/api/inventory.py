"""
INVENTORY MANAGEMENT API ENDPOINTS - Simplified
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from core.database import get_database_manager

router = APIRouter(prefix="/inventory", tags=["inventory"])
logger = logging.getLogger(__name__)


@router.get("", dependencies=[Depends(require_permission("products.view"))])
async def get_inventory(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=10000),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get inventory - all products with stock info. Same endpoint as /products for consistency."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT p.id, p.product_code, p.name, p.category_id,
                       c.name as category_name,
                       p.current_stock, p.min_stock, p.reorder_level,
                       p.cost_price, p.retail_price, p.image_path,
                       p.barcode, p.is_active
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.is_active = 1
            """
            params = []

            if search:
                query += " AND (p.name LIKE ? OR p.product_code LIKE ? OR p.barcode LIKE ?)"
                s = f"%{search}%"
                params.extend([s, s, s])

            if category_id:
                query += " AND p.category_id = ?"
                params.append(category_id)

            # Count
            count_query = f"SELECT COUNT(*) FROM ({query}) sub"
            cur.execute(count_query, params)
            total = cur.fetchone()[0]

            query += f" ORDER BY p.name ASC LIMIT ? OFFSET ?"
            params.extend([page_size, (page - 1) * page_size])

            cur.execute(query, params)
            rows = cur.fetchall()

            products = []
            for p in rows:
                if hasattr(p, 'keys'):
                    products.append(dict(p))
                else:
                    products.append({
                        "id": p[0], "product_code": p[1], "name": p[2],
                        "category_id": p[3], "category_name": p[4],
                        "current_stock": p[5], "min_stock": p[6],
                        "reorder_level": p[7], "cost_price": p[8],
                        "retail_price": p[9], "image_path": p[10],
                        "barcode": p[11], "is_active": p[12]
                    })

        return {
            "success": True,
            "products": products,
            "total": total,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"Failed to get inventory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stock", dependencies=[Depends(require_permission("products.view"))])
async def get_stock_levels(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    low_stock: Optional[bool] = Query(None),
    out_of_stock: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=10000),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all products with stock levels — supports search, category, and stock filters."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = """
                SELECT p.id, p.product_code, p.name, p.category_id,
                       c.name as category_name,
                       p.current_stock, p.min_stock, p.reorder_level,
                       p.cost_price, p.retail_price, p.image_path,
                       p.barcode, p.is_active
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.is_active = 1
            """
            params = []

            if search:
                query += " AND (p.name LIKE ? OR p.product_code LIKE ? OR p.barcode LIKE ?)"
                s = f"%{search}%"
                params.extend([s, s, s])

            if category_id:
                query += " AND p.category_id = ?"
                params.append(category_id)

            if low_stock:
                query += " AND p.current_stock <= p.min_stock AND p.current_stock > 0"

            if out_of_stock:
                query += " AND p.current_stock <= 0"

            # Count
            count_query = f"SELECT COUNT(*) FROM ({query}) sub"
            cur.execute(count_query, params)
            total = cur.fetchone()[0]

            query += f" ORDER BY p.name ASC LIMIT ? OFFSET ?"
            params.extend([page_size, (page - 1) * page_size])

            cur.execute(query, params)
            rows = cur.fetchall()

            products = []
            for p in rows:
                if hasattr(p, 'keys'):
                    products.append(dict(p))
                else:
                    products.append({
                        "id": p[0], "product_code": p[1], "name": p[2],
                        "category_id": p[3], "category_name": p[4],
                        "current_stock": p[5], "min_stock": p[6],
                        "reorder_level": p[7], "cost_price": p[8],
                        "retail_price": p[9], "image_path": p[10],
                        "barcode": p[11], "is_active": p[12]
                    })

        return {
            "success": True,
            "products": products,
            "total": total,
            "page": page,
            "page_size": page_size
        }
    except Exception as e:
        logger.error(f"Failed to get stock levels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# End of file
