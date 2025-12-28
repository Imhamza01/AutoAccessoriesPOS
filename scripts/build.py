# scripts/build.py
"""
BUILD SCRIPT - Creates single executable with PyInstaller
Includes embedded Python and all dependencies
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path
import json

def clean_build():
    """Clean previous builds."""
    build_dirs = ['dist', 'build', '__pycache__']
    for dir_name in build_dirs:
        if Path(dir_name).exists():
            shutil.rmtree(dir_name)
            print(f"Cleaned {dir_name}")

def copy_assets():
    """Copy all assets to build directory."""
    # Create dist directory
    dist_dir = Path("dist") / "AutoAccessoriesPOS"
    dist_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy frontend
    frontend_src = Path("src/frontend")
    frontend_dst = dist_dir / "frontend"
    if frontend_src.exists():
        shutil.copytree(frontend_src, frontend_dst, dirs_exist_ok=True)
    
    # Copy backend
    backend_src = Path("src/backend")
    backend_dst = dist_dir / "backend"
    if backend_src.exists():
        shutil.copytree(backend_src, backend_dst, dirs_exist_ok=True)
    
    # Copy drivers
    drivers_src = Path("drivers")
    drivers_dst = dist_dir / "drivers"
    if drivers_src.exists():
        shutil.copytree(drivers_src, drivers_dst, dirs_exist_ok=True)
    
    # Copy docs
    docs_src = Path("docs")
    docs_dst = dist_dir / "docs"
    if docs_src.exists():
        shutil.copytree(docs_src, docs_dst, dirs_exist_ok=True)
    
    print("Assets copied to dist directory")

def create_pyinstaller_spec():
    """Create PyInstaller spec file."""
    spec_content = '''
# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path

# Add current directory to path
sys.path.append(os.path.dirname(__file__))

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
        'fastapi',
        'uvicorn',
        'pywebview',
        'sqlite3',
        'pydantic',
        'typing_extensions',
        'backends',
        'backends.crypto',
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
    icon='assets/logo/icon.ico',
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
'''
    
    spec_file = Path("AutoAccessoriesPOS.spec")
    spec_file.write_text(spec_content)
    print(f"Created spec file: {spec_file}")
    return spec_file

def run_pyinstaller():
    """Run PyInstaller to create executable."""
    print("Running PyInstaller...")
    
    # Create spec file
    spec_file = create_pyinstaller_spec()
    
    # Run PyInstaller
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        spec_file.name
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print("PyInstaller completed successfully")
    except subprocess.CalledProcessError as e:
        print(f"PyInstaller failed: {e}")
        return False
    
    return True

def create_installer():
    """Create NSIS installer for Windows."""
    if sys.platform != 'win32':
        print("Skipping NSIS installer (non-Windows platform)")
        return True
    
    print("Creating NSIS installer...")
    
    # NSIS script content
    nsis_script = '''
; NSIS Installer Script for Auto Accessories POS

Unicode true
ManifestDPIAware true

!define APP_NAME "Auto Accessories POS"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "Auto Accessories POS"
!define APP_WEB_SITE "https://example.com"
!define APP_EXE "AutoAccessoriesPOS.exe"

; Include Modern UI
!include "MUI2.nsh"

; Installer attributes
Name "${APP_NAME}"
OutFile "AutoAccessoriesPOS_Setup.exe"
InstallDir "$PROGRAMFILES\\AutoAccessoriesPOS"
InstallDirRegKey HKLM "Software\\AutoAccessoriesPOS" "Install_Dir"
RequestExecutionLevel admin

; Modern UI Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "assets\\logo\\icon.ico"
!define MUI_UNICON "assets\\logo\\icon.ico"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

; Installer sections
Section "Main Section" SecMain
    SetOutPath "$INSTDIR"
    
    ; Copy all files
    File /r "dist\\AutoAccessoriesPOS\\*"
    
    ; Create desktop shortcut
    CreateShortCut "$DESKTOP\\${APP_NAME}.lnk" "$INSTDIR\\${APP_EXE}"
    
    ; Create start menu shortcut
    CreateDirectory "$SMPROGRAMS\\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk" "$INSTDIR\\${APP_EXE}"
    CreateShortCut "$SMPROGRAMS\\${APP_NAME}\\Uninstall.lnk" "$INSTDIR\\Uninstall.exe"
    
    ; Write installation info to registry
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}" \
        "DisplayName" "${APP_NAME}"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}" \
        "UninstallString" "$INSTDIR\\Uninstall.exe"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}" \
        "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}" \
        "Publisher" "${APP_PUBLISHER}"
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\\Uninstall.exe"
SectionEnd

; Uninstaller section
Section "Uninstall"
    ; Remove shortcuts
    Delete "$DESKTOP\\${APP_NAME}.lnk"
    Delete "$SMPROGRAMS\\${APP_NAME}\\*.*"
    RMDir "$SMPROGRAMS\\${APP_NAME}"
    
    ; Remove registry keys
    DeleteRegKey HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}"
    DeleteRegKey HKLM "Software\\AutoAccessoriesPOS"
    
    ; Remove application data
    SetShellVarContext current
    RMDir /r "$APPDATA\\AutoAccessoriesPOS"
    
    ; Remove installation directory
    RMDir /r "$INSTDIR"
SectionEnd

; Functions
Function .onInit
    ; Check if already installed
    ReadRegStr $R0 HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}" "UninstallString"
    StrCmp $R0 "" done
    
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
        "${APP_NAME} is already installed. $\n$\nClick OK to remove the previous version or Cancel to abort." \
        IDOK uninst
    Abort
    
    uninst:
        ClearErrors
        ExecWait '$R0 _?=$INSTDIR'
        
        IfErrors no_remove_uninstaller
        Goto done
        
    no_remove_uninstaller:
        MessageBox MB_OK|MB_ICONEXCLAMATION \
            "Could not remove previous installation. Please uninstall manually." \
            IDOK
        Abort
    
    done:
FunctionEnd
'''
    
    # Write NSIS script
    nsis_file = Path("installer.nsi")
    nsis_file.write_text(nsis_script)
    
    # Check if NSIS is installed
    try:
        subprocess.run(["makensis", "--version"], capture_output=True)
    except FileNotFoundError:
        print("NSIS not found. Please install NSIS to create installer.")
        return False
    
    # Run NSIS
    try:
        subprocess.run(["makensis", str(nsis_file)], check=True)
        print("NSIS installer created successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"NSIS failed: {e}")
        return False

def create_portable_version():
    """Create portable version (zip file)."""
    print("Creating portable version...")
    
    portable_dir = Path("dist") / "AutoAccessoriesPOS_Portable"
    portable_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy files from main dist
    source_dir = Path("dist") / "AutoAccessoriesPOS"
    if source_dir.exists():
        # Copy all files
        for item in source_dir.iterdir():
            if item.is_dir():
                shutil.copytree(item, portable_dir / item.name, dirs_exist_ok=True)
            else:
                shutil.copy2(item, portable_dir / item.name)
    
    # Create run.bat for portable version
    run_bat = portable_dir / "run.bat"
    run_bat.write_text('''
@echo off
echo Starting Auto Accessories POS System...
echo.
start AutoAccessoriesPOS.exe
''')
    
    # Create README for portable version
    readme = portable_dir / "README_Portable.txt"
    readme.write_text('''
Auto Accessories POS System - Portable Version

Instructions:
1. Extract this folder anywhere (USB drive, desktop, etc.)
2. Double-click run.bat to start the application
3. No installation required

Note: Application data will be stored in:
  Windows: %APPDATA%\\AutoAccessoriesPOS
  Other: ~/.autoaccessoriespos

To uninstall: Simply delete this folder
''')
    
    # Create zip file
    import zipfile
    zip_path = Path("dist") / "AutoAccessoriesPOS_Portable.zip"
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(portable_dir):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(portable_dir.parent)
                zipf.write(file_path, arcname)
    
    print(f"Portable version created: {zip_path}")

def main():
    """Main build function."""
    print("=" * 60)
    print("Building Auto Accessories POS System")
    print("=" * 60)
    
    # Step 1: Clean previous builds
    print("\n1. Cleaning previous builds...")
    clean_build()
    
    # Step 2: Copy assets
    print("\n2. Copying assets...")
    copy_assets()
    
    # Step 3: Run PyInstaller
    print("\n3. Creating executable with PyInstaller...")
    if not run_pyinstaller():
        print("Build failed at PyInstaller step")
        return False
    
    # Step 4: Create installer (Windows only)
    print("\n4. Creating installer...")
    create_installer()
    
    # Step 5: Create portable version
    print("\n5. Creating portable version...")
    create_portable_version()
    
    print("\n" + "=" * 60)
    print("BUILD COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print("\nOutput files:")
    print(f"  - Executable: dist/AutoAccessoriesPOS/AutoAccessoriesPOS.exe")
    print(f"  - Installer: AutoAccessoriesPOS_Setup.exe")
    print(f"  - Portable: dist/AutoAccessoriesPOS_Portable.zip")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)