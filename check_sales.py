import sqlite3
import datetime

# Connect to the database
conn = sqlite3.connect('data/database/pos_main.db')
c = conn.cursor()

# Get today's date in local timezone (assuming UTC+5)
today = datetime.date.today()
print(f"Today's date: {today}")

# Query sales for today
c.execute('''
    SELECT created_at, DATE(created_at) as date_part, grand_total 
    FROM sales 
    WHERE sale_status != "cancelled"
    ORDER BY created_at DESC 
    LIMIT 5
''')
rows = c.fetchall()

print("\nRecent sales:")
for row in rows:
    print(f"  Created at: {row[0]}, Date part: {row[1]}, Grand total: {row[2]}")

# Query sales for today specifically
c.execute('''
    SELECT COUNT(*) as transactions, SUM(grand_total) as total_sales
    FROM sales 
    WHERE DATE(created_at) = ? AND sale_status != "cancelled"
''', (today,))
today_data = c.fetchone()
print(f"\nToday's sales: {today_data[0]} transactions, Total: {today_data[1]}")

conn.close()