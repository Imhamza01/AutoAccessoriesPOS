# src/backend/main.py - Update to include products router
"""
MAIN FASTAPI APPLICATION - Updated
"""

import os
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import logging

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from core.security import middleware
from core.logger import setup_logging
from api.auth import router as auth_router
from api.products import router as products_router  # Add this line

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="Auto Accessories POS System",
    description="Offline POS System for Pakistani Auto Accessories Shops",
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENV") == "development" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if os.getenv("ENV") == "development" else None,
    middleware=middleware
)

# Include routers
app.include_router(auth_router)
app.include_router(products_router)  # Add this line

# Mount static files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
else:
    logger.warning(f"Frontend directory not found: {frontend_path}")

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

# Import datetime
from datetime import datetime

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    logger.info("Starting Auto Accessories POS System...")
    
    # Initialize database
    try:
        from core.database import get_database_manager
        db_manager = get_database_manager()
        db_manager.initialize_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
    
    logger.info("Auto Accessories POS System started successfully")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    logger.info("Shutting down Auto Accessories POS System...")
    
    # Close database connections
    try:
        from core.database import get_database_manager
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