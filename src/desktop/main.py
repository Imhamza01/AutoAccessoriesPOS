# src/desktop/main.py
"""
Desktop launcher - bundles FastAPI backend + PyWebView frontend into one .exe
"""

import os
import sys
import threading
import time
import socket
import traceback
from pathlib import Path

# ── Path resolution ──────────────────────────────────────────────────────────
if getattr(sys, "frozen", False):
    _BUNDLE = Path(sys._MEIPASS)
    # In --windowed mode stdout/stderr are None; redirect to devnull to prevent
    # any library from crashing on stream.write() or stream.isatty()
    import io
    if sys.stdout is None:
        sys.stdout = io.StringIO()
    if sys.stderr is None:
        sys.stderr = io.StringIO()
else:
    _BUNDLE = Path(__file__).parent.parent

BACKEND_PATH = _BUNDLE / "src" / "backend"
FRONTEND_PATH = _BUNDLE / "src" / "frontend"

# Put src/ on path so "backend.main" is importable as a package
_SRC = str(_BUNDLE / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

# Also put backend/ on path for intra-backend relative imports (core, api, etc.)
_BACK = str(BACKEND_PATH)
if _BACK not in sys.path:
    sys.path.insert(0, _BACK)

# Tell backend/main.py where the frontend lives
os.environ["FRONTEND_PATH"] = str(FRONTEND_PATH)

# ── Tkinter helpers ───────────────────────────────────────────────────────────
try:
    import tkinter as tk
    import tkinter.messagebox as _mb
    _TK = True
except ImportError:
    tk = None
    _TK = False


def _show_error(title, msg):
    try:
        log_path = (Path(sys.executable).parent if getattr(sys, "frozen", False)
                    else Path(__file__).parent) / "startup_error.log"
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(f"{title}\n\n{msg}\n")
    except Exception:
        pass
    if _TK:
        _mb.showerror(title, msg[:2000])
    else:
        print(f"ERROR: {title}\n{msg}", file=sys.stderr)


def _splash():
    if not _TK:
        return None, None
    root = tk.Tk()
    root.title("Auto Accessories POS")
    root.geometry("400x220")
    root.configure(bg="#0F172A")
    root.overrideredirect(True)
    root.update_idletasks()
    x = (root.winfo_screenwidth() - 400) // 2
    y = (root.winfo_screenheight() - 220) // 2
    root.geometry(f"400x220+{x}+{y}")
    tk.Label(root, text="Auto Accessories POS", font=("Arial", 20, "bold"),
             fg="white", bg="#0F172A").pack(pady=40)
    lbl = tk.Label(root, text="Starting server...", font=("Arial", 11),
                   fg="#94A3B8", bg="#0F172A")
    lbl.pack()
    root.update()
    return root, lbl


# ── Backend server ────────────────────────────────────────────────────────────
_server_error = None


def _start_server():
    global _server_error
    try:
        import uvicorn

        # Import backend.main as a package (src/ is on sys.path).
        # This avoids any collision with the desktop 'main' entry point.
        import importlib
        backend_mod = importlib.import_module("backend.main")
        app = backend_mod.app

        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            log_level="warning",
            access_log=False,
            log_config=None,  # prevents crash when stdout is None (--windowed exe)
        )
    except Exception:
        _server_error = traceback.format_exc()


def _wait_for_server(timeout=40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _server_error:
            return False
        try:
            with socket.create_connection(("127.0.0.1", 8000), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
    return False


# ── PyWebView window ──────────────────────────────────────────────────────────
def _open_window():
    import webview

    class Api:
        def select_file(self, file_types="All files (*.*)"):
            try:
                result = webview.windows[0].create_file_dialog(
                    webview.OPEN_DIALOG, allow_multiple=False,
                    file_types=(file_types, "All files (*.*)")
                )
                return result[0] if result else None
            except Exception:
                return None

    webview.create_window(
        "Auto Accessories POS System",
        url="http://127.0.0.1:8000",
        width=1366, height=768,
        resizable=True, min_size=(1024, 600),
        zoomable=True,
        js_api=Api()
    )
    webview.start(debug=False)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    splash, status_lbl = _splash()

    def _update(msg):
        if status_lbl:
            try:
                status_lbl.config(text=msg)
                splash.update()
            except Exception:
                pass

    _update("Starting backend server...")
    t = threading.Thread(target=_start_server, daemon=True)
    t.start()

    ready = _wait_for_server(40)

    if splash:
        try:
            splash.destroy()
        except Exception:
            pass

    if not ready:
        err = _server_error or "Server did not respond within 40 seconds."
        _show_error("Startup Error",
                    f"Backend server failed to start.\n\n{err}")
        return

    _open_window()


if __name__ == "__main__":
    main()
