import bcrypt
import sqlite3

# Connect to database
conn = sqlite3.connect(r'C:\Users\Intel Computer\AppData\Roaming\AutoAccessoriesPOS\database\pos_main.db')
cursor = conn.cursor()

# Get the stored password hash
cursor.execute('SELECT password_hash FROM users WHERE username=?', ('admin',))
result = cursor.fetchone()
if result:
    stored_hash = result[0]
    print(f'Stored hash: {stored_hash}')
    
    # Test if 'admin123' matches
    password = 'admin123'
    
    # Parse the stored hash (bcrypt format)
    try:
        # bcrypt hashes are self-contained with algorithm, cost, salt, and hash
        print(f'Bcrypt hash format detected')
        
        # Test verification using bcrypt
        password_bytes = password.encode('utf-8')
        stored_hash_bytes = stored_hash.encode('utf-8')
        is_match = bcrypt.checkpw(password_bytes, stored_hash_bytes)
        print(f'Test password "admin123" matches: {is_match}')
        
    except ValueError:
        print('Invalid hash format')
else:
    print('No admin user found')

conn.close()