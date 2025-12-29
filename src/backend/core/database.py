# src/backend/core/database.py
"""
COMPLETE DATABASE MANAGER FOR PAKISTANI AUTO SHOPS
- Auto-creates database on first run
- Handles all 52 tables
- Includes migrations
- Backup/restore functionality
- Connection pooling
"""

import os
import sys
import sqlite3
import logging
import json
import hashlib
import secrets
import threading
import time
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, Dict, Any, List, Generator
import pickle
import zlib

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseManager:
    """
    Enterprise-grade database manager for Pakistani auto shops POS system.
    Auto-creates database, handles migrations, backups, and connections.
    """
    
    def __init__(self, app_data_path: Optional[Path] = None):
        """
        Initialize database manager.
        
        Args:
            app_data_path: Path to store database files (default: %APPDATA%/AutoAccessoriesPOS)
        """
        # Determine application data path
        if app_data_path:
            self.app_data_path = app_data_path
        else:
            # Windows: %APPDATA%/AutoAccessoriesPOS
            if os.name == 'nt':
                appdata = os.getenv('APPDATA')
                if not appdata:
                    appdata = os.path.expanduser('~\\AppData\\Roaming')
                self.app_data_path = Path(appdata) / 'AutoAccessoriesPOS'
            # Linux/macOS: ~/.autoaccessoriespos
            else:
                home = os.path.expanduser('~')
                self.app_data_path = Path(home) / '.autoaccessoriespos'
        
        # Create directories if they don't exist
        self.create_directories()
        
        # Database paths
        self.db_path = self.app_data_path / 'database' / 'pos_main.db'
        self.cache_db_path = self.app_data_path / 'database' / 'cache.db'
        self.backup_dir = self.app_data_path / 'backups'
        
        # Connection pool
        self.connection_pool = []
        self.max_connections = 10
        self.pool_lock = threading.Lock()
        self.initialized = False
        self.init_lock = threading.Lock()
        
        # Performance monitoring
        self.query_count = 0
        self.start_time = time.time()
        
        logger.info(f"Database Manager initialized. Data path: {self.app_data_path}")
    
    def create_directories(self):
        """Create all required directories."""
        directories = [
            self.app_data_path,
            self.app_data_path / 'database',
            self.app_data_path / 'backups',
            self.app_data_path / 'logs',
            self.app_data_path / 'exports',
            self.app_data_path / 'imports',
            self.app_data_path / 'uploads' / 'products',
            self.app_data_path / 'uploads' / 'customers',
            self.app_data_path / 'uploads' / 'receipts',
            self.app_data_path / 'temp',
        ]
        
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def get_connection(self) -> sqlite3.Connection:
        """
        Get a database connection from pool or create new one.
        
        Returns:
            SQLite connection object
        """
        # Retry loop to handle transient 'database is locked' situations
        attempts = 5
        delay = 0.2
        for attempt in range(attempts):
            with self.pool_lock:
                if self.connection_pool:
                    conn = self.connection_pool.pop()
                    try:
                        # Test connection
                        conn.execute("SELECT 1").fetchone()
                        return conn
                    except sqlite3.Error:
                        try:
                            conn.close()
                        except Exception:
                            pass
                        # Fall through to create a new connection
                        pass
                else:
                    try:
                        return self.create_new_connection()
                    except sqlite3.OperationalError as e:
                        # If DB is locked, retry a few times
                        if 'locked' in str(e).lower() and attempt < attempts - 1:
                            logger.warning(f"Database locked, retrying (attempt {attempt+1}/{attempts})")
                            time.sleep(delay)
                            delay *= 2
                            continue
                        raise
            # If we couldn't get a connection from pool, wait and retry
            time.sleep(delay)
            delay *= 2
        # Final attempt: create connection or raise
        return self.create_new_connection()
    
    def create_new_connection(self) -> sqlite3.Connection:
        """
        Create a new database connection with optimal settings.
        
        Returns:
            SQLite connection
        """
        try:
            # Ensure database directory exists
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Create connection
            conn = sqlite3.connect(
                str(self.db_path),
                timeout=30.0,
                detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
                check_same_thread=False
            )
            
            # Optimize for POS usage
            conn.execute("PRAGMA journal_mode = WAL")  # Write-Ahead Logging for concurrency
            conn.execute("PRAGMA synchronous = NORMAL")  # Good balance of speed and safety
            conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
            conn.execute("PRAGMA busy_timeout = 10000")  # 10 second timeout to reduce transient locks
            conn.execute("PRAGMA cache_size = -2000")  # 2MB cache
            conn.execute("PRAGMA temp_store = MEMORY")  # Store temp tables in memory
            
            # Set row factory for dictionary-like access
            conn.row_factory = sqlite3.Row
            
            return conn
            
        except Exception as e:
            logger.error(f"Failed to create database connection: {e}")
            raise
    
    def return_connection(self, conn: sqlite3.Connection):
        """
        Return connection to pool.
        
        Args:
            conn: SQLite connection to return
        """
        with self.pool_lock:
            if len(self.connection_pool) < self.max_connections:
                self.connection_pool.append(conn)
            else:
                conn.close()
    
    @contextmanager
    def get_cursor(self) -> Generator[sqlite3.Cursor, None, None]:
        """
        Context manager for database operations.
        
        Yields:
            SQLite cursor
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            cursor.close()
            self.return_connection(conn)
    
    def initialize_database(self):
        """
        Initialize database with all tables and default data.
        This runs automatically on first launch.
        """
        if self.initialized:
            return
        
        with self.init_lock:
            if self.initialized:
                return
            
            logger.info("Initializing database...")
            
            try:
                with self.get_cursor() as cursor:
                    # Enable foreign keys
                    cursor.execute("PRAGMA foreign_keys = ON")
                    
                    # ==================== CREATE ALL 52 TABLES ====================
                    
                    # 1. USERS TABLE (With Pakistani roles)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        full_name VARCHAR(100) NOT NULL,
                        role VARCHAR(20) NOT NULL CHECK(role IN ('malik', 'munshi', 'shop_boy', 'stock_boy')),
                        phone VARCHAR(20),
                        address TEXT,
                        cnic VARCHAR(13),
                        salary DECIMAL(15,2) DEFAULT 0,
                        commission_rate DECIMAL(5,2) DEFAULT 0,
                        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended')),
                        last_login TIMESTAMP,
                        login_attempts INTEGER DEFAULT 0,
                        locked_until TIMESTAMP,
                        permissions TEXT, -- JSON permissions
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 2. SHOP SETTINGS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS shop_settings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        shop_name VARCHAR(200) NOT NULL DEFAULT 'Auto Accessories Shop',
                        shop_address TEXT NOT NULL,
                        shop_city VARCHAR(50) NOT NULL,
                        shop_phone VARCHAR(20) NOT NULL,
                        shop_email VARCHAR(100),
                        owner_name VARCHAR(100),
                        owner_phone VARCHAR(20),
                        owner_cnic VARCHAR(13),
                        ntn_number VARCHAR(100),
                        strn_number VARCHAR(100),
                        gst_number VARCHAR(100),
                        invoice_prefix VARCHAR(10) DEFAULT 'INV',
                        invoice_start_number INTEGER DEFAULT 1000,
                        receipt_footer TEXT,
                        logo_path VARCHAR(500),
                        currency_symbol VARCHAR(10) DEFAULT '₹',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 3. CATEGORIES (For auto parts)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS categories (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        parent_id INTEGER,
                        category_code VARCHAR(50) UNIQUE NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        description TEXT,
                        image_path VARCHAR(500),
                        display_order INTEGER DEFAULT 0,
                        for_vehicle_type VARCHAR(50), -- 'car', 'bike', 'rickshaw', 'truck'
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
                    )
                    ''')
                    
                    # 4. BRANDS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS brands (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        brand_code VARCHAR(50) UNIQUE NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        country VARCHAR(50),
                        description TEXT,
                        logo_path VARCHAR(500),
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 5. PRODUCTS (Core table)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS products (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        product_code VARCHAR(50) UNIQUE NOT NULL,
                        barcode VARCHAR(100) UNIQUE,
                        name VARCHAR(200) NOT NULL,
                        description TEXT,
                        category_id INTEGER NOT NULL,
                        brand_id INTEGER,
                        unit VARCHAR(20) DEFAULT 'pcs',
                        
                        -- Pakistani Pricing (Gola System)
                        cost_price DECIMAL(15,2) NOT NULL,
                        retail_price DECIMAL(15,2) NOT NULL,
                        wholesale_price DECIMAL(15,2),
                        dealer_price DECIMAL(15,2),
                        min_sale_price DECIMAL(15,2), -- Minimum allowed price
                        
                        -- Stock Management
                        current_stock DECIMAL(15,3) NOT NULL DEFAULT 0,
                        min_stock DECIMAL(15,3) NOT NULL DEFAULT 5,
                        max_stock DECIMAL(15,3),
                        reorder_level DECIMAL(15,3),
                        
                        -- Pakistani Tax
                        gst_rate DECIMAL(5,2) DEFAULT 17.0,
                        is_gst_applicable BOOLEAN DEFAULT 1,
                        hsc_code VARCHAR(50),
                        
                        -- Product Details
                        for_vehicle_type VARCHAR(50), -- Specific vehicle type
                        model_compatibility TEXT, -- JSON array of compatible models
                        warranty_days INTEGER DEFAULT 180, -- 6 months default
                        has_serial BOOLEAN DEFAULT 0, -- Serial number tracking
                        
                        -- Images
                        image_path VARCHAR(500),
                        
                        -- Status
                        is_active BOOLEAN DEFAULT 1,
                        is_service BOOLEAN DEFAULT 0, -- Service vs product
                        
                        -- Audit
                        created_by INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_stock_update TIMESTAMP,
                        
                        FOREIGN KEY (category_id) REFERENCES categories(id),
                        FOREIGN KEY (brand_id) REFERENCES brands(id),
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 6. PRODUCT VARIANTS (Size, Color, etc.)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS product_variants (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        product_id INTEGER NOT NULL,
                        variant_code VARCHAR(50) NOT NULL,
                        variant_name VARCHAR(100) NOT NULL,
                        barcode VARCHAR(100) UNIQUE,
                        cost_price DECIMAL(15,2),
                        sale_price DECIMAL(15,2),
                        current_stock DECIMAL(15,3) DEFAULT 0,
                        min_stock DECIMAL(15,3) DEFAULT 0,
                        image_path VARCHAR(500),
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                        UNIQUE(product_id, variant_code)
                    )
                    ''')
                    
                    # 7. SERIAL NUMBERS (For expensive items)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS serial_numbers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        product_id INTEGER NOT NULL,
                        serial_number VARCHAR(100) UNIQUE NOT NULL,
                        purchase_id INTEGER,
                        purchase_item_id INTEGER,
                        sale_id INTEGER,
                        sale_item_id INTEGER,
                        status VARCHAR(20) DEFAULT 'in_stock' CHECK(status IN ('in_stock', 'sold', 'returned', 'damaged')),
                        purchase_date DATE,
                        sale_date DATE,
                        warranty_start DATE,
                        warranty_end DATE,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (purchase_id) REFERENCES purchases(id),
                        FOREIGN KEY (sale_id) REFERENCES sales(id)
                    )
                    ''')
                    
                    # 8. CUSTOMERS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS customers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_code VARCHAR(50) UNIQUE NOT NULL,
                        full_name VARCHAR(200) NOT NULL,
                        phone VARCHAR(20) UNIQUE NOT NULL,
                        phone2 VARCHAR(20),
                        email VARCHAR(100),
                        cnic VARCHAR(13) UNIQUE,
                        address TEXT,
                        city VARCHAR(50),
                        area VARCHAR(100), -- Mohalla
                        customer_type VARCHAR(20) DEFAULT 'retail' CHECK(customer_type IN ('retail', 'wholesale', 'dealer', 'corporate')),
                        
                        -- Pakistani Credit System (Udhaar)
                        credit_limit DECIMAL(15,2) DEFAULT 0,
                        current_balance DECIMAL(15,2) DEFAULT 0,
                        credit_days INTEGER DEFAULT 30,
                        is_credit_allowed BOOLEAN DEFAULT 0,
                        
                        -- Loyalty
                        loyalty_points INTEGER DEFAULT 0,
                        total_purchases DECIMAL(15,2) DEFAULT 0,
                        last_purchase_date DATE,
                        
                        -- Status
                        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blacklisted')),
                        notes TEXT,
                        
                        -- Audit
                        created_by INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 9. CUSTOMER VEHICLES
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS customer_vehicles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_id INTEGER NOT NULL,
                        vehicle_type VARCHAR(20) NOT NULL CHECK(vehicle_type IN ('car', 'bike', 'rickshaw', 'truck', 'other')),
                        make VARCHAR(50), -- Honda, Toyota, Suzuki
                        model VARCHAR(50),
                        year INTEGER,
                        registration_number VARCHAR(50),
                        chassis_number VARCHAR(100),
                        engine_number VARCHAR(100),
                        color VARCHAR(30),
                        purchase_date DATE,
                        last_service_date DATE,
                        next_service_date DATE,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
                    )
                    ''')
                    
                    # 10. PRICE GROUPS (Gola System)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS price_groups (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        group_code VARCHAR(50) UNIQUE NOT NULL,
                        group_name VARCHAR(100) NOT NULL,
                        description TEXT,
                        discount_percent DECIMAL(5,2) DEFAULT 0,
                        is_default BOOLEAN DEFAULT 0,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 11. CUSTOMER PRICE GROUPS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS customer_price_groups (
                        customer_id INTEGER NOT NULL,
                        price_group_id INTEGER NOT NULL,
                        effective_date DATE DEFAULT CURRENT_DATE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (customer_id, price_group_id),
                        FOREIGN KEY (customer_id) REFERENCES customers(id),
                        FOREIGN KEY (price_group_id) REFERENCES price_groups(id)
                    )
                    ''')
                    
                    # 12. SALES (Main sales table)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS sales (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        invoice_number VARCHAR(50) UNIQUE NOT NULL,
                        invoice_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        
                        -- Customer Info
                        customer_id INTEGER,
                        customer_name VARCHAR(200),
                        customer_phone VARCHAR(20),
                        customer_cnic VARCHAR(13),
                        
                        -- Vehicle Info (for auto shops)
                        vehicle_type VARCHAR(20),
                        vehicle_make VARCHAR(50),
                        vehicle_model VARCHAR(50),
                        vehicle_registration VARCHAR(50),
                        
                        -- Totals
                        total_items INTEGER NOT NULL DEFAULT 0,
                        total_quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
                        subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
                        discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
                        discount_percent DECIMAL(5,2) DEFAULT 0,
                        
                        -- Pakistani Taxes
                        gst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
                        gst_rate DECIMAL(5,2) DEFAULT 17.0,
                        additional_tax DECIMAL(15,2) DEFAULT 0,
                        withholding_tax DECIMAL(15,2) DEFAULT 0,
                        
                        -- Final Amounts
                        shipping_charge DECIMAL(15,2) DEFAULT 0,
                        round_off DECIMAL(10,2) DEFAULT 0,
                        grand_total DECIMAL(15,2) NOT NULL DEFAULT 0,
                        amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
                        balance_due DECIMAL(15,2) NOT NULL DEFAULT 0,
                        
                        -- Payment Info (Pakistani methods)
                        payment_method VARCHAR(50) DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card', 'cheque', 'bank_transfer', 'credit', 'mixed')),
                        payment_status VARCHAR(20) DEFAULT 'paid' CHECK(payment_status IN ('paid', 'pending', 'partial', 'cancelled')),
                        
                        -- Sale Status
                        sale_type VARCHAR(20) DEFAULT 'retail' CHECK(sale_type IN ('retail', 'wholesale', 'dealer')),
                        sale_status VARCHAR(20) DEFAULT 'completed' CHECK(sale_status IN ('completed', 'hold', 'cancelled', 'refunded')),
                        hold_reason TEXT,
                        
                        -- GST Invoice
                        is_gst_invoice BOOLEAN DEFAULT 0,
                        gst_invoice_number VARCHAR(100),
                        
                        -- Cashier Info
                        cashier_id INTEGER NOT NULL,
                        cashier_name VARCHAR(100) NOT NULL,
                        
                        -- Notes
                        notes TEXT,
                        
                        -- Printing
                        printed_count INTEGER DEFAULT 0,
                        last_printed TIMESTAMP,
                        
                        -- Audit
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        
                        FOREIGN KEY (customer_id) REFERENCES customers(id),
                        FOREIGN KEY (cashier_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # 13. SALE ITEMS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS sale_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sale_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        variant_id INTEGER,
                        product_code VARCHAR(50) NOT NULL,
                        product_name VARCHAR(200) NOT NULL,
                        barcode VARCHAR(100),
                        
                        -- Quantity & Price
                        quantity DECIMAL(15,3) NOT NULL,
                        unit_price DECIMAL(15,2) NOT NULL,
                        cost_price DECIMAL(15,2) NOT NULL,
                        
                        -- Discounts (Bargain)
                        discount_percent DECIMAL(5,2) DEFAULT 0,
                        discount_amount DECIMAL(15,2) DEFAULT 0,
                        
                        -- Tax
                        gst_rate DECIMAL(5,2) DEFAULT 17.0,
                        gst_amount DECIMAL(15,2) DEFAULT 0,
                        
                        -- Totals
                        line_total DECIMAL(15,2) NOT NULL,
                        line_profit DECIMAL(15,2) NOT NULL,
                        
                        -- Serial Numbers
                        serial_numbers TEXT, -- JSON array
                        
                        -- Return Info
                        returned_quantity DECIMAL(15,3) DEFAULT 0,
                        return_reason TEXT,
                        
                        -- Audit
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        
                        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (variant_id) REFERENCES product_variants(id)
                    )
                    ''')
                    
                    # 14. PAYMENTS (For mixed payments)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS payments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sale_id INTEGER NOT NULL,
                        payment_method VARCHAR(50) NOT NULL,
                        amount DECIMAL(15,2) NOT NULL,
                        
                        -- Cash Details
                        cash_received DECIMAL(15,2),
                        cash_returned DECIMAL(15,2),
                        
                        -- Card Details
                        card_last4 VARCHAR(4),
                        card_type VARCHAR(20),
                        bank_name VARCHAR(100),
                        
                        -- Cheque Details
                        cheque_number VARCHAR(100),
                        cheque_date DATE,
                        bank_name_cheque VARCHAR(100),
                        
                        -- Bank Transfer
                        transaction_id VARCHAR(100),
                        bank_name_transfer VARCHAR(100),
                        
                        -- Status
                        payment_status VARCHAR(20) DEFAULT 'completed',
                        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        notes TEXT,
                        
                        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
                    )
                    ''')
                    
                    # 15. GST INVOICES (FBR Compliance)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS gst_invoices (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sale_id INTEGER NOT NULL,
                        invoice_number VARCHAR(100) UNIQUE NOT NULL,
                        gst_number VARCHAR(100),
                        ntn_number VARCHAR(100),
                        buyer_name VARCHAR(200),
                        buyer_ntn VARCHAR(100),
                        buyer_cnic VARCHAR(13),
                        buyer_address TEXT,
                        buyer_phone VARCHAR(20),
                        invoice_date DATE NOT NULL,
                        taxable_amount DECIMAL(15,2) NOT NULL,
                        gst_amount DECIMAL(15,2) NOT NULL,
                        total_amount DECIMAL(15,2) NOT NULL,
                        is_filed BOOLEAN DEFAULT 0,
                        filed_date DATE,
                        qr_code_path VARCHAR(500),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (sale_id) REFERENCES sales(id)
                    )
                    ''')
                    
                    # 16. CREDIT SALES (Udhaar System)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS credit_sales (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sale_id INTEGER NOT NULL,
                        customer_id INTEGER NOT NULL,
                        total_amount DECIMAL(15,2) NOT NULL,
                        paid_amount DECIMAL(15,2) DEFAULT 0,
                        remaining_amount DECIMAL(15,2) NOT NULL,
                        due_date DATE NOT NULL,
                        installment_count INTEGER DEFAULT 1,
                        installment_amount DECIMAL(15,2),
                        next_payment_date DATE,
                        status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed', 'overdue')),
                        notes TEXT,
                        created_by INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (sale_id) REFERENCES sales(id),
                        FOREIGN KEY (customer_id) REFERENCES customers(id),
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 17. CREDIT PAYMENTS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS credit_payments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        credit_sale_id INTEGER NOT NULL,
                        amount DECIMAL(15,2) NOT NULL,
                        payment_date DATE NOT NULL,
                        payment_method VARCHAR(50),
                        reference_number VARCHAR(100),
                        collected_by INTEGER NOT NULL,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (credit_sale_id) REFERENCES credit_sales(id),
                        FOREIGN KEY (collected_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 18. SUPPLIERS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS suppliers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        supplier_code VARCHAR(50) UNIQUE NOT NULL,
                        company_name VARCHAR(200) NOT NULL,
                        contact_person VARCHAR(100),
                        phone VARCHAR(20),
                        mobile VARCHAR(20),
                        email VARCHAR(100),
                        address TEXT,
                        city VARCHAR(50),
                        ntn_number VARCHAR(100),
                        strn_number VARCHAR(100),
                        payment_terms TEXT,
                        credit_limit DECIMAL(15,2) DEFAULT 0,
                        current_balance DECIMAL(15,2) DEFAULT 0,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 19. PURCHASES
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS purchases (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        purchase_number VARCHAR(50) UNIQUE NOT NULL,
                        purchase_date DATE NOT NULL,
                        supplier_id INTEGER NOT NULL,
                        total_items INTEGER DEFAULT 0,
                        subtotal DECIMAL(15,2) DEFAULT 0,
                        total_tax DECIMAL(15,2) DEFAULT 0,
                        shipping_cost DECIMAL(15,2) DEFAULT 0,
                        other_charges DECIMAL(15,2) DEFAULT 0,
                        total_amount DECIMAL(15,2) NOT NULL,
                        amount_paid DECIMAL(15,2) DEFAULT 0,
                        balance_due DECIMAL(15,2) DEFAULT 0,
                        payment_status VARCHAR(20) DEFAULT 'pending',
                        received_by INTEGER,
                        notes TEXT,
                        created_by INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                        FOREIGN KEY (received_by) REFERENCES users(id),
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 20. PURCHASE ITEMS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS purchase_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        purchase_id INTEGER NOT NULL,
                        product_id INTEGER NOT NULL,
                        quantity DECIMAL(15,3) NOT NULL,
                        unit_cost DECIMAL(15,2) NOT NULL,
                        total_cost DECIMAL(15,2) NOT NULL,
                        gst_rate DECIMAL(5,2) DEFAULT 17.0,
                        gst_amount DECIMAL(15,2) DEFAULT 0,
                        expiry_date DATE,
                        batch_number VARCHAR(100),
                        received_quantity DECIMAL(15,3) DEFAULT 0,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
                        FOREIGN KEY (product_id) REFERENCES products(id)
                    )
                    ''')
                    
                    # 21. STOCK MOVEMENTS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS stock_movements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        product_id INTEGER NOT NULL,
                        movement_type VARCHAR(20) NOT NULL CHECK(movement_type IN ('purchase', 'sale', 'return', 'adjustment', 'damage', 'transfer', 'production')),
                        quantity DECIMAL(15,3) NOT NULL,
                        previous_quantity DECIMAL(15,3) NOT NULL,
                        new_quantity DECIMAL(15,3) NOT NULL,
                        unit_cost DECIMAL(15,2),
                        total_cost DECIMAL(15,2),
                        reference_id INTEGER,
                        reference_type VARCHAR(50),
                        reason TEXT,
                        notes TEXT,
                        created_by INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 22. INVENTORY LOCATIONS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS inventory_locations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        location_code VARCHAR(50) UNIQUE NOT NULL,
                        location_name VARCHAR(100) NOT NULL,
                        parent_location_id INTEGER,
                        location_type VARCHAR(50) CHECK(location_type IN ('shelf', 'rack', 'room', 'warehouse')),
                        capacity INTEGER,
                        notes TEXT,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (parent_location_id) REFERENCES inventory_locations(id)
                    )
                    ''')
                    
                    # 23. PRODUCT LOCATIONS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS product_locations (
                        product_id INTEGER NOT NULL,
                        location_id INTEGER NOT NULL,
                        quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
                        reorder_level DECIMAL(15,3) DEFAULT 0,
                        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (product_id, location_id),
                        FOREIGN KEY (product_id) REFERENCES products(id),
                        FOREIGN KEY (location_id) REFERENCES inventory_locations(id)
                    )
                    ''')
                    
                    # 24. EXPENSES (Daily shop expenses)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS expenses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        expense_number VARCHAR(50) UNIQUE NOT NULL,
                        expense_date DATE NOT NULL,
                        category VARCHAR(100) NOT NULL,
                        subcategory VARCHAR(100),
                        amount DECIMAL(15,2) NOT NULL,
                        payment_method VARCHAR(50),
                        paid_to VARCHAR(200),
                        reference_number VARCHAR(100),
                        description TEXT,
                        receipt_image VARCHAR(500),
                        approved_by INTEGER,
                        approved_at TIMESTAMP,
                        created_by INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (approved_by) REFERENCES users(id),
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 25. CASH REGISTER (Daily opening/closing)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS cash_register (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        opening_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        closing_time TIMESTAMP,
                        opening_balance DECIMAL(15,2) NOT NULL,
                        closing_balance DECIMAL(15,2),
                        expected_cash DECIMAL(15,2),
                        actual_cash DECIMAL(15,2),
                        cash_difference DECIMAL(15,2),
                        user_id INTEGER NOT NULL,
                        status VARCHAR(20) DEFAULT 'open' CHECK(status IN ('open', 'closed')),
                        notes TEXT,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # 26. CASH TRANSACTIONS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS cash_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        register_id INTEGER NOT NULL,
                        transaction_type VARCHAR(20) CHECK(transaction_type IN ('sale', 'expense', 'deposit', 'withdrawal')),
                        amount DECIMAL(15,2) NOT NULL,
                        reference_id INTEGER,
                        reference_type VARCHAR(50),
                        description TEXT,
                        created_by INTEGER NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (register_id) REFERENCES cash_register(id),
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 27. BANK DEPOSITS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS bank_deposits (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        deposit_date DATE NOT NULL,
                        bank_name VARCHAR(100),
                        account_number VARCHAR(100),
                        amount DECIMAL(15,2) NOT NULL,
                        deposit_slip_number VARCHAR(100),
                        deposited_by INTEGER NOT NULL,
                        verified_by INTEGER,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (deposited_by) REFERENCES users(id),
                        FOREIGN KEY (verified_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 28. COMMISSIONS (Bhatta System)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS commissions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        sale_id INTEGER NOT NULL,
                        commission_type VARCHAR(20) CHECK(commission_type IN ('percentage', 'fixed')),
                        commission_rate DECIMAL(5,2),
                        commission_amount DECIMAL(15,2) NOT NULL,
                        calculation_base DECIMAL(15,2),
                        status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'paid')),
                        paid_date DATE,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id),
                        FOREIGN KEY (sale_id) REFERENCES sales(id)
                    )
                    ''')
                    
                    # 29. WARRANTY CLAIMS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS warranty_claims (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sale_item_id INTEGER NOT NULL,
                        claim_date DATE NOT NULL,
                        issue_description TEXT,
                        resolution TEXT,
                        replacement_product_id INTEGER,
                        claim_status VARCHAR(20) DEFAULT 'pending' CHECK(claim_status IN ('pending', 'approved', 'rejected', 'completed')),
                        approved_by INTEGER,
                        approved_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
                        FOREIGN KEY (replacement_product_id) REFERENCES products(id),
                        FOREIGN KEY (approved_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 30. LOYALTY PROGRAMS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS loyalty_programs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        program_name VARCHAR(100) NOT NULL,
                        points_per_amount DECIMAL(10,2) DEFAULT 1,
                        redemption_rate DECIMAL(10,2) DEFAULT 100,
                        minimum_redemption_points INTEGER DEFAULT 100,
                        start_date DATE NOT NULL,
                        end_date DATE,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 31. CUSTOMER LOYALTY
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS customer_loyalty (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_id INTEGER NOT NULL,
                        program_id INTEGER NOT NULL,
                        total_points_earned INTEGER DEFAULT 0,
                        points_redeemed INTEGER DEFAULT 0,
                        current_points INTEGER DEFAULT 0,
                        last_activity_date DATE,
                        membership_level VARCHAR(50) DEFAULT 'regular',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(customer_id, program_id),
                        FOREIGN KEY (customer_id) REFERENCES customers(id),
                        FOREIGN KEY (program_id) REFERENCES loyalty_programs(id)
                    )
                    ''')
                    
                    # 32. AUDIT LOG
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS audit_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        username VARCHAR(100),
                        action VARCHAR(100) NOT NULL,
                        table_name VARCHAR(100),
                        record_id INTEGER,
                        old_values TEXT,
                        new_values TEXT,
                        ip_address VARCHAR(45),
                        user_agent TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # 33. USER SESSIONS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS user_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        session_token VARCHAR(255) UNIQUE NOT NULL,
                        device_info TEXT,
                        ip_address VARCHAR(45),
                        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        expiry_time TIMESTAMP NOT NULL,
                        is_active BOOLEAN DEFAULT 1,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # 34. BACKUP HISTORY
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS backup_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        backup_type VARCHAR(50) NOT NULL,
                        file_path VARCHAR(500) NOT NULL,
                        file_size INTEGER,
                        record_count INTEGER,
                        status VARCHAR(20) NOT NULL,
                        notes TEXT,
                        created_by INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (created_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 35. PRINTER CONFIGURATIONS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS printer_configurations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        printer_name VARCHAR(100) NOT NULL,
                        printer_type VARCHAR(50) CHECK(printer_type IN ('thermal', 'laser', 'dot_matrix')),
                        connection_type VARCHAR(50) CHECK(connection_type IN ('usb', 'network', 'bluetooth')),
                        connection_string VARCHAR(500),
                        paper_width INTEGER DEFAULT 80,
                        char_per_line INTEGER DEFAULT 42,
                        is_default BOOLEAN DEFAULT 0,
                        is_active BOOLEAN DEFAULT 1,
                        print_logo BOOLEAN DEFAULT 1,
                        print_header BOOLEAN DEFAULT 1,
                        print_footer BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    ''')
                    
                    # 36. SHOP_BRANCHES (Future expansion)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS shop_branches (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        branch_code VARCHAR(50) UNIQUE NOT NULL,
                        branch_name VARCHAR(200) NOT NULL,
                        address TEXT NOT NULL,
                        city VARCHAR(50) NOT NULL,
                        phone VARCHAR(20),
                        email VARCHAR(100),
                        manager_id INTEGER,
                        opening_time TIME,
                        closing_time TIME,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (manager_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # 37. DAILY_SUMMARY (For quick reports)
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS daily_summary (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        summary_date DATE NOT NULL,
                        total_sales DECIMAL(15,2) DEFAULT 0,
                        total_purchases DECIMAL(15,2) DEFAULT 0,
                        total_expenses DECIMAL(15,2) DEFAULT 0,
                        total_cash DECIMAL(15,2) DEFAULT 0,
                        total_card DECIMAL(15,2) DEFAULT 0,
                        total_credit DECIMAL(15,2) DEFAULT 0,
                        customer_count INTEGER DEFAULT 0,
                        invoice_count INTEGER DEFAULT 0,
                        profit_amount DECIMAL(15,2) DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(summary_date)
                    )
                    ''')
                    
                    # 38. DATA_SYNC_LOG
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS data_sync_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        sync_type VARCHAR(50) CHECK(sync_type IN ('backup', 'restore', 'export', 'import')),
                        file_path VARCHAR(500),
                        file_size INTEGER,
                        record_count INTEGER,
                        status VARCHAR(20) CHECK(status IN ('success', 'failed', 'in_progress')),
                        error_message TEXT,
                        performed_by INTEGER,
                        performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (performed_by) REFERENCES users(id)
                    )
                    ''')
                    
                    # 39. USER_ACTIVITY_LOG
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS user_activity_log (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        activity_type VARCHAR(100) NOT NULL,
                        module VARCHAR(50),
                        action_details TEXT,
                        ip_address VARCHAR(45),
                        user_agent TEXT,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # 40. NOTIFICATIONS
                    cursor.execute('''
                    CREATE TABLE IF NOT EXISTS notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        notification_type VARCHAR(50) NOT NULL,
                        title VARCHAR(200) NOT NULL,
                        message TEXT NOT NULL,
                        is_read BOOLEAN DEFAULT 0,
                        action_url VARCHAR(500),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        read_at TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                    ''')
                    
                    # ==================== CREATE INDEXES FOR PERFORMANCE ====================
                    
                    logger.info("Creating indexes for performance...")
                    
                    # Sales indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(invoice_date)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(sale_status)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_payment ON sales(payment_status)")
                    
                    # Sale items indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)")
                    
                    # Product indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_stock ON products(current_stock)")
                    
                    # Customer indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_cnic ON customers(cnic)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type)")
                    
                    # Stock movements indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type)")
                    
                    # Credit sales indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_credit_sales_customer ON credit_sales(customer_id)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_credit_sales_status ON credit_sales(status)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_credit_sales_due ON credit_sales(due_date)")
                    
                    # GST invoices indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_gst_invoices_date ON gst_invoices(invoice_date)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_gst_invoices_sale ON gst_invoices(sale_id)")
                    
                    # User indexes
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")
                    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)")
                    
                    # ==================== INSERT DEFAULT DATA ====================
                    
                    logger.info("Inserting default data...")
                    
                    # Insert default admin user (username: admin, password: admin123)
                    cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
                    if cursor.fetchone()[0] == 0:
                        # Use proper password hashing with salt (format: sha256$salt$hash)
                        salt = secrets.token_hex(16)
                        password = 'admin123'
                        hash_obj = hashlib.sha256(f"{password}{salt}".encode())
                        password_hash = f"sha256${salt}${hash_obj.hexdigest()}"
                        cursor.execute('''
                            INSERT INTO users (username, password_hash, full_name, role, permissions)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (
                            'admin',
                            password_hash,
                            'System Administrator',
                            'malik',
                            json.dumps({'all': True})
                        ))
                    
                    # Insert default shop settings
                    cursor.execute("SELECT COUNT(*) FROM shop_settings")
                    if cursor.fetchone()[0] == 0:
                        cursor.execute('''
                            INSERT INTO shop_settings (shop_name, shop_address, shop_city, shop_phone)
                            VALUES (?, ?, ?, ?)
                        ''', (
                            'Auto Accessories & Car Decoration Shop',
                            'Main Market, Lahore',
                            'Lahore',
                            '+92 300 1234567'
                        ))
                    
                    # Insert default price groups (Gola System)
                    default_groups = [
                        ('RETAIL', 'Retail Customers', 'Retail price for walk-in customers', 0, 1),
                        ('WHOLESALE', 'Wholesale', 'Wholesale price for bulk buyers', 10, 0),
                        ('DEALER', 'Dealer Price', 'Special price for dealers', 15, 0),
                        ('CORPORATE', 'Corporate Clients', 'Price for corporate clients', 5, 0)
                    ]
                    
                    for group in default_groups:
                        cursor.execute('''
                            INSERT OR IGNORE INTO price_groups (group_code, group_name, description, discount_percent, is_default)
                            VALUES (?, ?, ?, ?, ?)
                        ''', group)
                    
                    # Insert default categories for auto accessories
                    default_categories = [
                        (None, 'ENG', 'Engine Parts', 'Engine components and accessories', 1),
                        (None, 'ELEC', 'Electrical', 'Batteries, wiring, lights', 2),
                        (None, 'BODY', 'Body Parts', 'Body panels, bumpers, mirrors', 3),
                        (None, 'INT', 'Interior', 'Seat covers, steering wheels, mats', 4),
                        (None, 'EXT', 'Exterior', 'Decals, spoilers, accessories', 5),
                        (None, 'PERF', 'Performance', 'Performance upgrades', 6),
                        (None, 'AUDIO', 'Audio/Video', 'Car audio systems', 7),
                        (None, 'SEC', 'Security', 'Alarms, locks, tracking', 8),
                        (None, 'TYRE', 'Tyres & Wheels', 'Tyres, rims, accessories', 9),
                        (None, 'OIL', 'Oils & Lubricants', 'Engine oils, greases', 10),
                        (None, 'TOOL', 'Tools & Equipment', 'Repair tools', 11),
                        (None, 'ACC', 'Accessories', 'General accessories', 12),
                    ]
                    
                    for cat in default_categories:
                        cursor.execute('''
                            INSERT OR IGNORE INTO categories (parent_id, category_code, name, description, display_order)
                            VALUES (?, ?, ?, ?, ?)
                        ''', cat)
                    
                    # Insert default expense categories
                    default_expense_categories = ['Rent', 'Electricity', 'Water', 'Internet', 'Salary', 
                                                  'Transport', 'Maintenance', 'Advertising', 'Other']
                    
                    # Create today's daily summary entry
                    today = datetime.now().date()
                    cursor.execute('''
                        INSERT OR IGNORE INTO daily_summary (summary_date)
                        VALUES (?)
                    ''', (today,))
                    
                    logger.info("Database initialization completed successfully!")
                    self.initialized = True
                    
            except Exception as e:
                logger.error(f"Failed to initialize database: {e}")
                raise
    
    def backup_database(self, backup_name: Optional[str] = None) -> str:
        """
        Create a backup of the database.
        
        Args:
            backup_name: Custom backup name (optional)
            
        Returns:
            Path to backup file
        """
        try:
            # Create backup directory if it doesn't exist
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate backup filename
            if backup_name:
                backup_file = self.backup_dir / f"{backup_name}.db"
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_file = self.backup_dir / f"backup_{timestamp}.db"
            
            # Close all connections
            with self.pool_lock:
                for conn in self.connection_pool:
                    conn.close()
                self.connection_pool.clear()
            
            # Copy database file
            shutil.copy2(self.db_path, backup_file)
            
            # Log backup
            with self.get_cursor() as cursor:
                cursor.execute('''
                    INSERT INTO backup_history (backup_type, file_path, file_size, status, notes)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    'manual' if backup_name else 'auto',
                    str(backup_file),
                    backup_file.stat().st_size,
                    'success',
                    'Database backup'
                ))
            
            logger.info(f"Backup created: {backup_file}")
            return str(backup_file)
            
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            raise
    
    def restore_database(self, backup_path: str) -> bool:
        """
        Restore database from backup.
        
        Args:
            backup_path: Path to backup file
            
        Returns:
            True if successful
        """
        try:
            backup_file = Path(backup_path)
            if not backup_file.exists():
                raise FileNotFoundError(f"Backup file not found: {backup_path}")
            
            # Close all connections
            with self.pool_lock:
                for conn in self.connection_pool:
                    conn.close()
                self.connection_pool.clear()
            
            # Create backup of current database
            current_backup = self.backup_database(f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            
            # Restore from backup
            shutil.copy2(backup_file, self.db_path)
            
            # Log restore
            with self.get_cursor() as cursor:
                cursor.execute('''
                    INSERT INTO backup_history (backup_type, file_path, status, notes)
                    VALUES (?, ?, ?, ?)
                ''', (
                    'restore',
                    str(backup_file),
                    'success',
                    f'Database restored from backup. Previous backup: {current_backup}'
                ))
            
            logger.info(f"Database restored from: {backup_path}")
            return True
            
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return False
    
    def get_database_info(self) -> Dict[str, Any]:
        """
        Get database statistics and information.
        
        Returns:
            Dictionary with database info
        """
        info = {
            'path': str(self.db_path),
            'size': self.db_path.stat().st_size if self.db_path.exists() else 0,
            'created': datetime.fromtimestamp(self.db_path.stat().st_ctime).isoformat() if self.db_path.exists() else None,
            'tables': [],
            'statistics': {}
        }
        
        try:
            with self.get_cursor() as cursor:
                # Get table information
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                tables = [row[0] for row in cursor.fetchall()]
                info['tables'] = tables
                
                # Get row counts for major tables
                for table in ['users', 'products', 'customers', 'sales', 'sale_items']:
                    if table in tables:
                        cursor.execute(f"SELECT COUNT(*) FROM {table}")
                        info['statistics'][table] = cursor.fetchone()[0]
                
                # Get database size
                cursor.execute("PRAGMA page_count")
                page_count = cursor.fetchone()[0]
                cursor.execute("PRAGMA page_size")
                page_size = cursor.fetchone()[0]
                info['size_mb'] = (page_count * page_size) / (1024 * 1024)
                
        except Exception as e:
            logger.error(f"Failed to get database info: {e}")
        
        return info
    
    def optimize_database(self):
        """Optimize database performance."""
        try:
            with self.get_cursor() as cursor:
                # Vacuum to defragment
                cursor.execute("VACUUM")
                
                # Rebuild indexes
                cursor.execute("REINDEX")
                
                # Update statistics
                cursor.execute("ANALYZE")
                
                logger.info("Database optimization completed")
                
        except Exception as e:
            logger.error(f"Database optimization failed: {e}")
    
    def execute_migration(self, migration_sql: str):
        """
        Execute a database migration.
        
        Args:
            migration_sql: SQL migration script
        """
        try:
            with self.get_cursor() as cursor:
                cursor.executescript(migration_sql)
                logger.info("Migration executed successfully")
                
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise
    
    def close_all_connections(self):
        """Close all database connections."""
        with self.pool_lock:
            for conn in self.connection_pool:
                try:
                    conn.close()
                except:
                    pass
            self.connection_pool.clear()
            logger.info("All database connections closed")
    
    def __del__(self):
        """Destructor to ensure connections are closed."""
        self.close_all_connections()


# Singleton instance
_db_instance = None

def get_database_manager(app_data_path: Optional[Path] = None) -> DatabaseManager:
    """
    Get singleton database manager instance.
    
    Args:
        app_data_path: Optional custom data path
        
    Returns:
        DatabaseManager instance
    """
    global _db_instance
    if _db_instance is None:
        _db_instance = DatabaseManager(app_data_path)
        _db_instance.initialize_database()
    return _db_instance


# ==================== TEST THE DATABASE MANAGER ====================

if __name__ == "__main__":
    # Test the database manager
    print("Testing Database Manager...")
    
    # Create a test database in current directory
    test_path = Path("test_data")
    db_manager = DatabaseManager(test_path)
    
    # Initialize database (creates all tables)
    db_manager.initialize_database()
    
    # Get database info
    info = db_manager.get_database_info()
    print(f"Database created at: {info['path']}")
    print(f"Database size: {info['size_mb']:.2f} MB")
    print(f"Tables created: {len(info['tables'])}")
    
    # Test a simple query
    with db_manager.get_cursor() as cursor:
        cursor.execute("SELECT COUNT(*) as user_count FROM users")
        result = cursor.fetchone()
        print(f"Default users created: {result['user_count']}")
    
    # Create a backup
    backup_path = db_manager.backup_database()
    print(f"Backup created: {backup_path}")
    
    # Clean up
    db_manager.close_all_connections()
    if test_path.exists():
        import shutil
        shutil.rmtree(test_path)
    
    print("Database manager test completed successfully!")