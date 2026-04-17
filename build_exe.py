"""
Build script for Auto Accessories POS - creates standalone .exe
Run: python build_exe.py
Output: dist/AutoAccessoriesPOS.exe
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
BACKEND = SRC / "backend"
FRONTEND = SRC / "frontend"
DESKTOP = SRC / "desktop"
DIST = ROOT / "dist"
BUILD = ROOT / "build"


def clean():
    for d in [DIST, BUILD]:
        if d.exists():
            shutil.rmtree(d)
    spec = ROOT / "AutoAccessoriesPOS.spec"
    if spec.exists():
        spec.unlink()
    print("[Build] Cleaned previous build artifacts")


def run_pyinstaller():
    hidden_imports = [
        # Backend package (imported as backend.main from src/)
        "backend.main",
        "backend.core.security",
        "backend.core.logger",
        "backend.core.database",
        "backend.core.auth",
        "backend.core.cache",
        "backend.core.events",
        "backend.core.file_manager",
        "backend.core.backup_manager",
        "backend.api.auth",
        "backend.api.products",
        "backend.api.customers",
        "backend.api.sales",
        "backend.api.inventory",
        "backend.api.expenses",
        "backend.api.pos",
        "backend.api.reports",
        "backend.api.users",
        "backend.api.settings",
        "backend.api.customer_payments",
        "backend.api.credit_management",
        "backend.api.printers",
        "backend.api.base",
        "backend.models.base",
        "backend.models.user_models",
        "backend.models.product_models",
        "backend.models.customer_models",
        "backend.models.sales_models",
        "backend.models.financial_models",
        "backend.models.inventory_models",
        "backend.models.settings_models",
        "backend.models.gst_models",
        "backend.repositories.base_repo",
        "backend.repositories.user_repo",
        "backend.repositories.product_repo",
        "backend.repositories.customer_repo",
        "backend.repositories.sales_repo",
        "backend.repositories.pos_repo",
        "backend.services.pos_service",
        "backend.services.product_service",
        "backend.services.customer_service",
        "backend.services.sales_service",
        "backend.services.inventory_service",
        "backend.services.gst_service",
        "backend.services.pricing_service",
        "backend.services.commission_service",
        "backend.utils.calculations",
        "backend.utils.formatters",
        "backend.utils.validators",
        "backend.utils.invoice_generator",
        "backend.utils.receipt_printer",
        "backend.utils.barcode_generator",
        "backend.utils.gst_calculator",
        # Uvicorn
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        # FastAPI / Starlette
        "fastapi",
        "fastapi.staticfiles",
        "fastapi.middleware.cors",
        "starlette.staticfiles",
        "starlette.middleware.cors",
        # Async
        "anyio",
        "anyio._backends._asyncio",
        "anyio._backends._trio",
        # Auth / crypto
        "passlib",
        "passlib.handlers",
        "passlib.handlers.bcrypt",
        "passlib.handlers.sha2_crypt",
        "jose",
        "jose.jwt",
        # Data
        "multipart",
        "sqlalchemy",
        "alembic",
        "pydantic",
        "pydantic_settings",
        # Reporting
        "reportlab",
        "reportlab.pdfgen",
        "reportlab.lib",
        "openpyxl",
        "qrcode",
        "PIL",
        "PIL.Image",
        # Windows / hardware
        "win32api",
        "win32print",
        # UI
        "webview",
        "webview.platforms.winforms",
        "clr",
        "pythonnet",
        "tkinter",
        "tkinter.messagebox",
        # Stdlib
        "sqlite3",
        "email.mime.text",
        "email.mime.multipart",
        "logging.handlers",
    ]

    icon_path = SRC / "frontend" / "assets" / "icons" / "app.ico"

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name", "AutoAccessoriesPOS",
    ]

    if icon_path.exists():
        cmd += ["--icon", str(icon_path)]

    # Data files (frontend HTML/JS/CSS + backend source packages)
    cmd += ["--add-data", f"{FRONTEND};src/frontend"]
    cmd += ["--add-data", f"{BACKEND};src/backend"]
    cmd += ["--add-data", f"{SRC / '__init__.py'};src"]

    # Paths: ROOT so "src" is a package, BACKEND so intra-backend imports work
    cmd += ["--paths", str(ROOT)]
    cmd += ["--paths", str(SRC)]
    cmd += ["--paths", str(BACKEND)]

    # Hidden imports
    for hi in hidden_imports:
        cmd += ["--hidden-import", hi]

    # Entry point
    cmd.append(str(DESKTOP / "main.py"))

    print("[Build] Running PyInstaller...")
    result = subprocess.run(cmd, cwd=str(ROOT))
    return result.returncode == 0


def main():
    print("=" * 60)
    print("Auto Accessories POS - Build EXE")
    print("=" * 60)

    try:
        import PyInstaller
        print(f"[Build] PyInstaller {PyInstaller.__version__} found")
    except ImportError:
        print("[Build] Installing PyInstaller...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)

    clean()

    if run_pyinstaller():
        exe = DIST / "AutoAccessoriesPOS.exe"
        if exe.exists():
            size_mb = exe.stat().st_size / (1024 * 1024)
            print("\n" + "=" * 60)
            print("[Build] SUCCESS!")
            print(f"  Output: {exe}")
            print(f"  Size:   {size_mb:.1f} MB")
            print("=" * 60)
        else:
            print("[Build] WARNING: Build completed but .exe not found in dist/")
    else:
        print("\n[Build] FAILED. Check output above for errors.")
        sys.exit(1)


if __name__ == "__main__":
    main()
