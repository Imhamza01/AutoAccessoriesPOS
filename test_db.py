import hashlib
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
    
    # Parse the stored hash
    try:
        algorithm, salt, hash_value = stored_hash.split('$')
        print(f'Algorithm: {algorithm}, Salt: {salt}')
        
        # Test verification
        test_hash = hashlib.sha256(f'{password}{salt}'.encode()).hexdigest()
        is_match = test_hash == hash_value
        print(f'Test password "admin123" matches: {is_match}')
        print(f'Expected hash: {test_hash}')
        print(f'Stored hash:   {hash_value}')
        
    except ValueError:
        print('Invalid hash format')
else:
    print('No admin user found')

conn.close()