"""
PRINTER API ENDPOINTS - Direct thermal printing support
"""

import base64
from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Dict, Any, Optional
import logging

from core.auth import get_current_user, require_permission

router = APIRouter(prefix="/printers", tags=["printers"])
logger = logging.getLogger(__name__)


@router.post("/print", dependencies=[Depends(require_permission("pos.sell"))])
async def print_receipt(
    print_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Print receipt directly to thermal printer.
    
    Accepts ESC/POS commands in base64 format and sends them to the printer.
    Uses Windows default printer if no specific printer is configured.
    """
    try:
        commands_base64 = print_data.get("commands")
        printer_name = print_data.get("printer_name")  # Can be None for default printer
        
        if not commands_base64:
            raise HTTPException(status_code=400, detail="No print commands provided")
        
        # Decode base64 commands
        try:
            import base64
            commands = base64.b64decode(commands_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid commands format: {str(e)}")
        
        # Try to print using thermal printer integration
        try:
            from integrations.printers.thermal import get_printer
            
            # Get printer instance (uses default Windows printer if printer_name is None)
            printer = get_printer(printer_name)
            
            if not printer.is_connected:
                logger.error(f"Printer not connected: {printer_name or 'default'}")
                return {
                    "success": False,
                    "message": f"Printer not connected. Please check printer configuration."
                }
            
            # Send raw ESC/POS commands to printer
            success = printer.write(commands)
            
            if success:
                return {
                    "success": True,
                    "message": "Receipt sent to printer"
                }
            else:
                logger.error("Failed to send data to printer")
                return {
                    "success": False,
                    "message": "Failed to send data to printer"
                }
                
        except ImportError as e:
            logger.error(f"Thermal printer module not available: {e}")
            return {
                "success": False,
                "message": "Printer module not available"
            }
        except Exception as e:
            logger.error(f"Printer error: {e}")
            return {
                "success": False,
                "message": f"Printer error: {str(e)}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Print failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/print-html", dependencies=[Depends(require_permission("pos.sell"))])
async def print_html_receipt(
    data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Print an HTML receipt via OS default printer (for A4/non-thermal)."""
    import tempfile, os, time
    html_content = data.get("html", "")
    if not html_content:
        raise HTTPException(status_code=400, detail="No HTML content provided")
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w", encoding="utf-8") as f:
        f.write(html_content)
        tmp_path = f.name
    try:
        import win32api, win32con
        win32api.ShellExecute(0, "print", tmp_path, None, ".", win32con.SW_HIDE)
        return {"success": True}
    except Exception as e:
        logger.error(f"HTML print failed: {e}")
        return {"success": False, "message": str(e)}
    finally:
        time.sleep(5)
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.get("/status", dependencies=[Depends(require_permission("pos.sell"))])
async def get_printer_status(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get printer status and configuration."""
    try:
        from integrations.printers.thermal import ThermalPrinter
        
        # Get available printers
        available_printers = ThermalPrinter.get_available_printers()
        
        # Get current default printer
        import win32print
        default_printer = win32print.GetDefaultPrinter()
        
        return {
            "success": True,
            "default_printer": default_printer,
            "available_printers": available_printers,
            "printer_available": len(available_printers) > 0,
            "message": f"Found {len(available_printers)} printer(s). Default: {default_printer}"
        }
    except Exception as e:
        logger.error(f"Failed to get printer status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
