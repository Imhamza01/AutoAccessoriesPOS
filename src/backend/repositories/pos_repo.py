# src/backend/repositories/product_repo.py
"""
PRODUCT REPOSITORY - Data Access Layer
Follows repository pattern from your architecture
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import logging

from core.database import get_database_manager

logger = logging.getLogger(__name__)

class ProductRepository:
    """Repository for product data operations"""
    
    def __init__(self):
        self.db_manager = get_database_manager()
    
    # ==================== CATEGORY OPERATIONS ====================
    
    def get_all_categories(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all categories with optional filtering."""
        try:
            with self.db_manager.get_cursor() as cursor:
                query = '''
                    SELECT c.*, 
                           COUNT(p.id) as product_count,
                           parent.name as parent_name
                    FROM categories c
                    LEFT JOIN products p ON c.id = p.category_id
                    LEFT JOIN categories parent ON c.parent_id = parent.id
                '''
                
                if not include_inactive:
                    query += " WHERE c.is_active = 1"
                
                query += " GROUP BY c.id ORDER BY c.display_order, c.name"
                
                cursor.execute(query)
                categories = [dict(row) for row in cursor.fetchall()]
                
                # Build tree structure
                return self._build_category_tree(categories)
                
        except Exception as e:
            logger.error(f"Failed to get categories: {e}")
            raise
    
    def _build_category_tree(self, categories: List[Dict[str, Any]], parent_id: int = None) -> List[Dict[str, Any]]:
        """Build category tree structure."""
        tree = []
        for category in categories:
            if category.get('parent_id') == parent_id:
                children = self._build_category_tree(categories, category['id'])
                if children:
                    category['children'] = children
                tree.append(category)
        return tree
    
    def get_category_by_id(self, category_id: int) -> Optional[Dict[str, Any]]:
        """Get category by ID."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    SELECT c.*, 
                           COUNT(p.id) as product_count,
                           parent.name as parent_name
                    FROM categories c
                    LEFT JOIN products p ON c.id = p.category_id
                    LEFT JOIN categories parent ON c.parent_id = parent.id
                    WHERE c.id = ?
                    GROUP BY c.id
                ''', (category_id,))
                
                row = cursor.fetchone()
                return dict(row) if row else None
                
        except Exception as e:
            logger.error(f"Failed to get category: {e}")
            raise
    
    def create_category(self, category_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Create new category."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    INSERT INTO categories (
                        parent_id, category_code, name, description,
                        image_path, display_order, for_vehicle_type,
                        is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ''', (
                    category_data.get('parent_id'),
                    category_data['category_code'].upper(),
                    category_data['name'],
                    category_data.get('description'),
                    category_data.get('image_path'),
                    category_data.get('display_order', 0),
                    category_data.get('for_vehicle_type'),
                    category_data.get('is_active', True)
                ))
                
                category_id = cursor.lastrowid
                return self.get_category_by_id(category_id)
                
        except Exception as e:
            logger.error(f"Failed to create category: {e}")
            raise
    
    def update_category(self, category_id: int, category_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update category."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Build dynamic update query
                update_fields = []
                update_values = []
                
                for field in ['parent_id', 'category_code', 'name', 'description', 
                            'image_path', 'display_order', 'for_vehicle_type', 'is_active']:
                    if field in category_data:
                        update_fields.append(f"{field} = ?")
                        update_values.append(category_data[field])
                
                if update_fields:
                    update_fields.append("updated_at = CURRENT_TIMESTAMP")
                    update_values.append(category_id)
                    
                    query = f"UPDATE categories SET {', '.join(update_fields)} WHERE id = ?"
                    cursor.execute(query, update_values)
                
                return self.get_category_by_id(category_id)
                
        except Exception as e:
            logger.error(f"Failed to update category: {e}")
            raise
    
    def delete_category(self, category_id: int) -> bool:
        """Soft delete category (deactivate)."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Check if category has products
                cursor.execute("SELECT COUNT(*) FROM products WHERE category_id = ? AND is_active = 1", 
                             (category_id,))
                product_count = cursor.fetchone()[0]
                
                if product_count > 0:
                    raise ValueError(f"Cannot delete category with {product_count} active products")
                
                # Deactivate category
                cursor.execute('''
                    UPDATE categories 
                    SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                ''', (category_id,))
                
                return True
                
        except Exception as e:
            logger.error(f"Failed to delete category: {e}")
            raise
    
    # ==================== BRAND OPERATIONS ====================
    
    def get_all_brands(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all brands."""
        try:
            with self.db_manager.get_cursor() as cursor:
                query = '''
                    SELECT b.*, COUNT(p.id) as product_count
                    FROM brands b
                    LEFT JOIN products p ON b.id = p.brand_id
                '''
                
                if not include_inactive:
                    query += " WHERE b.is_active = 1"
                
                query += " GROUP BY b.id ORDER BY b.name"
                
                cursor.execute(query)
                return [dict(row) for row in cursor.fetchall()]
                
        except Exception as e:
            logger.error(f"Failed to get brands: {e}")
            raise
    
    def get_brand_by_id(self, brand_id: int) -> Optional[Dict[str, Any]]:
        """Get brand by ID."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    SELECT b.*, COUNT(p.id) as product_count
                    FROM brands b
                    LEFT JOIN products p ON b.id = p.brand_id
                    WHERE b.id = ?
                    GROUP BY b.id
                ''', (brand_id,))
                
                row = cursor.fetchone()
                return dict(row) if row else None
                
        except Exception as e:
            logger.error(f"Failed to get brand: {e}")
            raise
    
    def create_brand(self, brand_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new brand."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    INSERT INTO brands (
                        brand_code, name, country, description,
                        logo_path, is_active, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (
                    brand_data['brand_code'].upper(),
                    brand_data['name'],
                    brand_data.get('country'),
                    brand_data.get('description'),
                    brand_data.get('logo_path'),
                    brand_data.get('is_active', True)
                ))
                
                brand_id = cursor.lastrowid
                return self.get_brand_by_id(brand_id)
                
        except Exception as e:
            logger.error(f"Failed to create brand: {e}")
            raise
    
    def update_brand(self, brand_id: int, brand_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update brand."""
        try:
            with self.db_manager.get_cursor() as cursor:
                update_fields = []
                update_values = []
                
                for field in ['brand_code', 'name', 'country', 'description', 'logo_path', 'is_active']:
                    if field in brand_data:
                        update_fields.append(f"{field} = ?")
                        update_values.append(brand_data[field])
                
                if update_fields:
                    update_values.append(brand_id)
                    query = f"UPDATE brands SET {', '.join(update_fields)} WHERE id = ?"
                    cursor.execute(query, update_values)
                
                return self.get_brand_by_id(brand_id)
                
        except Exception as e:
            logger.error(f"Failed to update brand: {e}")
            raise
    
    # ==================== PRODUCT OPERATIONS ====================
    
    def get_all_products(self, filters: Optional[Dict[str, Any]] = None, 
                        page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """Get all products with filtering and pagination."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Base query
                query = '''
                    SELECT p.*, 
                           c.name as category_name,
                           c.category_code as category_code,
                           b.name as brand_name,
                           u.full_name as created_by_name,
                           SUM(CASE WHEN sm.movement_type = 'purchase' THEN sm.quantity ELSE 0 END) as total_purchased,
                           SUM(CASE WHEN sm.movement_type = 'sale' THEN sm.quantity ELSE 0 END) as total_sold
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    LEFT JOIN users u ON p.created_by = u.id
                    LEFT JOIN stock_movements sm ON p.id = sm.product_id
                '''
                
                # Apply filters
                where_clauses = []
                query_params = []
                
                if filters:
                    if filters.get('category_id'):
                        where_clauses.append("p.category_id = ?")
                        query_params.append(filters['category_id'])
                    
                    if filters.get('brand_id'):
                        where_clauses.append("p.brand_id = ?")
                        query_params.append(filters['brand_id'])
                    
                    if filters.get('search'):
                        where_clauses.append("(p.name LIKE ? OR p.product_code LIKE ? OR p.barcode LIKE ?)")
                        search_term = f"%{filters['search']}%"
                        query_params.extend([search_term, search_term, search_term])
                    
                    if filters.get('is_active') is not None:
                        where_clauses.append("p.is_active = ?")
                        query_params.append(filters['is_active'])
                    
                    if filters.get('low_stock'):
                        where_clauses.append("p.current_stock <= p.min_stock")
                    
                    if filters.get('out_of_stock'):
                        where_clauses.append("p.current_stock <= 0")
                
                if where_clauses:
                    query += " WHERE " + " AND ".join(where_clauses)
                
                # Group by product
                query += " GROUP BY p.id"
                
                # Count total records
                count_query = f"SELECT COUNT(DISTINCT p.id) FROM products p"
                if where_clauses:
                    count_query += " WHERE " + " AND ".join(where_clauses)
                
                cursor.execute(count_query, query_params)
                total_records = cursor.fetchone()[0]
                
                # Apply pagination
                offset = (page - 1) * page_size
                query += f" ORDER BY p.created_at DESC LIMIT {page_size} OFFSET {offset}"
                
                cursor.execute(query, query_params)
                products = [dict(row) for row in cursor.fetchall()]
                
                return {
                    'products': products,
                    'total_records': total_records,
                    'total_pages': (total_records + page_size - 1) // page_size,
                    'current_page': page,
                    'page_size': page_size
                }
                
        except Exception as e:
            logger.error(f"Failed to get products: {e}")
            raise
    
    def get_product_by_id(self, product_id: int) -> Optional[Dict[str, Any]]:
        """Get product by ID with full details."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Get product details
                cursor.execute('''
                    SELECT p.*, 
                           c.name as category_name,
                           c.category_code as category_code,
                           b.name as brand_name,
                           u.full_name as created_by_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    LEFT JOIN users u ON p.created_by = u.id
                    WHERE p.id = ?
                ''', (product_id,))
                
                product = cursor.fetchone()
                if not product:
                    return None
                
                product_dict = dict(product)
                
                # Get variants
                cursor.execute('''
                    SELECT * FROM product_variants 
                    WHERE product_id = ? AND is_active = 1
                    ORDER BY variant_name
                ''', (product_id,))
                
                variants = [dict(row) for row in cursor.fetchall()]
                product_dict['variants'] = variants
                
                # Get stock movements
                cursor.execute('''
                    SELECT sm.*, u.full_name as user_name
                    FROM stock_movements sm
                    LEFT JOIN users u ON sm.created_by = u.id
                    WHERE sm.product_id = ?
                    ORDER BY sm.created_at DESC
                    LIMIT 100
                ''', (product_id,))
                
                movements = [dict(row) for row in cursor.fetchall()]
                product_dict['stock_movements'] = movements
                
                # Get sales history
                cursor.execute('''
                    SELECT si.sale_id, s.invoice_number, s.invoice_date,
                           si.quantity, si.unit_price, si.line_total,
                           c.full_name as customer_name
                    FROM sale_items si
                    JOIN sales s ON si.sale_id = s.id
                    LEFT JOIN customers c ON s.customer_id = c.id
                    WHERE si.product_id = ?
                    ORDER BY s.invoice_date DESC
                    LIMIT 50
                ''', (product_id,))
                
                sales = [dict(row) for row in cursor.fetchall()]
                product_dict['sales_history'] = sales
                
                return product_dict
                
        except Exception as e:
            logger.error(f"Failed to get product: {e}")
            raise
    
    def get_product_by_code(self, product_code: str) -> Optional[Dict[str, Any]]:
        """Get product by product code."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    SELECT p.*, 
                           c.name as category_name,
                           b.name as brand_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    WHERE p.product_code = ? OR p.barcode = ?
                ''', (product_code, product_code))
                
                row = cursor.fetchone()
                return dict(row) if row else None
                
        except Exception as e:
            logger.error(f"Failed to get product by code: {e}")
            raise
    
    def create_product(self, product_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Create new product."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Check if product code already exists
                cursor.execute("SELECT id FROM products WHERE product_code = ?", 
                             (product_data['product_code'],))
                if cursor.fetchone():
                    raise ValueError(f"Product code {product_data['product_code']} already exists")
                
                # Insert product
                cursor.execute('''
                    INSERT INTO products (
                        product_code, barcode, name, description,
                        category_id, brand_id, unit,
                        cost_price, retail_price, wholesale_price, 
                        dealer_price, min_sale_price,
                        current_stock, min_stock, max_stock, reorder_level,
                        gst_rate, is_gst_applicable, hsc_code,
                        for_vehicle_type, model_compatibility, warranty_days,
                        has_serial, image_path, is_active, is_service,
                        created_by, created_at, updated_at, last_stock_update
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 
                             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ''', (
                    product_data['product_code'].upper(),
                    product_data.get('barcode'),
                    product_data['name'],
                    product_data.get('description'),
                    product_data['category_id'],
                    product_data.get('brand_id'),
                    product_data.get('unit', 'pcs'),
                    product_data['cost_price'],
                    product_data['retail_price'],
                    product_data.get('wholesale_price'),
                    product_data.get('dealer_price'),
                    product_data.get('min_sale_price'),
                    product_data.get('current_stock', 0),
                    product_data.get('min_stock', 5),
                    product_data.get('max_stock'),
                    product_data.get('reorder_level'),
                    product_data.get('gst_rate', 17.0),
                    product_data.get('is_gst_applicable', True),
                    product_data.get('hsc_code'),
                    product_data.get('for_vehicle_type'),
                    product_data.get('model_compatibility'),
                    product_data.get('warranty_days', 180),
                    product_data.get('has_serial', False),
                    product_data.get('image_path'),
                    product_data.get('is_active', True),
                    product_data.get('is_service', False),
                    user_id
                ))
                
                product_id = cursor.lastrowid
                
                # Record initial stock movement if stock > 0
                if product_data.get('current_stock', 0) > 0:
                    cursor.execute('''
                        INSERT INTO stock_movements (
                            product_id, movement_type, quantity,
                            previous_quantity, new_quantity, unit_cost,
                            total_cost, reference_id, reference_type,
                            reason, notes, created_by, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ''', (
                        product_id,
                        'purchase',
                        product_data['current_stock'],
                        0,
                        product_data['current_stock'],
                        product_data['cost_price'],
                        product_data['cost_price'] * product_data['current_stock'],
                        None,
                        'product_creation',
                        'Initial stock',
                        'Product creation with initial stock',
                        user_id
                    ))
                
                return self.get_product_by_id(product_id)
                
        except Exception as e:
            logger.error(f"Failed to create product: {e}")
            raise
    
    def update_product(self, product_id: int, product_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Update product."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Get current product
                current_product = self.get_product_by_id(product_id)
                if not current_product:
                    raise ValueError(f"Product {product_id} not found")
                
                # Build dynamic update query
                update_fields = []
                update_values = []
                
                updatable_fields = [
                    'name', 'description', 'category_id', 'brand_id', 'unit',
                    'cost_price', 'retail_price', 'wholesale_price', 'dealer_price', 'min_sale_price',
                    'min_stock', 'max_stock', 'reorder_level',
                    'gst_rate', 'is_gst_applicable', 'hsc_code',
                    'for_vehicle_type', 'model_compatibility', 'warranty_days',
                    'has_serial', 'image_path', 'is_active', 'is_service'
                ]
                
                for field in updatable_fields:
                    if field in product_data:
                        update_fields.append(f"{field} = ?")
                        update_values.append(product_data[field])
                
                # Handle stock adjustment separately
                stock_change = None
                if 'current_stock' in product_data:
                    new_stock = product_data['current_stock']
                    current_stock = current_product['current_stock']
                    
                    if new_stock != current_stock:
                        stock_change = new_stock - current_stock
                        update_fields.append("current_stock = ?")
                        update_values.append(new_stock)
                        update_fields.append("last_stock_update = CURRENT_TIMESTAMP")
                
                if update_fields:
                    update_fields.append("updated_at = CURRENT_TIMESTAMP")
                    update_values.append(product_id)
                    
                    query = f"UPDATE products SET {', '.join(update_fields)} WHERE id = ?"
                    cursor.execute(query, update_values)
                
                # Record stock movement if stock changed
                if stock_change is not None:
                    movement_type = 'adjustment' if stock_change > 0 else 'damage'
                    cursor.execute('''
                        INSERT INTO stock_movements (
                            product_id, movement_type, quantity,
                            previous_quantity, new_quantity, unit_cost,
                            total_cost, reference_type, reason,
                            notes, created_by, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ''', (
                        product_id,
                        movement_type,
                        abs(stock_change),
                        current_product['current_stock'],
                        product_data['current_stock'],
                        product_data.get('cost_price', current_product['cost_price']),
                        product_data.get('cost_price', current_product['cost_price']) * abs(stock_change),
                        'stock_adjustment',
                        'Manual stock adjustment',
                        product_data.get('stock_adjustment_reason', 'Stock adjustment'),
                        user_id
                    ))
                
                return self.get_product_by_id(product_id)
                
        except Exception as e:
            logger.error(f"Failed to update product: {e}")
            raise
    
    def update_product_stock(self, product_id: int, quantity_change: float, 
                           movement_type: str, reference_id: Optional[int] = None,
                           reference_type: Optional[str] = None, user_id: Optional[int] = None,
                           notes: str = '') -> Dict[str, Any]:
        """Update product stock with movement tracking."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Get current stock
                cursor.execute("SELECT current_stock, cost_price FROM products WHERE id = ?", 
                             (product_id,))
                result = cursor.fetchone()
                
                if not result:
                    raise ValueError(f"Product {product_id} not found")
                
                current_stock = result['current_stock']
                cost_price = result['cost_price']
                new_stock = current_stock + quantity_change
                
                # Update stock
                cursor.execute('''
                    UPDATE products 
                    SET current_stock = ?, last_stock_update = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (new_stock, product_id))
                
                # Record movement
                cursor.execute('''
                    INSERT INTO stock_movements (
                        product_id, movement_type, quantity,
                        previous_quantity, new_quantity, unit_cost,
                        total_cost, reference_id, reference_type,
                        reason, notes, created_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ''', (
                    product_id,
                    movement_type,
                    quantity_change,
                    current_stock,
                    new_stock,
                    cost_price,
                    cost_price * quantity_change,
                    reference_id,
                    reference_type,
                    'Stock movement',
                    notes,
                    user_id
                ))
                
                return {
                    'product_id': product_id,
                    'previous_stock': current_stock,
                    'new_stock': new_stock,
                    'quantity_change': quantity_change,
                    'movement_type': movement_type
                }
                
        except Exception as e:
            logger.error(f"Failed to update product stock: {e}")
            raise
    
    def delete_product(self, product_id: int) -> bool:
        """Soft delete product (deactivate)."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    UPDATE products 
                    SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                ''', (product_id,))
                
                return True
                
        except Exception as e:
            logger.error(f"Failed to delete product: {e}")
            raise
    
    # ==================== PRODUCT VARIANT OPERATIONS ====================
    
    def get_product_variants(self, product_id: int) -> List[Dict[str, Any]]:
        """Get all variants for a product."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    SELECT * FROM product_variants 
                    WHERE product_id = ? AND is_active = 1
                    ORDER BY variant_name
                ''', (product_id,))
                
                return [dict(row) for row in cursor.fetchall()]
                
        except Exception as e:
            logger.error(f"Failed to get product variants: {e}")
            raise
    
    def create_product_variant(self, product_id: int, variant_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new product variant."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Check if variant code already exists for this product
                cursor.execute('''
                    SELECT id FROM product_variants 
                    WHERE product_id = ? AND variant_code = ?
                ''', (product_id, variant_data['variant_code']))
                
                if cursor.fetchone():
                    raise ValueError(f"Variant code {variant_data['variant_code']} already exists for this product")
                
                # Insert variant
                cursor.execute('''
                    INSERT INTO product_variants (
                        product_id, variant_code, variant_name,
                        barcode, cost_price, sale_price,
                        current_stock, min_stock, image_path,
                        is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ''', (
                    product_id,
                    variant_data['variant_code'].upper(),
                    variant_data['variant_name'],
                    variant_data.get('barcode'),
                    variant_data.get('cost_price'),
                    variant_data.get('sale_price'),
                    variant_data.get('current_stock', 0),
                    variant_data.get('min_stock', 0),
                    variant_data.get('image_path'),
                    variant_data.get('is_active', True)
                ))
                
                variant_id = cursor.lastrowid
                
                # Get created variant
                cursor.execute('SELECT * FROM product_variants WHERE id = ?', (variant_id,))
                return dict(cursor.fetchone())
                
        except Exception as e:
            logger.error(f"Failed to create product variant: {e}")
            raise
    
    def update_product_variant(self, variant_id: int, variant_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update product variant."""
        try:
            with self.db_manager.get_cursor() as cursor:
                update_fields = []
                update_values = []
                
                for field in ['variant_code', 'variant_name', 'barcode', 'cost_price', 
                            'sale_price', 'current_stock', 'min_stock', 'image_path', 'is_active']:
                    if field in variant_data:
                        update_fields.append(f"{field} = ?")
                        update_values.append(variant_data[field])
                
                if update_fields:
                    update_fields.append("updated_at = CURRENT_TIMESTAMP")
                    update_values.append(variant_id)
                    
                    query = f"UPDATE product_variants SET {', '.join(update_fields)} WHERE id = ?"
                    cursor.execute(query, update_values)
                
                # Get updated variant
                cursor.execute('SELECT * FROM product_variants WHERE id = ?', (variant_id,))
                return dict(cursor.fetchone())
                
        except Exception as e:
            logger.error(f"Failed to update product variant: {e}")
            raise
    
    # ==================== STOCK MANAGEMENT ====================
    
    def get_low_stock_products(self, threshold: Optional[float] = None) -> List[Dict[str, Any]]:
        """Get products with low stock."""
        try:
            with self.db_manager.get_cursor() as cursor:
                query = '''
                    SELECT p.*, c.name as category_name, b.name as brand_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    WHERE p.is_active = 1 AND p.current_stock <= 
                '''
                
                if threshold:
                    query += "?"
                    params = (threshold,)
                else:
                    query += "p.min_stock"
                    params = ()
                
                query += " ORDER BY p.current_stock ASC"
                
                cursor.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]
                
        except Exception as e:
            logger.error(f"Failed to get low stock products: {e}")
            raise
    
    def get_out_of_stock_products(self) -> List[Dict[str, Any]]:
        """Get out of stock products."""
        try:
            with self.db_manager.get_cursor() as cursor:
                cursor.execute('''
                    SELECT p.*, c.name as category_name, b.name as brand_name
                    FROM products p
                    LEFT JOIN categories c ON p.category_id = c.id
                    LEFT JOIN brands b ON p.brand_id = b.id
                    WHERE p.is_active = 1 AND p.current_stock <= 0
                    ORDER BY p.name
                ''')
                
                return [dict(row) for row in cursor.fetchall()]
                
        except Exception as e:
            logger.error(f"Failed to get out of stock products: {e}")
            raise
    
    def get_stock_movements(self, product_id: Optional[int] = None, 
                           start_date: Optional[str] = None,
                           end_date: Optional[str] = None,
                           page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """Get stock movements with filtering."""
        try:
            with self.db_manager.get_cursor() as cursor:
                # Base query
                query = '''
                    SELECT sm.*, 
                           p.product_code, p.name as product_name,
                           u.full_name as user_name
                    FROM stock_movements sm
                    JOIN products p ON sm.product_id = p.id
                    LEFT JOIN users u ON sm.created_by = u.id
                '''
                
                # Apply filters
                where_clauses = []
                query_params = []
                
                if product_id:
                    where_clauses.append("sm.product_id = ?")
                    query_params.append(product_id)
                
                if start_date:
                    where_clauses.append("DATE(sm.created_at) >= ?")
                    query_params.append(start_date)
                
                if end_date:
                    where_clauses.append("DATE(sm.created_at) <= ?")
                    query_params.append(end_date)
                
                if where_clauses:
                    query += " WHERE " + " AND ".join(where_clauses)
                
                # Count total records
                count_query = f"SELECT COUNT(*) FROM stock_movements sm"
                if where_clauses:
                    count_query += " WHERE " + " AND ".join(where_clauses)
                
                cursor.execute(count_query, query_params)
                total_records = cursor.fetchone()[0]
                
                # Get data
                query += " ORDER BY sm.created_at DESC"
                query += f" LIMIT {page_size} OFFSET {(page - 1) * page_size}"
                
                cursor.execute(query, query_params)
                movements = [dict(row) for row in cursor.fetchall()]
                
                return {
                    'movements': movements,
                    'total_records': total_records,
                    'total_pages': (total_records + page_size - 1) // page_size,
                    'current_page': page,
                    'page_size': page_size
                }
                
        except Exception as e:
            logger.error(f"Failed to get stock movements: {e}")
            raise
    
    # ==================== BULK OPERATIONS ====================
    
    def bulk_update_prices(self, product_ids: List[int], 
                          price_type: str, new_value: float,
                          is_percentage: bool = False) -> int:
        """Bulk update product prices."""
        try:
            with self.db_manager.get_cursor() as cursor:
                updated_count = 0
                
                for product_id in product_ids:
                    # Get current product
                    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
                    product = cursor.fetchone()
                    
                    if not product:
                        continue
                    
                    # Calculate new price
                    if price_type == 'retail_price':
                        current_price = product['retail_price']
                    elif price_type == 'wholesale_price':
                        current_price = product['wholesale_price'] or product['retail_price']
                    elif price_type == 'dealer_price':
                        current_price = product['dealer_price'] or product['retail_price']
                    elif price_type == 'cost_price':
                        current_price = product['cost_price']
                    else:
                        continue
                    
                    new_price = (current_price * (1 + new_value/100) if is_percentage 
                                else new_value)
                    
                    # Update price
                    cursor.execute(f'''
                        UPDATE products 
                        SET {price_type} = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    ''', (new_price, product_id))
                    
                    updated_count += 1
                
                return updated_count
                
        except Exception as e:
            logger.error(f"Failed to bulk update prices: {e}")
            raise
    
    def bulk_update_stock(self, product_ids: List[int], 
                         quantity_change: float, 
                         movement_type: str,
                         user_id: int, notes: str = '') -> int:
        """Bulk update product stock."""
        try:
            with self.db_manager.get_cursor() as cursor:
                updated_count = 0
                
                for product_id in product_ids:
                    try:
                        self.update_product_stock(
                            product_id=product_id,
                            quantity_change=quantity_change,
                            movement_type=movement_type,
                            user_id=user_id,
                            notes=notes
                        )
                        updated_count += 1
                    except:
                        continue
                
                return updated_count
                
        except Exception as e:
            logger.error(f"Failed to bulk update stock: {e}")
            raise

# Singleton instance
_product_repo_instance = None

def get_product_repository() -> ProductRepository:
    """Get singleton product repository instance."""
    global _product_repo_instance
    if _product_repo_instance is None:
        _product_repo_instance = ProductRepository()
    return _product_repo_instance