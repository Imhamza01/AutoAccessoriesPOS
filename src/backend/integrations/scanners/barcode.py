"""
BARCODE SCANNER INTEGRATION
Supports USB and serial barcode scanners
"""

import logging
import threading
from typing import Callable

logger = logging.getLogger(__name__)


class BarcodeScanner:
    """Barcode scanner driver."""
    
    def __init__(self, port='COM2'):
        self.port = port
        self.is_listening = False
        self.callback = None
        self.scanner = None
        self.listener_thread = None
    
    def connect(self):
        """Connect to barcode scanner."""
        try:
            import serial
            self.scanner = serial.Serial(self.port, 9600, timeout=1)
            logger.info(f"Connected to barcode scanner on {self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to scanner: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from barcode scanner."""
        self.is_listening = False
        if self.scanner:
            self.scanner.close()
            logger.info("Disconnected from barcode scanner")
    
    def start_listening(self, callback: Callable[[str], None]):
        """Start listening for barcode scans."""
        self.callback = callback
        self.is_listening = True
        
        self.listener_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.listener_thread.start()
        
        logger.info("Started listening for barcode scans")
    
    def _listen_loop(self):
        """Internal method to listen for scans."""
        while self.is_listening:
            try:
                if self.scanner and self.scanner.in_waiting > 0:
                    barcode = self.scanner.readline().decode('utf-8').strip()
                    if barcode and self.callback:
                        self.callback(barcode)
            except Exception as e:
                logger.error(f"Error reading barcode: {e}")
    
    def stop_listening(self):
        """Stop listening for scans."""
        self.is_listening = False
        if self.listener_thread:
            self.listener_thread.join(timeout=1)
        logger.info("Stopped listening for barcode scans")


# Scanner instance (singleton pattern)
_scanner_instance = None


def get_scanner(port='COM2'):
    """Get or create scanner instance."""
    global _scanner_instance
    if _scanner_instance is None:
        _scanner_instance = BarcodeScanner(port)
        if not _scanner_instance.connect():
            logger.warning("Failed to connect to barcode scanner")
    return _scanner_instance


def on_barcode_scanned(barcode: str):
    """Callback handler for scanned barcodes."""
    logger.info(f"Barcode scanned: {barcode}")
    # This will be overridden by the application
