"""
Standalone Launcher for Auto Accessories POS
- Auto-backup database on startup
- Starts embedded server
- Opens GUI in PyWebView
- No external dependencies needed
"""

import os
import sys
import shutil
import threading
import time
import webbrowser
from pathlib import Path
from datetime import datetime

# Fix paths for PyInstaller
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    APPLICATION_PATH = Path(sys._MEIPASS)
    DATA_PATH = Path(os.environ.get('APPDATA', '.')) / 'AutoAccessoriesPOS' / 'data'
else:
    # Running as script
    APPLICATION_PATH = Path(__file__).parent.parent.parent
    DATA_PATH = APPLICATION_PATH / 'data'

# Ensure data directories exist
DATA_PATH.mkdir(parents=True, exist_ok=True)
(DATA_PATH / 'database').mkdir(exist_ok=True)
(DATA_PATH / 'backups').mkdir(exist_ok=True)
(DATA_PATH / 'logs').mkdir(exist_ok=True)

DB_PATH = DATA_PATH / 'database' / 'pos_main.db'
BACKUP_DIR = DATA_PATH / 'backups'

def auto_backup():
    """Create automatic backup before starting"""
    try:
        if DB_PATH.exists():
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = BACKUP_DIR / f'auto_backup_{timestamp}.db'
            
            shutil.copy2(DB_PATH, backup_file)
            print(f'[Backup] ✓ Created: {backup_file.name}')
            
            # Keep only last 10 backups
            backups = sorted(BACKUP_DIR.glob('auto_backup_*.db'))
            if len(backups) > 10:
                for old_backup in backups[:-10]:
                    old_backup.unlink()
                    print(f'[Backup] Deleted old: {old_backup.name}')
        else:
            print('[Backup] No database found, skipping backup')
    except Exception as e:
        print(f'[Backup] Warning: {e}')

def start_server():
    """Start the embedded uvicorn server"""
    import uvicorn
    import logging
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    print('\n[Server] Starting embedded server...')
    print('[Server] URL: http://127.0.0.1:8000')
    
    # Import and start the app
    sys.path.insert(0, str(APPLICATION_PATH / 'src' / 'backend'))
    
    from main import app
    
    uvicorn.run(
        app,
        host='127.0.0.1',
        port=8000,
        log_level='warning'
    )

def wait_for_server(max_wait=20):
    """Wait for server to be ready by polling the /health endpoint."""
    import urllib.request
    import urllib.error

    print('[Launcher] Waiting for server to be ready...')
    for i in range(max_wait):
        try:
            response = urllib.request.urlopen(
                'http://127.0.0.1:8000/health', timeout=2
            )
            if response.status == 200:
                print(f'[Launcher] ✓ Server ready after {i + 1}s')
                return True
        except urllib.error.URLError:
            pass  # Server not up yet
        except Exception as e:
            print(f'[Launcher] Health check error: {e}')
        time.sleep(1)

    print('[Launcher] ✗ Server did not start within 20 seconds')
    return False

def open_browser():
    """Open default browser to the app"""
    webbrowser.open('http://127.0.0.1:8000')
    print('[Launcher] ✓ Browser opened')

def main():
    """Main launcher function"""
    print('='*60)
    print('Auto Accessories POS - Standalone Edition')
    print('='*60)
    
    # Step 1: Auto backup
    print('\n[Step 1] Creating database backup...')
    auto_backup()
    
    # Step 2: Start server in background
    print('\n[Step 2] Starting server...')
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Step 3: Wait for server
    print('\n[Step 3] Waiting for server to be ready...')
    if not wait_for_server():
        print('ERROR: Server failed to start!')
        input('Press Enter to exit...')
        return
    
    # Step 4: Open browser
    print('\n[Step 4] Opening application...')
    open_browser()
    
    print('\n' + '='*60)
    print('✓ Application is running!')
    print('Browser: http://127.0.0.1:8000')
    print('Press Ctrl+C to stop the server')
    print('='*60)
    
    # Keep running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print('\n\n[Launcher] Shutting down...')
        sys.exit(0)

if __name__ == '__main__':
    main()
