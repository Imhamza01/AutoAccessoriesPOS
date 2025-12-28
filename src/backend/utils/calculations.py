"""
Simple calculation helpers used by product service/frontend.

These implementations are intentionally small and safe.
"""
from typing import Union


def calculate_profit_margin(cost_price: Union[float, int], sale_price: Union[float, int]) -> float:
	try:
		cost = float(cost_price)
		sale = float(sale_price)
		if cost == 0:
			return 0.0
		return round(((sale - cost) / cost) * 100, 2)
	except Exception:
		return 0.0


def calculate_gst_amount(amount: Union[float, int], gst_rate: Union[float, int] = 17.0) -> float:
	try:
		return round(float(amount) * float(gst_rate) / 100.0, 2)
	except Exception:
		return 0.0
