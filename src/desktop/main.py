# src/desktop/main.py
"""
MAIN DESKTOP LAUNCHER - Creates single executable with embedded Python
No external dependencies required on user's machine
"""

import os
import sys
import subprocess
import threading
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
import time

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

def check_requirements():
    """Check if all requirements are available."""
    # When running as frozen executable, packages are embedded - skip check
    if getattr(sys, 'frozen', False):
        print("Running as frozen executable - packages embedded")
        return True
    
    try:
        import sqlite3
        import fastapi
        import uvicorn
        import pywebview
        return True
    except ImportError as e:
        print(f"Missing requirement: {e}")
        return False

def start_backend():
    """Start FastAPI backend server."""
    try:
        from backend.main import app
        import uvicorn
        
        # Start server
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="warning",
            access_log=False
        )
    except Exception as e:
        print(f"Failed to start backend: {e}")
        raise

def start_frontend():
    """Start desktop application with PyWebView."""
    try:
        import webview
        
        class JsApi:
            def select_file(self, file_types="All files (*.*)"):
                """Open file dialog and return selected path."""
                try:
                    active_window = webview.windows[0]
                    # Format file_types for pywebview if needed, or pass as is
                    # user might pass "Image Files (*.png;*.jpg)"
                    # pywebview expects tuple of strings like ("Image Files (*.png;*.jpg)", "All files (*.*)")
                    
                    # For simplicity, we just pass the raw types
                    result = active_window.create_file_dialog(
                        webview.OPEN_DIALOG, 
                        allow_multiple=False, 
                        file_types=(file_types, "All files (*.*)")
                    )
                    return result[0] if result else None
                except Exception as e:
                    print(f"Error in select_file: {e}")
                    return None

        js_api = JsApi()
        
        # Create window
        window = webview.create_window(
            title="Auto Accessories POS System",
            url="http://127.0.0.1:8000",
            width=1366,
            height=768,
            resizable=True,
            fullscreen=False,
            min_size=(1024, 768),
            zoomable=True,
            js_api=js_api
        )
        
        # Start webview
        webview.start()
        
    except Exception as e:
        print(f"Failed to start frontend: {e}")
        raise

def show_splash_screen():
    """Show splash screen while loading."""
    splash = tk.Tk()
    splash.title("Auto Accessories POS")
    splash.geometry("400x300")
    splash.configure(bg="#0F172A")
    
    # Center window
    splash.update_idletasks()
    width = splash.winfo_width()
    height = splash.winfo_height()
    x = (splash.winfo_screenwidth() // 2) - (width // 2)
    y = (splash.winfo_screenheight() // 2) - (height // 2)
    splash.geometry(f"{width}x{height}+{x}+{y}")
    
    # Add content
    tk.Label(
        splash,
        text="Auto Accessories POS",
        font=("Arial", 24, "bold"),
        fg="white",
        bg="#0F172A"
    ).pack(pady=50)
    
    tk.Label(
        splash,
        text="Loading...",
        font=("Arial", 12),
        fg="#E5E7EB",
        bg="#0F172A"
    ).pack()
    
    # Progress bar
    progress = tk.Frame(splash, bg="#1E293B", height=5)
    progress.pack(fill=tk.X, padx=50, pady=50)
    
    def update_progress():
        for i in range(100):
            time.sleep(0.05)
            # Update progress bar width
            progress.config(width=int(i * 3))
            splash.update()
    
    # Start progress update in thread
    progress_thread = threading.Thread(target=update_progress)
    progress_thread.daemon = True
    progress_thread.start()
    
    return splash

def main():
    """Main entry point."""
    print("Starting Auto Accessories POS System...")
    
    # Check if running from executable
    if getattr(sys, 'frozen', False):
        # Running as executable
        base_path = Path(sys.executable).parent
        os.chdir(base_path)
    else:
        # Running from source
        base_path = Path(__file__).parent.parent
    
    # Show splash screen
    splash = show_splash_screen()
    
    try:
        # Check requirements
        if not check_requirements():
            splash.destroy()
            messagebox.showerror(
                "Error",
                "Required packages not found.\n"
                "Please install requirements:\n"
                "pip install fastapi uvicorn pywebview"
            )
            return
        
        # Start backend in separate thread
        backend_thread = threading.Thread(target=start_backend)
        backend_thread.daemon = True
        backend_thread.start()
        
        # Wait for backend to start
        time.sleep(3)
        
        # Close splash screen
        splash.destroy()
        
        # Start frontend
        start_frontend()
        
    except Exception as e:
        splash.destroy()
        messagebox.showerror(
            "Startup Error",
            f"Failed to start application:\n{str(e)}"
        )

if __name__ == "__main__":
    main()