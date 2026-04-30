import sqlite3
import datetime

# Connect to the database
conn = sqlite3.connect('data/database/pos_main.db')
c = conn.cursor()

# Get today's date
today = datetime.date.today()
print(f"Today's date: {today}")

# Query sales for today - mimicking the API
c.execute('''
    SELECT * FROM sales 
    WHERE DATE(created_at) = ? AND sale_status != "cancelled"
''', (today,))
rows = c.fetchall()

print(f"\nNumber of rows: {len(rows)}")
print("Columns:")
columns = [description[0] for description in c.description]
for i, col in enumerate(columns):
    print(f"  {i}: {col}")

print("\nRow data:")
for i, row in enumerate(rows):
    print(f"  Row {i}: {row}")
    if i >= 2:  # Just show first few rows
        break

conn.close()