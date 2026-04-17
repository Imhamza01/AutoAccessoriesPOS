"""
BACKUP MANAGER - Automatic Database Backup System
"""

import os
import shutil
import datetime
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


class BackupManager:
    """Manages automatic and manual database backups."""
    
    def __init__(self, db_path: str, backup_dir: str = None):
        """
        Initialize backup manager.
        
        Args:
            db_path: Path to the main database file
            backup_dir: Directory to store backups (default: ./data/backups)
        """
        self.db_path = Path(db_path)
        self.backup_dir = Path(backup_dir) if backup_dir else Path.cwd() / "data" / "backups"
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
    def create_backup(self, prefix: str = "auto") -> str:
        """
        Create a database backup.
        
        Args:
            prefix: Prefix for the backup file name (e.g., 'auto', 'manual')
            
        Returns:
            Path to the created backup file
        """
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"{prefix}_backup_{timestamp}.db"
            backup_path = self.backup_dir / backup_filename
            
            # Copy database file
            if self.db_path.exists():
                shutil.copy2(self.db_path, backup_path)
                logger.info(f"Backup created: {backup_path}")
                return str(backup_path)
            else:
                logger.error(f"Database file not found: {self.db_path}")
                raise FileNotFoundError(f"Database file not found: {self.db_path}")
                
        except Exception as e:
            logger.error(f"Failed to create backup: {e}")
            raise
    
    def get_backups(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get list of backup files.
        
        Args:
            limit: Maximum number of backups to return
            
        Returns:
            List of backup information dictionaries
        """
        try:
            backups = []
            for backup_file in self.backup_dir.glob("*.db"):
                stat = backup_file.stat()
                backups.append({
                    "filename": backup_file.name,
                    "path": str(backup_file),
                    "size": stat.st_size,
                    "created_at": datetime.datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "modified_at": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
            
            # Sort by modification time (newest first)
            backups.sort(key=lambda x: x["modified_at"], reverse=True)
            
            return backups[:limit]
            
        except Exception as e:
            logger.error(f"Failed to get backups: {e}")
            return []
    
    def delete_backup(self, backup_path: str) -> bool:
        """
        Delete a backup file.
        
        Args:
            backup_path: Path to the backup file to delete
            
        Returns:
            True if deleted successfully
        """
        try:
            backup_file = Path(backup_path)
            if backup_file.exists() and backup_file.is_file():
                backup_file.unlink()
                logger.info(f"Backup deleted: {backup_path}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Failed to delete backup: {e}")
            raise
    
    def restore_backup(self, backup_path: str) -> bool:
        """
        Restore database from backup.
        
        Args:
            backup_path: Path to the backup file to restore from
            
        Returns:
            True if restored successfully
        """
        try:
            backup_file = Path(backup_path)
            if not backup_file.exists():
                raise FileNotFoundError(f"Backup file not found: {backup_path}")
            
            # Create a backup of current database before restoring
            if self.db_path.exists():
                self.create_backup(prefix="pre_restore")
            
            # Restore from backup
            shutil.copy2(backup_file, self.db_path)
            logger.info(f"Database restored from: {backup_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to restore backup: {e}")
            raise
    
    def cleanup_old_backups(self, days: int = 30, keep_minimum: int = 10) -> int:
        """
        Remove backups older than specified days.
        
        Args:
            days: Age in days for backups to be removed
            keep_minimum: Minimum number of backups to keep regardless of age
            
        Returns:
            Number of backups deleted
        """
        try:
            backups = self.get_backups(limit=1000)
            cutoff_date = datetime.datetime.now() - datetime.timedelta(days=days)
            deleted_count = 0
            
            # Keep at least keep_minimum backups
            if len(backups) <= keep_minimum:
                return 0
            
            for backup in backups[keep_minimum:]:  # Skip the newest keep_minimum backups
                backup_date = datetime.datetime.fromisoformat(backup["modified_at"])
                if backup_date < cutoff_date:
                    self.delete_backup(backup["path"])
                    deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} old backups")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup old backups: {e}")
            return 0
    
    def get_backup_size_info(self) -> Dict[str, Any]:
        """
        Get information about backup storage usage.
        
        Returns:
            Dictionary with backup size information
        """
        try:
            backups = self.get_backups(limit=1000)
            total_size = sum(b["size"] for b in backups)
            
            return {
                "total_backups": len(backups),
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "newest_backup": backups[0] if backups else None,
                "oldest_backup": backups[-1] if backups else None
            }
            
        except Exception as e:
            logger.error(f"Failed to get backup size info: {e}")
            return {
                "total_backups": 0,
                "total_size_bytes": 0,
                "total_size_mb": 0,
                "newest_backup": None,
                "oldest_backup": None
            }


# Global backup manager instance
_backup_manager = None


def get_backup_manager(db_path: str = None, backup_dir: str = None) -> BackupManager:
    """
    Get or create the global backup manager instance.
    
    Args:
        db_path: Path to the database file
        backup_dir: Path to backup directory
        
    Returns:
        BackupManager instance
    """
    global _backup_manager
    
    if _backup_manager is None:
        if db_path is None:
            # Default database path
            db_path = Path.cwd() / "data" / "database" / "pos_main.db"
        
        _backup_manager = BackupManager(db_path, backup_dir)
    
    return _backup_manager


def create_auto_backup(db_path: str = None) -> str:
    """
    Create an automatic backup (convenience function).
    
    Args:
        db_path: Path to the database file
        
    Returns:
        Path to the created backup
    """
    manager = get_backup_manager(db_path)
    return manager.create_backup(prefix="auto")
