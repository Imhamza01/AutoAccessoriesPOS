# src/backend/api/products.py
"""
PRODUCT MANAGEMENT API ENDPOINTS
"""

import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Body, Request
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission
from services.product_service import get_product_service
from utils.validators import validate_product_data, validate_category_data

router = APIRouter(prefix="/products", tags=["products"])
logger = logging.getLogger(__name__)

# ==================== CATEGORY ENDPOINTS ====================

@router.get("/categories", dependencies=[Depends(require_permission("products.view"))])
async def get_categories(
    include_inactive: bool = Query(False, description="Include inactive categories"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all categories in tree structure.
    """
    try:
        service = get_product_service()
        categories = service.get_categories_tree(include_inactive)
        
        return {
            "success": True,
            "categories": categories,
            "count": len(categories)
        }
        
    except Exception as e:
        logger.error(f"Failed to get categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories/{category_id}", dependencies=[Depends(require_permission("products.view"))])
async def get_category(
    category_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get category by ID.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        category = repo.get_category_by_id(category_id)
        
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        return {
            "success": True,
            "category": category
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/categories", dependencies=[Depends(require_permission("products.manage"))])
async def create_category(
    category_data: Dict[str, Any] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create new category.
    """
    try:
        # Validate category data
        validate_category_data(category_data)
        
        service = get_product_service()
        category = service.create_category(category_data, current_user['id'])
        
        return {
            "success": True,
            "message": "Category created successfully",
            "category": category
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/categories/{category_id}", dependencies=[Depends(require_permission("products.manage"))])
async def update_category(
    category_id: int,
    category_data: Dict[str, Any] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Update category.
    """
    try:
        service = get_product_service()
        category = service.update_category(category_id, category_data, current_user['id'])
        
        return {
            "success": True,
            "message": "Category updated successfully",
            "category": category
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/categories/{category_id}", dependencies=[Depends(require_permission("products.manage"))])
async def delete_category(
    category_id: int,
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Delete category (soft delete).
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        success = repo.delete_category(category_id)
        
        if success:
            return {
                "success": True,
                "message": "Category deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to delete category")
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== BRAND ENDPOINTS ====================

@router.get("/brands", dependencies=[Depends(require_permission("products.view"))])
async def get_brands(
    include_inactive: bool = Query(False, description="Include inactive brands"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all brands.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        brands = repo.get_all_brands(include_inactive)
        
        return {
            "success": True,
            "brands": brands,
            "count": len(brands)
        }
        
    except Exception as e:
        logger.error(f"Failed to get brands: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/brands", dependencies=[Depends(require_permission("products.manage"))])
async def create_brand(
    brand_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create new brand.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        # Validate required fields
        if not brand_data.get('brand_code') or not brand_data.get('name'):
            raise HTTPException(status_code=400, detail="Brand code and name are required")
        
        repo = get_product_repository()
        brand = repo.create_brand(brand_data)
        
        return {
            "success": True,
            "message": "Brand created successfully",
            "brand": brand
        }
        
    except Exception as e:
        logger.error(f"Failed to create brand: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PRODUCT ENDPOINTS ====================

@router.get("", dependencies=[Depends(require_permission("products.view"))])
async def get_products(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    category_id: Optional[int] = Query(None, description="Filter by category"),
    brand_id: Optional[int] = Query(None, description="Filter by brand"),
    search: Optional[str] = Query(None, description="Search term"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    low_stock: Optional[bool] = Query(None, description="Show low stock items"),
    out_of_stock: Optional[bool] = Query(None, description="Show out of stock items"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get all products with filtering and pagination.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        # Build filters
        filters = {}
        if category_id:
            filters['category_id'] = category_id
        if brand_id:
            filters['brand_id'] = brand_id
        if search:
            filters['search'] = search
        if is_active is not None:
            filters['is_active'] = is_active
        if low_stock:
            filters['low_stock'] = True
        if out_of_stock:
            filters['out_of_stock'] = True
        
        repo = get_product_repository()
        result = repo.get_all_products(filters, page, page_size)
        
        return {
            "success": True,
            **result
        }
        
    except Exception as e:
        logger.error(f"Failed to get products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search", dependencies=[Depends(require_permission("products.view"))])
async def search_products(
    q: str = Query(..., description="Search term"),
    limit: int = Query(50, ge=1, le=100, description="Maximum results"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Search products by name, code, or barcode.
    """
    try:
        service = get_product_service()
        products = service.search_products(q, limit)
        
        return {
            "success": True,
            "products": products,
            "count": len(products),
            "search_term": q
        }
        
    except Exception as e:
        logger.error(f"Failed to search products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{product_id}", dependencies=[Depends(require_permission("products.view"))])
async def get_product(
    product_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get product by ID with full details.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        product = repo.get_product_by_id(product_id)
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return {
            "success": True,
            "product": product
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/code/{product_code}", dependencies=[Depends(require_permission("products.view"))])
async def get_product_by_code(
    product_code: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get product by product code or barcode.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        product = repo.get_product_by_code(product_code)
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return {
            "success": True,
            "product": product
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get product by code: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", dependencies=[Depends(require_permission("products.manage"))])
async def create_product(
    product_data: Dict[str, Any] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create new product.
    """
    try:
        service = get_product_service()
        product = service.create_product(product_data, current_user['id'])
        
        return {
            "success": True,
            "message": "Product created successfully",
            "product": product
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{product_id}", dependencies=[Depends(require_permission("products.manage"))])
async def update_product(
    product_id: int,
    product_data: Dict[str, Any] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Update product.
    """
    try:
        service = get_product_service()
        product = service.update_product(product_id, product_data, current_user['id'])
        
        return {
            "success": True,
            "message": "Product updated successfully",
            "product": product
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{product_id}", dependencies=[Depends(require_permission("products.manage"))])
async def delete_product(
    product_id: int,
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Delete product (soft delete).
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        success = repo.delete_product(product_id)
        
        if success:
            return {
                "success": True,
                "message": "Product deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to delete product")
        
    except Exception as e:
        logger.error(f"Failed to delete product: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{product_id}/adjust-stock", dependencies=[Depends(require_permission("inventory.manage"))])
async def adjust_product_stock(
    product_id: int,
    adjustment_data: Dict[str, Any] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Adjust product stock.
    """
    try:
        service = get_product_service()
        result = service.adjust_product_stock(product_id, adjustment_data, current_user['id'])
        
        return {
            "success": True,
            "message": "Stock adjusted successfully",
            **result
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to adjust stock: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{product_id}/analytics", dependencies=[Depends(require_permission("products.view"))])
async def get_product_analytics(
    product_id: int,
    period_days: int = Query(30, ge=1, le=365, description="Analysis period in days"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get product analytics and performance metrics.
    """
    try:
        service = get_product_service()
        analytics = service.get_product_analytics(product_id, period_days)
        
        return {
            "success": True,
            "analytics": analytics
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get product analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== BULK OPERATIONS ====================

@router.post("/bulk-import", dependencies=[Depends(require_permission("products.manage"))])
async def bulk_import_products(
    products_data: List[Dict[str, Any]] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Bulk import products from CSV/Excel data.
    """
    try:
        service = get_product_service()
        result = service.bulk_import_products(products_data, current_user['id'])
        
        return {
            "success": True,
            "message": f"Bulk import completed: {result['successful']} successful, {result['failed']} failed",
            **result
        }
        
    except Exception as e:
        logger.error(f"Failed to bulk import products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk-update-prices", dependencies=[Depends(require_permission("products.manage"))])
async def bulk_update_prices(
    update_data: Dict[str, Any] = Body(...),
    request: Request = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Bulk update product prices.
    """
    try:
        service = get_product_service()
        result = service.update_bulk_prices(update_data, current_user['id'])
        
        return {
            "success": True,
            "message": f"Updated prices for {result['updated_count']} products",
            **result
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to bulk update prices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== STOCK MANAGEMENT ====================

@router.get("/stock/low-stock", dependencies=[Depends(require_permission("inventory.view"))])
async def get_low_stock_products(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get low stock products.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        products = repo.get_low_stock_products()
        
        return {
            "success": True,
            "products": products,
            "count": len(products)
        }
        
    except Exception as e:
        logger.error(f"Failed to get low stock products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stock/out-of-stock", dependencies=[Depends(require_permission("inventory.view"))])
async def get_out_of_stock_products(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get out of stock products.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        products = repo.get_out_of_stock_products()
        
        return {
            "success": True,
            "products": products,
            "count": len(products)
        }
        
    except Exception as e:
        logger.error(f"Failed to get out of stock products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stock/movements", dependencies=[Depends(require_permission("inventory.view"))])
async def get_stock_movements(
    product_id: Optional[int] = Query(None, description="Filter by product"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(100, ge=1, le=500, description="Items per page"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get stock movements with filtering.
    """
    try:
        from repositories.product_repo import get_product_repository
        
        repo = get_product_repository()
        result = repo.get_stock_movements(product_id, start_date, end_date, page, page_size)
        
        return {
            "success": True,
            **result
        }
        
    except Exception as e:
        logger.error(f"Failed to get stock movements: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stock/alerts", dependencies=[Depends(require_permission("inventory.view"))])
async def get_stock_alerts(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get stock alerts for dashboard.
    """
    try:
        service = get_product_service()
        alerts = service.get_stock_alerts()
        
        return {
            "success": True,
            **alerts
        }
        
    except Exception as e:
        logger.error(f"Failed to get stock alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PRICE CALCULATIONS ====================

@router.post("/{product_id}/calculate-price", dependencies=[Depends(require_permission("products.view"))])
async def calculate_product_price(
    product_id: int,
    price_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Calculate discounted price for a product.
    """
    try:
        service = get_product_service()
        result = service.calculate_discounted_price(
            product_id,
            price_data.get('discount_percent', 0),
            price_data.get('discount_amount', 0),
            price_data.get('customer_type', 'retail')
        )
        
        return {
            "success": True,
            "price_calculation": result
        }
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to calculate price: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== REPORTS ====================

@router.get("/reports/{report_type}", dependencies=[Depends(require_permission("reports.view"))])
async def generate_product_report(
    report_type: str,
    category_id: Optional[int] = Query(None, description="Filter by category"),
    brand_id: Optional[int] = Query(None, description="Filter by brand"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate product reports.
    """
    try:
        filters = {}
        if category_id:
            filters['category_id'] = category_id
        if brand_id:
            filters['brand_id'] = brand_id
        if start_date:
            filters['start_date'] = start_date
        if end_date:
            filters['end_date'] = end_date
        
        service = get_product_service()
        report = service.generate_product_report(report_type, filters)
        
        return {
            "success": True,
            "report": report
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== HEALTH CHECK ====================

@router.get("/health")
async def health_check():
    """
    Health check endpoint for product service.
    """
    return {
        "status": "healthy",
        "service": "product_management",
        "timestamp": datetime.now().isoformat()
    }