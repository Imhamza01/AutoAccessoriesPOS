
# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path

a = Analysis(
    ['src/desktop/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('src/frontend', 'frontend'),
        ('src/backend', 'backend'),
        ('drivers', 'drivers'),
        ('docs', 'docs'),
        ('requirements.txt', '.'),
        ('README.md', '.'),
        ('LICENSE', '.'),
    ],
    hiddenimports=[
        # Core dependencies
        'fastapi',
        'fastapi.routing',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'pywebview',
        'sqlite3',
        
        # Pydantic and validation
        'pydantic',
        'pydantic.fields',
        'pydantic.main',
        'pydantic.types',
        'pydantic_core',
        'typing_extensions',
        
        # SQLAlchemy
        'sqlalchemy',
        'sqlalchemy.ext',
        'sqlalchemy.ext.declarative',
        'sqlalchemy.orm',
        'sqlalchemy.sql',
        
        # Starlette (FastAPI dependency)
        'starlette',
        'starlette.applications',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.responses',
        'starlette.routing',
        'starlette.staticfiles',
        
        # Other required packages
        'multipart',
        'python_multipart',
        'jose',
        'passlib',
        'passlib.handlers',
        'passlib.handlers.bcrypt',
        'bcrypt',
        'cryptography',
        'reportlab',
        'PIL',
        'openpyxl',
        'qrcode',
        'serial',
        'pytz',
        'dateutil',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=2,
)

# Exclude unnecessary packages to reduce size
excludes = [
    'numpy',
    'pandas',
    'matplotlib',
    'scipy',
    'tkinter',
    'test',
    'unittest',
    'pydoc',
]

for excl in excludes:
    try:
        a.excludes.append(excl)
    except:
        pass

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
    console=False,  # Set to True for debugging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# For Windows, create single executable
if sys.platform == 'win32':
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        strip=False,
        upx=True,
        upx_exclude=[],
        name='AutoAccessoriesPOS',
    )
