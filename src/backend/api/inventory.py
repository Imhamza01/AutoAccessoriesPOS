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
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get inventory - all products with stock info. Same endpoint as /products for consistency."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT id, product_code, name, category_id, current_stock, reorder_level, cost_price, image_path FROM products WHERE is_active = 1"
            params = []

            if search:
                query += " AND (name LIKE ? OR product_code LIKE ?)"
                search_param = f"%{search}%"
                params.extend([search_param, search_param])

            if category_id:
                query += " AND category_id = ?"
                params.append(category_id)

            query += " ORDER BY name ASC"

            cur.execute(query, params)
            products = cur.fetchall()
        
        # Convert to dicts
        product_list = [
            {
                "id": p[0],
                "product_code": p[1],
                "name": p[2],
                "category_id": p[3],
                "current_stock": p[4],
                "reorder_level": p[5],
                "cost_price": p[6],
                "image_path": p[7]
            }
            for p in products
        ]
        
        return product_list
    except Exception as e:
        logger.error(f"Failed to get inventory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stock", dependencies=[Depends(require_permission("products.view"))])
async def get_stock_levels(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get all products with stock levels."""
    try:
        db = get_database_manager()
        with db.get_cursor() as cur:
            query = "SELECT id, product_code, name, category_id, current_stock, reorder_level, cost_price, image_path FROM products WHERE is_active = 1 ORDER BY name ASC"
            cur.execute(query)
            products = cur.fetchall()
        
        # Convert to dicts
        product_list = [
            {
                "id": p[0],
                "product_code": p[1],
                "name": p[2],
                "category_id": p[3],
                "current_stock": p[4],
                "reorder_level": p[5],
                "cost_price": p[6],
                "image_path": p[7]
            }
            for p in products
        ]
        
        return product_list
    except Exception as e:
        logger.error(f"Failed to get stock levels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# End of file
