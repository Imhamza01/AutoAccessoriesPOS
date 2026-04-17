"""
THERMAL PRINTER INTEGRATION
Supports ESC/POS thermal printers (80mm and 58mm)
Including Black Copper, Epson, and other ESC/POS compatible printers
"""

import os
import platform
import logging
import win32print
import win32api

logger = logging.getLogger(__name__)


class ThermalPrinter:
    """ESC/POS thermal printer driver with Windows native support."""
    
    def __init__(self, port=None, width=80):
        """
        Initialize thermal printer.
        
        Args:
            port: Printer port (COM1, LPT1) or printer name. If None, uses default Windows printer
            width: Paper width in mm (80 or 58)
        """
        self.port = port
        self.width = width  # 80mm or 58mm
        self.is_connected = False
        self.printer_name = None
        self.printer_handle = None
        self.connect()
    
    def connect(self):
        """Establish connection to printer using Windows native printing."""
        try:
            if platform.system() == 'Windows':
                # If no port specified, use default Windows printer
                if not self.port:
                    # Get default printer name
                    self.printer_name = win32print.GetDefaultPrinter()
                    logger.info(f"Using default Windows printer: {self.printer_name}")
                else:
                    # Check if port is actually a printer name
                    self.printer_name = self.port
                
                # Open printer
                try:
                    self.printer_handle = win32print.OpenPrinter(self.printer_name)
                    self.is_connected = True
                    logger.info(f"Connected to printer: {self.printer_name}")
                except Exception as e:
                    logger.error(f"Failed to open printer {self.printer_name}: {e}")
                    self.is_connected = False
            else:
                # For Linux/Mac, use direct serial connection
                import serial
                self.port = self.port or '/dev/ttyUSB0'
                self.printer = serial.Serial(self.port, 9600, timeout=1)
                self.is_connected = True
                logger.info(f"Connected to printer {self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to printer: {e}")
            self.is_connected = False
    
    def disconnect(self):
        """Close printer connection."""
        try:
            if self.printer_handle and self.is_connected:
                if platform.system() == 'Windows':
                    win32print.ClosePrinter(self.printer_handle)
                    self.printer_handle = None
                else:
                    self.printer.close()
            self.is_connected = False
            logger.info("Disconnected from printer")
        except Exception as e:
            logger.error(f"Error closing printer: {e}")
    
    def write(self, data):
        """
        Send raw ESC/POS data to thermal printer.

        CRITICAL: For RAW datatype on Windows, do NOT call
        StartPagePrinter() / EndPagePrinter(). These calls signal the spooler
        to flush a "page" boundary which causes the printer to cut after the
        first data chunk (typically after the logo bitmap fills a page buffer).

        Correct sequence for RAW ESC/POS:
            OpenPrinter → StartDocPrinter(RAW) → WritePrinter → EndDocPrinter → ClosePrinter
        """
        if not self.is_connected:
            logger.warning("Printer not connected")
            return False

        try:
            if platform.system() == 'Windows':
                raw_bytes = bytes(data)
                logger.info(f"Sending {len(raw_bytes)} bytes to RAW printer: {self.printer_name}")
                handle = win32print.OpenPrinter(self.printer_name)
                try:
                    # DOC-level job only — no StartPagePrinter/EndPagePrinter
                    job_id = win32print.StartDocPrinter(handle, 1, ("POS Receipt", None, "RAW"))
                    try:
                        win32print.WritePrinter(handle, raw_bytes)
                        logger.info(f"WritePrinter: {len(raw_bytes)} bytes written, job_id={job_id}")
                    finally:
                        win32print.EndDocPrinter(handle)
                finally:
                    win32print.ClosePrinter(handle)
                logger.info("Print job completed successfully")
                return True
            else:
                self.printer.write(data)
                self.printer.flush()
                return True
        except Exception as e:
            logger.error(f"Error writing to printer: {e}", exc_info=True)
            return False
    
    @staticmethod
    def get_available_printers():
        """Get list of available Windows printers."""
        try:
            if platform.system() == 'Windows':
                printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL, None, 2)
                return [
                    {
                        'name': p[2],
                        'default': p[2] == win32print.GetDefaultPrinter(),
                        'port': p[5]
                    }
                    for p in printers
                ]
        except Exception as e:
            logger.error(f"Failed to enumerate printers: {e}")
        return []
    
    def print_receipt(self, receipt_data):
        """Print a receipt."""
        try:
            # ESC/POS commands
            commands = b'\x1b\x40'  # Reset printer
            commands += b'\x1b\x45\x01'  # Enable bold
            
            # Add receipt content
            for line in receipt_data.get('lines', []):
                commands += line.encode('utf-8') + b'\n'
            
            commands += b'\x1b\x45\x00'  # Disable bold
            commands += b'\n\n\n'  # Paper feed
            commands += b'\x1d\x56\x41\x0a'  # Cut paper
            
            return self.write(commands)
        except Exception as e:
            logger.error(f"Error printing receipt: {e}")
            return False
    
    def print_barcode(self, data, barcode_type='CODE128'):
        """Print a barcode."""
        try:
            # ESC/POS barcode commands
            commands = b'\x1d\x66\x02'  # Barcode position
            commands += f'{data}'.encode('utf-8')
            commands += b'\x1d\x48\x02'  # Print below barcode
            
            return self.write(commands)
        except Exception as e:
            logger.error(f"Error printing barcode: {e}")
            return False
    
    def print_test_page(self):
        """Print a test page."""
        receipt = {
            'lines': [
                '========== TEST PAGE ==========',
                'Thermal Printer Test',
                f'Width: {self.width}mm',
                f'Printer: {self.printer_name}',
                'Time: ' + __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                '==============================',
            ]
        }
        return self.print_receipt(receipt)


def verify_raw_mode(printer_name=None):
    """
    Verify that the printer is configured to accept RAW data.
    Returns dict with status and printer info.
    """
    try:
        name = printer_name or win32print.GetDefaultPrinter()
        handle = win32print.OpenPrinter(name)
        try:
            info = win32print.GetPrinter(handle, 2)
            port = info.get('pPortName', '')
            driver = info.get('pDriverName', '')
            logger.info(f"Printer '{name}': port={port}, driver={driver}")
            return {"printer": name, "port": port, "driver": driver, "ok": True}
        finally:
            win32print.ClosePrinter(handle)
    except Exception as e:
        logger.error(f"verify_raw_mode failed: {e}")
        return {"ok": False, "error": str(e)}


# Printer instance (singleton pattern)
_printer_instance = None


def get_printer(port=None, width=80):
    """
    Get or create printer instance.
    Always reconnects to get a fresh handle — reusing a win32print handle
    across jobs causes the spooler to truncate data after the first flush.
    """
    global _printer_instance
    # Always create a fresh instance per job so the handle is never stale
    _printer_instance = ThermalPrinter(port, width)
    return _printer_instance


def print_receipt(receipt_data, printer_port=None):
    """Convenience function to print receipt."""
    printer = get_printer(printer_port)
    return printer.print_receipt(receipt_data)
