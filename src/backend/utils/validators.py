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


def validate_customer_data(data: Dict[str, Any]):
	"""Validate customer data."""
	if not isinstance(data, dict):
		raise ValueError("Customer data must be an object")
	if not data.get("name"):
		raise ValueError("Customer name is required")
	if not data.get("phone"):
		raise ValueError("Customer phone is required")


def validate_sale_data(data: Dict[str, Any]):
	"""Validate sale data."""
	if not isinstance(data, dict):
		raise ValueError("Sale data must be an object")
	if not data.get("items"):
		raise ValueError("Sale must have at least one item")
	if data.get("total_amount", 0) <= 0:
		raise ValueError("Sale total must be positive")


def validate_expense_data(data: Dict[str, Any]):
	"""Validate expense data."""
	if not isinstance(data, dict):
		raise ValueError("Expense data must be an object")
	if not data.get("category"):
		raise ValueError("Expense category is required")
	if data.get("amount", 0) <= 0:
		raise ValueError("Expense amount must be positive")


def validate_user_data(data: Dict[str, Any]):
	"""Validate user data."""
	if not isinstance(data, dict):
		raise ValueError("User data must be an object")
	if not data.get("username"):
		raise ValueError("Username is required")
	if not data.get("password"):
		raise ValueError("Password is required")
	if len(data.get("password", "")) < 6:
		raise ValueError("Password must be at least 6 characters")
