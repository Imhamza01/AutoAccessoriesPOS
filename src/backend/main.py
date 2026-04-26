# src/backend/main.py - Update to include products router
"""
MAIN FASTAPI APPLICATION - Updated
"""

import os
import sys
import mimetypes
import asyncio
from pathlib import Path
from datetime import datetime
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import logging

# Add backend directory to path for intra-package imports
_backend_dir = str(Path(__file__).parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from core.security import middleware
from core.logger import setup_logging
from api.auth import router as auth_router
from api.products import router as products_router
from api.customers import router as customers_router
from api.sales import router as sales_router
from api.inventory import router as inventory_router
from api.expenses import router as expenses_router
from api.pos import router as pos_router
from api.reports import router as reports_router
from api.users import router as users_router
from api.settings import router as settings_router
from api.customer_payments import router as customer_payments_router
from api.credit_management import router as credit_management_router
from api.printers import router as printers_router

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Create FastAPI application
try:
    from core.security import middleware
    app_middleware = middleware
except ImportError as e:
    logger.error(f"Failed to import security middleware: {e}")
    app_middleware = []
except Exception as e:
    logger.error(f"Error loading middleware: {e}")
    app_middleware = []

# Add explicit MIME type configuration before creating the app
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

app = FastAPI(
    title="Auto Accessories POS System",
    description="Offline POS System for Pakistani Auto Accessories Shops",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENV") == "development" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if os.getenv("ENV") == "development" else None,
    redirect_slashes=True  # Handle both /sales and /sales/
)

# Add middleware with error handling
if app_middleware and isinstance(app_middleware, dict):
    # Handle the new dictionary format of middleware
    try:
        # Add CORS middleware
        if 'cors' in app_middleware:
            cors_config = app_middleware['cors']['config']
            from fastapi.middleware.cors import CORSMiddleware
            app.add_middleware(
                CORSMiddleware,
                allow_origins=cors_config['allow_origins'],
                allow_credentials=cors_config['allow_credentials'],
                allow_methods=cors_config['allow_methods'],
                allow_headers=cors_config['allow_headers'],
            )
        
        # Add SecurityMiddleware
        if 'security' in app_middleware:
            app.add_middleware(app_middleware['security'])
        
        # Add RateLimitMiddleware
        if 'rate_limit' in app_middleware:
            rate_config = app_middleware['rate_limit']['config']
            app.add_middleware(app_middleware['rate_limit']['class'], 
                              max_requests=rate_config['max_requests'], 
                              window_seconds=rate_config['window_seconds'])
    except Exception as e:
        logger.error(f"Failed to add middleware: {e}")
elif app_middleware:
    # Handle legacy list format
    for mw in app_middleware:
        try:
            app.add_middleware(mw)
        except Exception as e:
            logger.error(f"Failed to add middleware {mw}: {e}")

# Include routers
app.include_router(auth_router)
app.include_router(products_router)
app.include_router(customers_router)
app.include_router(sales_router)
app.include_router(inventory_router)
app.include_router(expenses_router)
app.include_router(pos_router)
app.include_router(reports_router)
app.include_router(users_router)
app.include_router(settings_router)
app.include_router(customer_payments_router)
app.include_router(credit_management_router)
app.include_router(printers_router)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "auto_accessories_pos",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

# Mount uploads directory for user content (logos, etc)
# MUST be mounted before "/" catch-all to ensure it's matched first
from core.database import get_database_manager
db_manager = get_database_manager()
uploads_path = db_manager.app_data_path / "uploads"
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")
logger.info(f"Mounted /uploads to {uploads_path}")

# Mount static files (mounted after routes so API endpoints like /health take precedence)
# When running as a frozen exe, FRONTEND_PATH env var is set by desktop/main.py
_env_frontend = os.environ.get("FRONTEND_PATH")
if _env_frontend and Path(_env_frontend).exists():
    frontend_path = Path(_env_frontend)
else:
    frontend_path = Path(__file__).parent.parent / "frontend"

if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
else:
    logger.warning(f"Frontend directory not found: {frontend_path}")

# Startup event
async def schedule_hourly_backups():
    """Schedule automatic backups every hour."""
    while True:
        try:
            await asyncio.sleep(3600)  # Wait 1 hour (3600 seconds)

            from core.database import get_database_manager
            from core.backup_manager import create_auto_backup

            db_manager = get_database_manager()
            backup_name = f"auto_hourly_{datetime.now().strftime('%Y%m%d_%H%M')}"

            try:
                # Create backup
                backup_path = db_manager.backup_database(backup_name)

                # Also copy to local backups folder for user visibility
                if backup_path:
                    local_backups = Path.cwd() / "backups"
                    local_backups.mkdir(exist_ok=True)
                    import shutil
                    backup_file = Path(backup_path)
                    if backup_file.exists():
                        shutil.copy2(backup_file, local_backups / f"{backup_name}.db")
                        logger.info(f"Hourly auto-backup completed: {backup_name}")

            except Exception as e:
                logger.error(f"Hourly auto-backup failed: {e}")

        except Exception as e:
            logger.error(f"Hourly backup scheduler error: {e}")
            await asyncio.sleep(60)  # Wait 1 minute before retrying

@app.on_event("startup")
async def startup_event():
    """Initialize database and other startup tasks."""
    try:
        # Initialize database
        db_manager.initialize_database()

        # Fix: Correct Indian Rupee symbol to PKR for Pakistani shops
        try:
            with db_manager.get_cursor() as cur:
                cur.execute("""
                    UPDATE shop_settings
                    SET currency_symbol = 'PKR'
                    WHERE currency_symbol = '₹' OR currency_symbol = 'INR'
                """)
                if cur.rowcount > 0:
                    logger.info(f"Startup fix: Corrected currency symbol to PKR")
        except Exception as e:
            logger.error(f"Currency fix failed: {e}")

        # Fix: Activate products that were accidentally set inactive
        try:
            with db_manager.get_cursor() as cursor:
                cursor.execute("""
                    UPDATE products
                    SET is_active = 1
                    WHERE is_active = 0 OR is_active IS NULL
                """)
                rows = cursor.rowcount
                if rows > 0:
                    logger.info(f"Startup fix: Activated {rows} products that were incorrectly set to inactive")
        except Exception as e:
            logger.error(f"Startup product activation fix failed: {e}")

        # Ensure local backups directory exists (for user visibility)
        local_backups = Path.cwd() / "backups"
        local_backups.mkdir(exist_ok=True)
        
        # Perform Auto-Backup if not done today
        try:
            today_str = datetime.now().strftime("%Y%m%d")
            backup_name = f"auto_startup_{today_str}"
            
            # Check if auto backup already exists in history for today
            with db_manager.get_cursor() as cur:
                cur.execute("""
                    SELECT id FROM backup_history 
                    WHERE backup_type = 'auto' 
                    AND created_at LIKE ?
                """, (f"{datetime.now().strftime('%Y-%m-%d')}%",))
                exists = cur.fetchone()
                
            if not exists:
                logger.info("Performing daily auto-backup...")
                try:
                    # Backup to internal appdata first
                    internal_path_str = db_manager.backup_database(backup_name)
                    
                    # Also copy to local backups folder for user visibility
                    if internal_path_str:
                        import shutil
                        internal_path = Path(internal_path_str)
                        if internal_path.exists():
                            shutil.copy2(internal_path, local_backups / f"{backup_name}.db")
                            logger.info(f"Copied auto-backup to {local_backups}")
                except Exception as e:
                     logger.error(f"Backup copy failed: {e}")

                logger.info("Daily auto-backup completed")
                
        except Exception as e:
            logger.error(f"Auto-backup failed: {e}")
            # Don't fail startup just because backup failed

        # Start hourly backup task
        asyncio.create_task(schedule_hourly_backups())

        logger.info("Application startup complete")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Close database connections on shutdown."""
    try:
        from core.database import get_database_manager
        
        # Use default path (roaming AppData) to access original data
        db_manager = get_database_manager()
        
        db_manager.close_all_connections()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
    
    logger.info("Auto Accessories POS System shutdown complete")

# For running directly
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )