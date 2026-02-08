import requests
import json

# Test the credit summary API
def test_credit_summary():
    base_url = "http://127.0.0.1:8000"
    
    # Login first
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    print("Logging in...")
    login_response = requests.post(f"{base_url}/auth/login", json=login_data)
    print(f"Login status: {login_response.status_code}")
    
    if login_response.status_code == 200:
        token = login_response.json()["access_token"]
        print(f"Got token: {token[:20]}...")
        
        # Test credit summary
        headers = {"Authorization": f"Bearer {token}"}
        print("\nTesting credit summary...")
        credit_response = requests.get(f"{base_url}/reports/credit-summary", headers=headers)
        print(f"Credit summary status: {credit_response.status_code}")
        print(f"Response: {credit_response.text}")
    else:
        print(f"Login failed: {login_response.text}")

if __name__ == "__main__":
    test_credit_summary()