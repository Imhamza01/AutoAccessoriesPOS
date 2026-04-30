import sqlite3
import datetime
from datetime import timedelta

# Connect to the database
conn = sqlite3.connect('data/database/pos_main.db')
c = conn.cursor()

# Get today and yesterday dates
today = datetime.date.today()
yesterday = today - timedelta(days=1)

print(f"Today's date: {today}")
print(f"Yesterday's date: {yesterday}")

# Today's sales
c.execute("""
    SELECT COUNT(*) as transactions, SUM(grand_total) as total_sales,
           COUNT(DISTINCT customer_id) as unique_customers
    FROM sales 
    WHERE DATE(created_at) = ? AND sale_status != 'cancelled'
""", (today,))
today_data = c.fetchone()

# Yesterday's sales
c.execute("""
    SELECT COUNT(*) as transactions, SUM(grand_total) as total_sales,
           COUNT(DISTINCT customer_id) as unique_customers
    FROM sales 
    WHERE DATE(created_at) = ? AND sale_status != 'cancelled'
""", (yesterday,))
yesterday_data = c.fetchone()

# Calculate metrics
today_sales = today_data[1] or 0
yesterday_sales = yesterday_data[1] or 0
today_transactions = today_data[0] or 0
yesterday_transactions = yesterday_data[0] or 0
today_customers = today_data[2] or 0
yesterday_customers = yesterday_data[2] or 0

print(f"\nToday's sales:")
print(f"  Transactions: {today_transactions}")
print(f"  Total sales: {today_sales}")
print(f"  Unique customers: {today_customers}")

print(f"\nYesterday's sales:")
print(f"  Transactions: {yesterday_transactions}")
print(f"  Total sales: {yesterday_sales}")
print(f"  Unique customers: {yesterday_customers}")

# Calculate percentage changes
sales_change = ((today_sales - yesterday_sales) / yesterday_sales * 100) if yesterday_sales > 0 else 0
customer_change = ((today_customers - yesterday_customers) / yesterday_customers * 100) if yesterday_customers > 0 else 0

# Average bill values
avg_bill_today = (today_sales / today_transactions) if today_transactions > 0 else 0
avg_bill_yesterday = (yesterday_sales / yesterday_transactions) if yesterday_transactions > 0 else 0
avg_bill_change = ((avg_bill_today - avg_bill_yesterday) / avg_bill_yesterday * 100) if avg_bill_yesterday > 0 else 0

print(f"\nChanges:")
print(f"  Sales percent: {sales_change:.1f}%")
print(f"  Customers percent: {customer_change:.1f}%")
print(f"  Avg bill percent: {avg_bill_change:.1f}%")

conn.close()