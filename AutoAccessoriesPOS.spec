# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['D:\\AutoAccessoriesPOS\\src\\desktop\\main.py'],
    pathex=['D:\\AutoAccessoriesPOS', 'D:\\AutoAccessoriesPOS\\src', 'D:\\AutoAccessoriesPOS\\src\\backend'],
    binaries=[],
    datas=[('D:\\AutoAccessoriesPOS\\src\\frontend', 'src/frontend'), ('D:\\AutoAccessoriesPOS\\src\\backend', 'src/backend'), ('D:\\AutoAccessoriesPOS\\src\\__init__.py', 'src')],
    hiddenimports=['backend.main', 'backend.core.security', 'backend.core.logger', 'backend.core.database', 'backend.core.auth', 'backend.core.cache', 'backend.core.events', 'backend.core.file_manager', 'backend.core.backup_manager', 'backend.api.auth', 'backend.api.products', 'backend.api.customers', 'backend.api.sales', 'backend.api.inventory', 'backend.api.expenses', 'backend.api.pos', 'backend.api.reports', 'backend.api.users', 'backend.api.settings', 'backend.api.customer_payments', 'backend.api.credit_management', 'backend.api.printers', 'backend.api.base', 'backend.models.base', 'backend.models.user_models', 'backend.models.product_models', 'backend.models.customer_models', 'backend.models.sales_models', 'backend.models.financial_models', 'backend.models.inventory_models', 'backend.models.settings_models', 'backend.models.gst_models', 'backend.repositories.base_repo', 'backend.repositories.user_repo', 'backend.repositories.product_repo', 'backend.repositories.customer_repo', 'backend.repositories.sales_repo', 'backend.repositories.pos_repo', 'backend.services.pos_service', 'backend.services.product_service', 'backend.services.customer_service', 'backend.services.sales_service', 'backend.services.inventory_service', 'backend.services.gst_service', 'backend.services.pricing_service', 'backend.services.commission_service', 'backend.utils.calculations', 'backend.utils.formatters', 'backend.utils.validators', 'backend.utils.invoice_generator', 'backend.utils.receipt_printer', 'backend.utils.barcode_generator', 'backend.utils.gst_calculator', 'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on', 'fastapi', 'fastapi.staticfiles', 'fastapi.middleware.cors', 'starlette.staticfiles', 'starlette.middleware.cors', 'anyio', 'anyio._backends._asyncio', 'anyio._backends._trio', 'passlib', 'passlib.handlers', 'passlib.handlers.bcrypt', 'passlib.handlers.sha2_crypt', 'jose', 'jose.jwt', 'multipart', 'sqlalchemy', 'alembic', 'pydantic', 'pydantic_settings', 'reportlab', 'reportlab.pdfgen', 'reportlab.lib', 'openpyxl', 'qrcode', 'PIL', 'PIL.Image', 'win32api', 'win32print', 'webview', 'webview.platforms.winforms', 'clr', 'pythonnet', 'tkinter', 'tkinter.messagebox', 'sqlite3', 'email.mime.text', 'email.mime.multipart', 'logging.handlers'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='AutoAccessoriesPOS',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
