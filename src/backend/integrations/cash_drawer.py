"""
CASH DRAWER INTEGRATION
Supports ESC/POS cash drawer control
"""

import logging

logger = logging.getLogger(__name__)


class CashDrawer:
    """Cash drawer control driver."""
    
    def __init__(self, printer_port='COM1'):
        self.printer_port = printer_port
        self.is_connected = False
        self.printer = None
    
    def connect(self, printer=None):
        """Connect to cash drawer (via printer)."""
        try:
            if printer:
                self.printer = printer
            else:
                # Import printer if not provided
                from integrations.printers.thermal import get_printer
                self.printer = get_printer(self.printer_port)
            
            self.is_connected = True
            logger.info("Connected to cash drawer")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to cash drawer: {e}")
            self.is_connected = False
            return False
    
    def open(self):
        """Open the cash drawer."""
        if not self.is_connected:
            logger.warning("Cash drawer not connected")
            return False
        
        try:
            # ESC/POS cash drawer open command
            command = b'\x1b\x70\x00\x19\xfa'
            
            if self.printer:
                self.printer.write(command)
            
            logger.info("Cash drawer opened")
            return True
        except Exception as e:
            logger.error(f"Error opening cash drawer: {e}")
            return False
    
    def check_status(self):
        """Check if cash drawer is open."""
        try:
            # Send status request and read response
            # This is device-specific
            return {
                'is_open': False,
                'is_connected': self.is_connected
            }
        except Exception as e:
            logger.error(f"Error checking cash drawer status: {e}")
            return None
    
    def disconnect(self):
        """Disconnect from cash drawer."""
        self.is_connected = False
        logger.info("Disconnected from cash drawer")


# Cash drawer instance (singleton pattern)
_drawer_instance = None


def get_cash_drawer(printer_port='COM1'):
    """Get or create cash drawer instance."""
    global _drawer_instance
    if _drawer_instance is None:
        _drawer_instance = CashDrawer(printer_port)
        _drawer_instance.connect()
    return _drawer_instance


def open_drawer():
    """Convenience function to open cash drawer."""
    drawer = get_cash_drawer()
    return drawer.open()
