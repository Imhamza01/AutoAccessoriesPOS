"""Hardware integrations for Auto Accessories POS."""

from .printers.thermal import get_printer, print_receipt
from .scanners.barcode import get_scanner, on_barcode_scanned
from .cash_drawer import get_cash_drawer, open_drawer

__all__ = [
    'get_printer',
    'print_receipt',
    'get_scanner',
    'on_barcode_scanned',
    'get_cash_drawer',
    'open_drawer',
]
