import requests
import json

BASE_URL = "http://127.0.0.1:8000"

# Simple integration test to call reconciliation endpoint
def test_reconcile_customers():
    # Try logging in (assumes admin/admin123 exists)
    resp = requests.post(f"{BASE_URL}/auth/login", json={"username":"admin","password":"admin123"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get('access_token')
    headers = {"Authorization": f"Bearer {token}"}

    r = requests.post(f"{BASE_URL}/customer-payments/reconcile/customers", headers=headers)
    print('Status:', r.status_code)
    print(r.text)
    assert r.status_code == 200

if __name__ == '__main__':
    test_reconcile_customers()
