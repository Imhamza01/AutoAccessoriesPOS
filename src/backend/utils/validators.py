"""
Basic validators used by services and API endpoints.

These are minimal implementations to allow the backend to start.
They perform light checks and raise ValueError on invalid input.
"""
from typing import Dict, Any


def validate_product_data(data: Dict[str, Any]):
	if not isinstance(data, dict):
		raise ValueError("Product data must be an object")

	required = ["product_code", "name", "cost_price", "retail_price", "category_id"]
	for key in required:
		if key not in data:
			raise ValueError(f"Missing required field: {key}")

	if data.get("cost_price", 0) < 0 or data.get("retail_price", 0) < 0:
		raise ValueError("Prices must be non-negative")


def validate_category_data(data: Dict[str, Any]):
	if not isinstance(data, dict):
		raise ValueError("Category data must be an object")
	if not data.get("category_code"):
		raise ValueError("category_code is required")
	if not data.get("name"):
		raise ValueError("name is required")

