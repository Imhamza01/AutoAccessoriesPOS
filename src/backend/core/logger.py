# src/backend/core/logger.py
"""
LOGGING SYSTEM FOR AUDIT TRAILS AND DEBUGGING
"""

import logging
import logging.handlers
import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any
import traceback

def setup_logging(log_dir: Optional[Path] = None):
    """
    Setup comprehensive logging system.
    
    Args:
        log_dir: Directory to store log files
    """
    if log_dir is None:
        # Default to app data directory
        if sys.platform == "win32":
            appdata = Path.home() / "AppData" / "Roaming" / "AutoAccessoriesPOS" / "logs"
        else:
            appdata = Path.home() / ".autoaccessoriespos" / "logs"
        log_dir = appdata
    
    # Create log directory
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # Console handler (for development)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_format = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)
    
    # Main application log (daily rotation)
    app_log_handler = logging.handlers.TimedRotatingFileHandler(
        log_dir / "app.log",
        when="midnight",
        interval=1,
        backupCount=30
    )
    app_log_handler.setLevel(logging.INFO)
    app_format = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    app_log_handler.setFormatter(app_format)
    logger.addHandler(app_log_handler)
    
    # Error log
    error_handler = logging.FileHandler(log_dir / "errors.log")
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(app_format)
    logger.addHandler(error_handler)
    
    # Audit log handler
    audit_handler = logging.FileHandler(log_dir / "audit.log")
    audit_handler.setLevel(logging.INFO)
    audit_format = logging.Formatter('%(asctime)s - AUDIT - %(message)s')
    audit_handler.setFormatter(audit_format)
    audit_handler.addFilter(lambda record: record.name == 'audit')
    logger.addHandler(audit_handler)
    
    # Security log handler
    security_handler = logging.FileHandler(log_dir / "security.log")
    security_handler.setLevel(logging.INFO)
    security_format = logging.Formatter('%(asctime)s - SECURITY - %(message)s')
    security_handler.setFormatter(security_format)
    security_handler.addFilter(lambda record: record.name == 'security')
    logger.addHandler(security_handler)
    
    # Database log handler
    db_handler = logging.FileHandler(log_dir / "database.log")
    db_handler.setLevel(logging.INFO)
    db_format = logging.Formatter('%(asctime)s - DATABASE - %(message)s')
    db_handler.setFormatter(db_format)
    db_handler.addFilter(lambda record: record.name == 'database')
    logger.addHandler(db_handler)

def audit_log(
    user_id: Optional[int],
    action: str,
    table_name: Optional[str],
    record_id: Optional[int],
    old_values: Optional[Dict],
    new_values: Optional[Dict],
    ip_address: Optional[str],
    user_agent: Optional[str]
):
    """
    Log audit trail to database and file.
    
    Args:
        user_id: User ID performing action
        action: Action performed
        table_name: Table affected
        record_id: Record ID affected
        old_values: Old values (for updates)
        new_values: New values
        ip_address: Client IP address
        user_agent: Client user agent
    """
    try:
        from core.database import get_database_manager
        
        db_manager = get_database_manager()
        
        with db_manager.get_cursor() as cursor:
            cursor.execute('''
                INSERT INTO audit_log 
                (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                user_id,
                action,
                table_name,
                record_id,
                json.dumps(old_values, default=str) if old_values else None,
                json.dumps(new_values, default=str) if new_values else None,
                ip_address,
                user_agent
            ))
        
        # Also log to audit log file
        audit_logger = logging.getLogger('audit')
        audit_logger.info(
            f"User:{user_id or 'System'} | "
            f"Action:{action} | "
            f"Table:{table_name or 'N/A'} | "
            f"Record:{record_id or 'N/A'} | "
            f"IP:{ip_address or 'N/A'}"
        )
        
    except Exception as e:
        logging.error(f"Failed to log audit trail: {e}")

def security_log(event: str, details: Dict[str, Any], ip_address: Optional[str] = None):
    """
    Log security-related events.
    
    Args:
        event: Security event type
        details: Event details
        ip_address: Client IP address
    """
    try:
        security_logger = logging.getLogger('security')
        log_message = f"Event:{event} | Details:{json.dumps(details)}"
        if ip_address:
            log_message += f" | IP:{ip_address}"
        security_logger.info(log_message)
        
    except Exception as e:
        logging.error(f"Failed to log security event: {e}")

def log_exception(exc: Exception, context: Optional[str] = None):
    """
    Log exception with context.
    
    Args:
        exc: Exception object
        context: Additional context information
    """
    try:
        logger = logging.getLogger(__name__)
        error_msg = f"Exception: {type(exc).__name__}: {str(exc)}"
        if context:
            error_msg += f" | Context: {context}"
        error_msg += f"\nTraceback:\n{traceback.format_exc()}"
        logger.error(error_msg)
        
    except Exception as e:
        print(f"Failed to log exception: {e}")
        print(f"Original exception: {exc}")

def log_database_query(query: str, params: tuple, execution_time: float):
    """
    Log database query for debugging.
    
    Args:
        query: SQL query
        params: Query parameters
        execution_time: Execution time in seconds
    """
    try:
        db_logger = logging.getLogger('database')
        # Truncate long queries
        if len(query) > 500:
            query_display = query[:500] + "..."
        else:
            query_display = query
        
        db_logger.info(
            f"Query: {query_display} | "
            f"Params: {params} | "
            f"Time: {execution_time:.4f}s"
        )
        
    except Exception:
        pass  # Don't fail if logging fails

# Initialize logging when module is imported
setup_logging()