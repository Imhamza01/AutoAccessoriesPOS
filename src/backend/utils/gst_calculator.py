"""
GST Calculator for Pakistani Auto Accessories POS
Handles GST calculations, rate synchronization, and tax compliance.
"""

from typing import Union, Dict, Any
import logging

logger = logging.getLogger(__name__)

class GSTCalculator:
    """GST calculation and synchronization service."""
    
    def __init__(self, default_rate: float = 17.0):
        """
        Initialize GST calculator.
        
        Args:
            default_rate: Default GST rate in percentage (default 17% for Pakistan)
        """
        self.default_rate = default_rate
        self.current_rate = default_rate
        
    def set_rate(self, rate: float) -> None:
        """
        Update the current GST rate.
        
        Args:
            rate: New GST rate in percentage (e.g., 17.0 for 17%)
        """
        if rate < 0 or rate > 100:
            raise ValueError("GST rate must be between 0 and 100 percent")
        self.current_rate = rate
        logger.info(f"GST rate updated to {rate}%")
        
    def calculate_gst(self, amount: Union[float, int], rate: Union[float, int] = None) -> float:
        """
        Calculate GST amount for a given taxable amount.
        
        Args:
            amount: Taxable amount
            rate: GST rate in percentage (uses current rate if not specified)
            
        Returns:
            GST amount rounded to 2 decimal places
        """
        if rate is None:
            rate = self.current_rate
            
        try:
            gst_amount = float(amount) * float(rate) / 100.0
            return round(gst_amount, 2)
        except (ValueError, TypeError) as e:
            logger.error(f"Failed to calculate GST: {e}")
            return 0.0
            
    def calculate_total_with_gst(self, amount: Union[float, int], rate: Union[float, int] = None) -> float:
        """
        Calculate total amount including GST.
        
        Args:
            amount: Taxable amount
            rate: GST rate in percentage (uses current rate if not specified)
            
        Returns:
            Total amount including GST rounded to 2 decimal places
        """
        gst_amount = self.calculate_gst(amount, rate)
        total = float(amount) + gst_amount
        return round(total, 2)
        
    def calculate_taxable_amount(self, total_with_gst: Union[float, int], rate: Union[float, int] = None) -> float:
        """
        Calculate taxable amount from total including GST.
        
        Args:
            total_with_gst: Total amount including GST
            rate: GST rate in percentage (uses current rate if not specified)
            
        Returns:
            Taxable amount rounded to 2 decimal places
        """
        if rate is None:
            rate = self.current_rate
            
        try:
            # Formula: taxable = total / (1 + rate/100)
            taxable = float(total_with_gst) / (1 + float(rate) / 100.0)
            return round(taxable, 2)
        except (ValueError, TypeError, ZeroDivisionError) as e:
            logger.error(f"Failed to calculate taxable amount: {e}")
            return 0.0
            
    def get_gst_breakdown(self, items: list) -> Dict[str, Any]:
        """
        Calculate GST breakdown for a list of items.
        
        Args:
            items: List of dictionaries with 'price' and optional 'gst_rate' keys
            
        Returns:
            Dictionary with GST breakdown
        """
        total_taxable = 0.0
        total_gst = 0.0
        gst_by_rate = {}
        
        for item in items:
            price = float(item.get('price', 0))
            rate = float(item.get('gst_rate', self.current_rate))
            
            if rate not in gst_by_rate:
                gst_by_rate[rate] = {'taxable': 0.0, 'gst': 0.0}
                
            gst_amount = self.calculate_gst(price, rate)
            
            total_taxable += price
            total_gst += gst_amount
            gst_by_rate[rate]['taxable'] += price
            gst_by_rate[rate]['gst'] += gst_amount
            
        return {
            'total_taxable': round(total_taxable, 2),
            'total_gst': round(total_gst, 2),
            'grand_total': round(total_taxable + total_gst, 2),
            'gst_by_rate': gst_by_rate
        }
        
    def validate_gst_number(self, gst_number: str) -> bool:
        """
        Validate Pakistani GST number format.
        
        Args:
            gst_number: GST number to validate
            
        Returns:
            True if valid format, False otherwise
        """
        if not gst_number:
            return False
            
        # Basic validation for Pakistani GST number format
        # Actual validation would be more complex
        gst_number = gst_number.strip().upper()
        
        # Check length and format
        if len(gst_number) < 8 or len(gst_number) > 15:
            return False
            
        # Should contain alphanumeric characters
        if not gst_number.replace('-', '').isalnum():
            return False
            
        return True

# Global instance for convenience
gst_calculator = GSTCalculator()

# Helper functions for backward compatibility
def calculate_gst_amount(amount: Union[float, int], gst_rate: Union[float, int] = 17.0) -> float:
    """Calculate GST amount (backward compatibility)."""
    return gst_calculator.calculate_gst(amount, gst_rate)

def calculate_total_with_gst(amount: Union[float, int], gst_rate: Union[float, int] = 17.0) -> float:
    """Calculate total with GST (backward compatibility)."""
    return gst_calculator.calculate_total_with_gst(amount, gst_rate)