"""
THERMAL PRINTER INTEGRATION
Supports ESC/POS thermal printers (80mm and 58mm)
"""

import os
import platform
import logging

logger = logging.getLogger(__name__)


class ThermalPrinter:
    """ESC/POS thermal printer driver."""
    
    def __init__(self, port='COM1', width=80):
        self.port = port
        self.width = width  # 80mm or 58mm
        self.is_connected = False
        self.connect()
    
    def connect(self):
        """Establish connection to printer."""
        try:
            if platform.system() == 'Windows':
                import win32print
                self.printer = win32print.OpenPrinter(self.port)
                self.is_connected = True
                logger.info(f"Connected to printer {self.port}")
            else:
                # For Linux/Mac, use direct serial connection
                import serial
                self.printer = serial.Serial(self.port, 9600, timeout=1)
                self.is_connected = True
                logger.info(f"Connected to printer {self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to printer: {e}")
            self.is_connected = False
    
    def disconnect(self):
        """Close printer connection."""
        try:
            if self.printer:
                if platform.system() == 'Windows':
                    import win32print
                    win32print.ClosePrinter(self.printer)
                else:
                    self.printer.close()
            self.is_connected = False
            logger.info("Disconnected from printer")
        except Exception as e:
            logger.error(f"Error closing printer: {e}")
    
    def write(self, data):
        """Send raw data to printer."""
        if not self.is_connected:
            logger.warning("Printer not connected")
            return False
        
        try:
            if platform.system() == 'Windows':
                import win32print
                import win32api
                win32print.WritePrinter(self.printer, data)
            else:
                self.printer.write(data)
            return True
        except Exception as e:
            logger.error(f"Error writing to printer: {e}")
            return False
    
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
                'Width: {}mm'.format(self.width),
                'Time: ' + __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                '==============================',
            ]
        }
        return self.print_receipt(receipt)


# Printer instance (singleton pattern)
_printer_instance = None


def get_printer(port='COM1', width=80):
    """Get or create printer instance."""
    global _printer_instance
    if _printer_instance is None:
        _printer_instance = ThermalPrinter(port, width)
    return _printer_instance


def print_receipt(receipt_data, printer_port='COM1'):
    """Convenience function to print receipt."""
    printer = get_printer(printer_port)
    return printer.print_receipt(receipt_data)
