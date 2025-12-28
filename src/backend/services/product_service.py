# src/backend/services/product_service.py
"""
PRODUCT SERVICE - Business Logic Layer
Handles all product-related business logic
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import logging
import json

from repositories.product_repo import get_product_repository
from utils.validators import validate_product_data, validate_category_data
from utils.calculations import calculate_profit_margin, calculate_gst_amount
from core.logger import audit_log

logger = logging.getLogger(__name__)

class ProductService:
    """Service for product business logic"""
    
    def __init__(self):
        self.repo = get_product_repository()
    
    # ==================== CATEGORY BUSINESS LOGIC ====================
    
    def get_categories_tree(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get category tree for UI display."""
        try:
            categories = self.repo.get_all_categories(include_inactive)
            
            # Add hierarchical level information
            def add_levels(cat_list, level=0):
                for cat in cat_list:
                    cat['level'] = level
                    if 'children' in cat:
                        add_levels(cat['children'], level + 1)
            
            add_levels(categories)
            return categories
            
        except Exception as e:
            logger.error(f"Service: Failed to get categories tree: {e}")
            raise
    
    def create_category(self, category_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Create category with validation."""
        try:
            # Validate category data
            validate_category_data(category_data)
            
            # Check if category code already exists
            categories = self.repo.get_all_categories(include_inactive=True)
            existing_codes = [cat['category_code'].upper() for cat in categories]
            
            if category_data['category_code'].upper() in existing_codes:
                raise ValueError(f"Category code {category_data['category_code']} already exists")
            
            # Create category
            category = self.repo.create_category(category_data, user_id)
            
            # Log audit trail
            audit_log(
                user_id=user_id,
                action="create_category",
                table_name="categories",
                record_id=category['id'],
                old_values=None,
                new_values=category_data,
                ip_address=None,
                user_agent=None
            )
            
            return category
            
        except Exception as e:
            logger.error(f"Service: Failed to create category: {e}")
            raise
    
    def update_category(self, category_id: int, category_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Update category with validation."""
        try:
            # Get current category
            current_category = self.repo.get_category_by_id(category_id)
            if not current_category:
                raise ValueError(f"Category {category_id} not found")
            
            # Validate update data
            if 'category_code' in category_data:
                validate_category_data({'category_code': category_data['category_code']})
            
            # Update category
            updated_category = self.repo.update_category(category_id, category_data)
            
            # Log audit trail
            audit_log(
                user_id=user_id,
                action="update_category",
                table_name="categories",
                record_id=category_id,
                old_values=current_category,
                new_values=updated_category,
                ip_address=None,
                user_agent=None
            )
            
            return updated_category
            
        except Exception as e:
            logger.error(f"Service: Failed to update category: {e}")
            raise
    
    # ==================== PRODUCT BUSINESS LOGIC ====================
    
    def search_products(self, search_term: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search products by various criteria."""
        try:
            filters = {'search': search_term}
            result = self.repo.get_all_products(filters=filters, page=1, page_size=limit)
            
            # Calculate profit margins
            for product in result['products']:
                product['profit_margin'] = calculate_profit_margin(
                    product['cost_price'], 
                    product['retail_price']
                )
                
                # Add GST amount
                product['gst_amount'] = calculate_gst_amount(
                    product['retail_price'], 
                    product.get('gst_rate', 17.0)
                )
            
            return result['products']
            
        except Exception as e:
            logger.error(f"Service: Failed to search products: {e}")
            raise
    
    def get_product_for_pos(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Get product for POS with all necessary information."""
        try:
            # Try by product code
            product = self.repo.get_product_by_code(identifier)
            
            # If not found by code, try by barcode
            if not product:
                product = self.repo.get_product_by_code(identifier)
            
            if product:
                # Add pricing information for different customer types
                product['pricing'] = {
                    'retail': product['retail_price'],
                    'wholesale': product.get('wholesale_price') or product['retail_price'] * 0.9,
                    'dealer': product.get('dealer_price') or product['retail_price'] * 0.85,
                    'min_price': product.get('min_sale_price') or product['retail_price'] * 0.8
                }
                
                # Add GST information
                product['tax_info'] = {
                    'gst_rate': product.get('gst_rate', 17.0),
                    'is_gst_applicable': product.get('is_gst_applicable', True),
                    'tax_amount': calculate_gst_amount(
                        product['retail_price'], 
                        product.get('gst_rate', 17.0)
                    )
                }
                
                # Check stock availability
                product['stock_info'] = {
                    'current': product['current_stock'],
                    'min': product['min_stock'],
                    'status': 'in_stock' if product['current_stock'] > 0 else 'out_of_stock',
                    'warning': product['current_stock'] <= product['min_stock']
                }
            
            return product
            
        except Exception as e:
            logger.error(f"Service: Failed to get product for POS: {e}")
            raise
    
    def create_product(self, product_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Create product with business validation."""
        try:
            # Validate product data
            validate_product_data(product_data)
            
            # Check business rules
            self._validate_product_business_rules(product_data)
            
            # Create product
            product = self.repo.create_product(product_data, user_id)
            
            # Calculate initial metrics
            product['profit_margin'] = calculate_profit_margin(
                product['cost_price'], 
                product['retail_price']
            )
            
            product['markup_percentage'] = (
                (product['retail_price'] - product['cost_price']) / product['cost_price'] * 100
                if product['cost_price'] > 0 else 0
            )
            
            # Log audit trail
            audit_log(
                user_id=user_id,
                action="create_product",
                table_name="products",
                record_id=product['id'],
                old_values=None,
                new_values={k: v for k, v in product_data.items() if k not in ['created_by']},
                ip_address=None,
                user_agent=None
            )
            
            return product
            
        except Exception as e:
            logger.error(f"Service: Failed to create product: {e}")
            raise
    
    def _validate_product_business_rules(self, product_data: Dict[str, Any]):
        """Validate product business rules."""
        # Retail price must be >= cost price
        if product_data['retail_price'] < product_data['cost_price']:
            raise ValueError("Retail price cannot be less than cost price")
        
        # Min sale price validation
        min_sale_price = product_data.get('min_sale_price')
        if min_sale_price and min_sale_price > product_data['retail_price']:
            raise ValueError("Minimum sale price cannot be greater than retail price")
        
        if min_sale_price and min_sale_price < product_data['cost_price']:
            raise ValueError("Minimum sale price cannot be less than cost price")
        
        # Stock level validation
        min_stock = product_data.get('min_stock', 0)
        max_stock = product_data.get('max_stock')
        
        if max_stock and min_stock > max_stock:
            raise ValueError("Minimum stock cannot be greater than maximum stock")
        
        # GST rate validation (Pakistan specific)
        gst_rate = product_data.get('gst_rate', 17.0)
        if gst_rate < 0 or gst_rate > 100:
            raise ValueError("GST rate must be between 0 and 100")
    
    def update_product(self, product_id: int, product_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Update product with business validation."""
        try:
            # Get current product
            current_product = self.repo.get_product_by_id(product_id)
            if not current_product:
                raise ValueError(f"Product {product_id} not found")
            
            # Validate update data
            if any(field in product_data for field in ['retail_price', 'cost_price', 'min_sale_price']):
                temp_data = current_product.copy()
                temp_data.update(product_data)
                self._validate_product_business_rules(temp_data)
            
            # Update product
            updated_product = self.repo.update_product(product_id, product_data, user_id)
            
            # Recalculate profit margin
            updated_product['profit_margin'] = calculate_profit_margin(
                updated_product['cost_price'], 
                updated_product['retail_price']
            )
            
            # Log audit trail
            audit_log(
                user_id=user_id,
                action="update_product",
                table_name="products",
                record_id=product_id,
                old_values={k: current_product.get(k) for k in product_data.keys()},
                new_values=product_data,
                ip_address=None,
                user_agent=None
            )
            
            return updated_product
            
        except Exception as e:
            logger.error(f"Service: Failed to update product: {e}")
            raise
    
    def adjust_product_stock(self, product_id: int, adjustment_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Adjust product stock with business logic."""
        try:
            quantity = adjustment_data['quantity']
            movement_type = adjustment_data['movement_type']
            reason = adjustment_data.get('reason', 'Stock adjustment')
            reference_id = adjustment_data.get('reference_id')
            reference_type = adjustment_data.get('reference_type')
            
            # Validate adjustment
            if quantity == 0:
                raise ValueError("Quantity cannot be zero")
            
            # Perform stock adjustment
            result = self.repo.update_product_stock(
                product_id=product_id,
                quantity_change=quantity,
                movement_type=movement_type,
                reference_id=reference_id,
                reference_type=reference_type,
                user_id=user_id,
                notes=reason
            )
            
            # Get updated product
            product = self.repo.get_product_by_id(product_id)
            
            # Check if stock is now low
            if product['current_stock'] <= product['min_stock']:
                logger.warning(f"Product {product_id} is now low on stock: {product['current_stock']} units")
            
            # Log audit trail
            audit_log(
                user_id=user_id,
                action="adjust_stock",
                table_name="products",
                record_id=product_id,
                old_values={'current_stock': result['previous_stock']},
                new_values={'current_stock': result['new_stock']},
                ip_address=None,
                user_agent=None
            )
            
            return {
                **result,
                'product': product
            }
            
        except Exception as e:
            logger.error(f"Service: Failed to adjust product stock: {e}")
            raise
    
    def get_product_analytics(self, product_id: int, period_days: int = 30) -> Dict[str, Any]:
        """Get product analytics and performance metrics."""
        try:
            product = self.repo.get_product_by_id(product_id)
            if not product:
                raise ValueError(f"Product {product_id} not found")
            
            with self.repo.db_manager.get_cursor() as cursor:
                # Sales statistics for period
                cursor.execute('''
                    SELECT 
                        COUNT(DISTINCT si.sale_id) as sale_count,
                        SUM(si.quantity) as total_quantity_sold,
                        SUM(si.line_total) as total_revenue,
                        AVG(si.unit_price) as average_selling_price
                    FROM sale_items si
                    JOIN sales s ON si.sale_id = s.id
                    WHERE si.product_id = ? 
                    AND s.invoice_date >= DATE('now', ?)
                ''', (product_id, f'-{period_days} days'))
                
                sales_stats = dict(cursor.fetchone())
                
                # Stock movement analysis
                cursor.execute('''
                    SELECT 
                        movement_type,
                        SUM(quantity) as total_quantity,
                        COUNT(*) as movement_count
                    FROM stock_movements
                    WHERE product_id = ? 
                    AND created_at >= DATE('now', ?)
                    GROUP BY movement_type
                ''', (product_id, f'-{period_days} days'))
                
                stock_movements = [dict(row) for row in cursor.fetchall()]
                
                # Profit analysis
                total_cost = (sales_stats.get('total_quantity_sold', 0) or 0) * product['cost_price']
                total_revenue = sales_stats.get('total_revenue', 0) or 0
                gross_profit = total_revenue - total_cost
                
                # Customer purchase frequency
                cursor.execute('''
                    SELECT 
                        COUNT(DISTINCT s.customer_id) as unique_customers,
                        COUNT(*) as total_purchases
                    FROM sale_items si
                    JOIN sales s ON si.sale_id = s.id
                    WHERE si.product_id = ? 
                    AND s.customer_id IS NOT NULL
                    AND s.invoice_date >= DATE('now', ?)
                ''', (product_id, f'-{period_days} days'))
                
                customer_stats = dict(cursor.fetchone())
                
                return {
                    'product_id': product_id,
                    'product_name': product['name'],
                    'period_days': period_days,
                    'sales_statistics': sales_stats,
                    'stock_movements': stock_movements,
                    'profit_analysis': {
                        'total_revenue': total_revenue,
                        'total_cost': total_cost,
                        'gross_profit': gross_profit,
                        'profit_margin': (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
                    },
                    'customer_analysis': customer_stats,
                    'current_stock': product['current_stock'],
                    'stock_status': 'low' if product['current_stock'] <= product['min_stock'] else 'adequate'
                }
                
        except Exception as e:
            logger.error(f"Service: Failed to get product analytics: {e}")
            raise
    
    def bulk_import_products(self, products_data: List[Dict[str, Any]], user_id: int) -> Dict[str, Any]:
        """Bulk import products from CSV/Excel."""
        try:
            results = {
                'successful': 0,
                'failed': 0,
                'errors': [],
                'imported_products': []
            }
            
            for idx, product_data in enumerate(products_data):
                try:
                    # Validate product data
                    validate_product_data(product_data)
                    
                    # Check if product already exists
                    existing = self.repo.get_product_by_code(product_data.get('product_code', ''))
                    if existing:
                        # Update existing product
                        updated_product = self.repo.update_product(
                            existing['id'], 
                            product_data, 
                            user_id
                        )
                        results['imported_products'].append({
                            'action': 'updated',
                            'product': updated_product
                        })
                    else:
                        # Create new product
                        new_product = self.repo.create_product(product_data, user_id)
                        results['imported_products'].append({
                            'action': 'created',
                            'product': new_product
                        })
                    
                    results['successful'] += 1
                    
                except Exception as e:
                    results['failed'] += 1
                    results['errors'].append({
                        'row': idx + 1,
                        'error': str(e),
                        'data': product_data
                    })
            
            # Log bulk import
            audit_log(
                user_id=user_id,
                action="bulk_import_products",
                table_name="products",
                record_id=None,
                old_values=None,
                new_values={'import_count': results['successful']},
                ip_address=None,
                user_agent=None
            )
            
            return results
            
        except Exception as e:
            logger.error(f"Service: Failed to bulk import products: {e}")
            raise
    
    # ==================== PRICE MANAGEMENT ====================
    
    def calculate_discounted_price(self, product_id: int, 
                                  discount_percent: float = 0,
                                  discount_amount: float = 0,
                                  customer_type: str = 'retail') -> Dict[str, Any]:
        """Calculate discounted price for a product."""
        try:
            product = self.repo.get_product_by_id(product_id)
            if not product:
                raise ValueError(f"Product {product_id} not found")
            
            # Get base price based on customer type
            if customer_type == 'wholesale':
                base_price = product.get('wholesale_price') or product['retail_price'] * 0.9
            elif customer_type == 'dealer':
                base_price = product.get('dealer_price') or product['retail_price'] * 0.85
            else:
                base_price = product['retail_price']
            
            # Apply discount
            if discount_percent > 0:
                discount_amount = base_price * discount_percent / 100
            
            discounted_price = base_price - discount_amount
            
            # Ensure price doesn't go below minimum
            min_price = product.get('min_sale_price') or product['cost_price'] * 1.1
            final_price = max(discounted_price, min_price)
            
            # Calculate GST
            gst_rate = product.get('gst_rate', 17.0)
            gst_amount = calculate_gst_amount(final_price, gst_rate)
            total_with_gst = final_price + gst_amount
            
            return {
                'product_id': product_id,
                'product_name': product['name'],
                'base_price': base_price,
                'discount_percent': discount_percent,
                'discount_amount': discount_amount,
                'discounted_price': final_price,
                'min_allowed_price': min_price,
                'gst_rate': gst_rate,
                'gst_amount': gst_amount,
                'total_with_gst': total_with_gst,
                'profit_margin': calculate_profit_margin(product['cost_price'], final_price)
            }
            
        except Exception as e:
            logger.error(f"Service: Failed to calculate discounted price: {e}")
            raise
    
    def update_bulk_prices(self, update_data: Dict[str, Any], user_id: int) -> Dict[str, Any]:
        """Update prices for multiple products."""
        try:
            product_ids = update_data['product_ids']
            price_type = update_data['price_type']
            new_value = update_data['new_value']
            is_percentage = update_data.get('is_percentage', False)
            
            # Validate price type
            valid_price_types = ['retail_price', 'wholesale_price', 'dealer_price', 'cost_price']
            if price_type not in valid_price_types:
                raise ValueError(f"Invalid price type. Must be one of: {valid_price_types}")
            
            # Perform bulk update
            updated_count = self.repo.bulk_update_prices(
                product_ids, price_type, new_value, is_percentage
            )
            
            # Log audit trail
            audit_log(
                user_id=user_id,
                action="bulk_update_prices",
                table_name="products",
                record_id=None,
                old_values=None,
                new_values={
                    'product_count': updated_count,
                    'price_type': price_type,
                    'new_value': new_value,
                    'is_percentage': is_percentage
                },
                ip_address=None,
                user_agent=None
            )
            
            return {
                'updated_count': updated_count,
                'total_products': len(product_ids),
                'price_type': price_type
            }
            
        except Exception as e:
            logger.error(f"Service: Failed to update bulk prices: {e}")
            raise
    
    # ==================== STOCK ALERTS ====================
    
    def get_stock_alerts(self) -> Dict[str, Any]:
        """Get stock alerts for dashboard."""
        try:
            low_stock = self.repo.get_low_stock_products()
            out_of_stock = self.repo.get_out_of_stock_products()
            
            # Categorize alerts by severity
            alerts = {
                'critical': [],  # Out of stock
                'warning': [],   # Below minimum stock
                'info': []       # Near minimum stock
            }
            
            for product in out_of_stock:
                product['alert_level'] = 'critical'
                product['alert_message'] = 'Out of stock'
                alerts['critical'].append(product)
            
            for product in low_stock:
                if product['current_stock'] == 0:
                    continue  # Already in critical
                
                stock_percentage = (product['current_stock'] / product['min_stock']) * 100
                
                if stock_percentage <= 25:
                    product['alert_level'] = 'warning'
                    product['alert_message'] = f'Very low stock ({product["current_stock"]} units)'
                    alerts['warning'].append(product)
                else:
                    product['alert_level'] = 'info'
                    product['alert_message'] = f'Low stock ({product["current_stock"]} units)'
                    alerts['info'].append(product)
            
            return {
                'alerts': alerts,
                'total_alerts': len(alerts['critical']) + len(alerts['warning']) + len(alerts['info']),
                'critical_count': len(alerts['critical']),
                'warning_count': len(alerts['warning']),
                'info_count': len(alerts['info'])
            }
            
        except Exception as e:
            logger.error(f"Service: Failed to get stock alerts: {e}")
            raise
    
    # ==================== PRODUCT REPORTS ====================
    
    def generate_product_report(self, report_type: str, 
                               filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate product reports."""
        try:
            if report_type == 'stock_summary':
                return self._generate_stock_summary_report(filters)
            elif report_type == 'sales_performance':
                return self._generate_sales_performance_report(filters)
            elif report_type == 'profit_analysis':
                return self._generate_profit_analysis_report(filters)
            elif report_type == 'slow_moving':
                return self._generate_slow_moving_report(filters)
            else:
                raise ValueError(f"Unknown report type: {report_type}")
                
        except Exception as e:
            logger.error(f"Service: Failed to generate product report: {e}")
            raise
    
    def _generate_stock_summary_report(self, filters: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate stock summary report."""
        with self.repo.db_manager.get_cursor() as cursor:
            # Get stock summary by category
            cursor.execute('''
                SELECT 
                    c.name as category,
                    COUNT(p.id) as product_count,
                    SUM(p.current_stock) as total_stock,
                    SUM(p.current_stock * p.cost_price) as stock_value,
                    SUM(CASE WHEN p.current_stock <= p.min_stock THEN 1 ELSE 0 END) as low_stock_count,
                    SUM(CASE WHEN p.current_stock = 0 THEN 1 ELSE 0 END) as out_of_stock_count
                FROM products p
                JOIN categories c ON p.category_id = c.id
                WHERE p.is_active = 1
                GROUP BY c.id, c.name
                ORDER BY stock_value DESC
            ''')
            
            categories_summary = [dict(row) for row in cursor.fetchall()]
            
            # Get total summary
            cursor.execute('''
                SELECT 
                    COUNT(*) as total_products,
                    SUM(current_stock) as total_stock_units,
                    SUM(current_stock * cost_price) as total_stock_value,
                    SUM(CASE WHEN current_stock <= min_stock THEN 1 ELSE 0 END) as total_low_stock,
                    SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) as total_out_of_stock
                FROM products
                WHERE is_active = 1
            ''')
            
            total_summary = dict(cursor.fetchone())
            
            return {
                'report_type': 'stock_summary',
                'categories_summary': categories_summary,
                'total_summary': total_summary,
                'generated_at': datetime.now().isoformat()
            }
    
    def _generate_sales_performance_report(self, filters: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate sales performance report."""
        with self.repo.db_manager.get_cursor() as cursor:
            # Top selling products
            cursor.execute('''
                SELECT 
                    p.product_code,
                    p.name,
                    c.name as category,
                    SUM(si.quantity) as total_quantity_sold,
                    SUM(si.line_total) as total_revenue,
                    COUNT(DISTINCT si.sale_id) as sale_count,
                    AVG(si.unit_price) as average_price
                FROM sale_items si
                JOIN products p ON si.product_id = p.id
                JOIN categories c ON p.category_id = c.id
                JOIN sales s ON si.sale_id = s.id
                WHERE s.invoice_date >= DATE('now', '-30 days')
                GROUP BY p.id, p.product_code, p.name, c.name
                ORDER BY total_revenue DESC
                LIMIT 20
            ''')
            
            top_products = [dict(row) for row in cursor.fetchall()]
            
            # Sales trend by day
            cursor.execute('''
                SELECT 
                    DATE(s.invoice_date) as sale_date,
                    COUNT(DISTINCT s.id) as invoice_count,
                    SUM(si.quantity) as total_quantity,
                    SUM(si.line_total) as total_revenue
                FROM sales s
                JOIN sale_items si ON s.id = si.sale_id
                WHERE s.invoice_date >= DATE('now', '-30 days')
                GROUP BY DATE(s.invoice_date)
                ORDER BY sale_date
            ''')
            
            daily_trend = [dict(row) for row in cursor.fetchall()]
            
            return {
                'report_type': 'sales_performance',
                'top_products': top_products,
                'daily_trend': daily_trend,
                'period_days': 30,
                'generated_at': datetime.now().isoformat()
            }

# Singleton instance
_product_service_instance = None

def get_product_service() -> ProductService:
    """Get singleton product service instance."""
    global _product_service_instance
    if _product_service_instance is None:
        _product_service_instance = ProductService()
    return _product_service_instance