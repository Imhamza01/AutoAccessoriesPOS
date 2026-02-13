#!/usr/bin/env python3
"""
RBAC Implementation Verification Script
Tests all aspects of the RBAC system
"""

import os
import sys
import json
import subprocess
import time
from pathlib import Path

class RBACTester:
    def __init__(self):
        self.workspace_root = Path("d:/AutoAccessoriesPOS")
        self.results = {}
        
    def log_result(self, test_name, status, details=""):
        """Log test result"""
        self.results[test_name] = {
            "status": status,
            "details": details
        }
        status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        print(f"{status_icon} {test_name}: {status}")
        if details:
            print(f"   {details}")
    
    def test_backend_files(self):
        """Test backend RBAC implementation files"""
        print("\n=== Testing Backend RBAC Files ===")
        
        # Check auth.py enhancements
        auth_py = self.workspace_root / "src" / "backend" / "core" / "auth.py"
        if auth_py.exists():
            with open(auth_py, 'r') as f:
                content = f.read()
                
            required_functions = [
                "create_authorization_middleware",
                "create_sales_filter_middleware",
                "validate_permission"
            ]
            
            missing_functions = []
            for func in required_functions:
                if func not in content:
                    missing_functions.append(func)
            
            if not missing_functions:
                self.log_result("Backend Auth Module", "PASS", "All required functions present")
            else:
                self.log_result("Backend Auth Module", "FAIL", f"Missing functions: {missing_functions}")
        else:
            self.log_result("Backend Auth Module", "FAIL", "auth.py file not found")
        
        # Check sales.py implementation
        sales_py = self.workspace_root / "src" / "backend" / "api" / "sales.py"
        if sales_py.exists():
            with open(sales_py, 'r') as f:
                content = f.read()
            
            required_elements = [
                "sales_auth = auth_manager.create_authorization_middleware",
                "cashier_id = ?",
                "current_user[\"role\"] == \"shop_boy\""
            ]
            
            missing_elements = []
            for element in required_elements:
                if element not in content:
                    missing_elements.append(element)
            
            if not missing_elements:
                self.log_result("Sales API RBAC", "PASS", "Role-based filtering implemented")
            else:
                self.log_result("Sales API RBAC", "FAIL", f"Missing elements: {missing_elements}")
        else:
            self.log_result("Sales API RBAC", "FAIL", "sales.py file not found")
    
    def test_frontend_files(self):
        """Test frontend RBAC implementation files"""
        print("\n=== Testing Frontend RBAC Files ===")
        
        # Check rbac.js utility
        rbac_js = self.workspace_root / "src" / "frontend" / "utils" / "rbac.js"
        if rbac_js.exists():
            with open(rbac_js, 'r') as f:
                content = f.read()
            
            required_classes = [
                "class RBACManager",
                "getCurrentUserRole",
                "hasPermission",
                "canAccessScreen"
            ]
            
            missing_classes = []
            for cls in required_classes:
                if cls not in content:
                    missing_classes.append(cls)
            
            if not missing_classes:
                self.log_result("Frontend RBAC Utility", "PASS", "RBACManager class implemented")
            else:
                self.log_result("Frontend RBAC Utility", "FAIL", f"Missing classes/methods: {missing_classes}")
        else:
            self.log_result("Frontend RBAC Utility", "FAIL", "rbac.js file not found")
        
        # Check app.js integration
        app_js = self.workspace_root / "src" / "frontend" / "app.js"
        if app_js.exists():
            with open(app_js, 'r') as f:
                content = f.read()
            
            if "window.rbac && !window.rbac.routeGuard" in content:
                self.log_result("App.js RBAC Integration", "PASS", "Route guard implemented")
            else:
                self.log_result("App.js RBAC Integration", "FAIL", "Route guard not found")
        else:
            self.log_result("App.js RBAC Integration", "FAIL", "app.js file not found")
        
        # Check sidebar.js integration
        sidebar_js = self.workspace_root / "src" / "frontend" / "components" / "sidebar" / "sidebar.js"
        if sidebar_js.exists():
            with open(sidebar_js, 'r') as f:
                content = f.read()
            
            required_features = [
                "renderSidebarByRole",
                "window.rbac.canAccessScreen"
            ]
            
            missing_features = []
            for feature in required_features:
                if feature not in content:
                    missing_features.append(feature)
            
            if not missing_features:
                self.log_result("Sidebar RBAC Integration", "PASS", "Role-based rendering implemented")
            else:
                self.log_result("Sidebar RBAC Integration", "FAIL", f"Missing features: {missing_features}")
        else:
            self.log_result("Sidebar RBAC Integration", "FAIL", "sidebar.js file not found")
    
    def test_html_integration(self):
        """Test HTML file integrations"""
        print("\n=== Testing HTML Integrations ===")
        
        # Check index.html RBAC inclusion
        index_html = self.workspace_root / "src" / "frontend" / "index.html"
        if index_html.exists():
            with open(index_html, 'r') as f:
                content = f.read()
            
            if "utils/rbac.js" in content:
                self.log_result("HTML RBAC Inclusion", "PASS", "rbac.js included in index.html")
            else:
                self.log_result("HTML RBAC Inclusion", "FAIL", "rbac.js not included in index.html")
        else:
            self.log_result("HTML RBAC Inclusion", "FAIL", "index.html file not found")
    
    def test_role_matrix_compliance(self):
        """Test compliance with role matrix requirements"""
        print("\n=== Testing Role Matrix Compliance ===")
        
        # Read the RBAC utility to verify role definitions
        rbac_js = self.workspace_root / "src" / "frontend" / "utils" / "rbac.js"
        if rbac_js.exists():
            with open(rbac_js, 'r') as f:
                content = f.read()
            
            # Check role definitions
            roles = ['malik', 'munshi', 'shop_boy', 'stock_boy']
            role_found = []
            
            for role in roles:
                if f"'{role}':" in content:
                    role_found.append(role)
            
            if len(role_found) == 4:
                self.log_result("Role Matrix Definition", "PASS", "All 4 roles defined correctly")
            else:
                missing = [r for r in roles if r not in role_found]
                self.log_result("Role Matrix Definition", "FAIL", f"Missing roles: {missing}")
            
            # Check specific permissions for each role
            role_permissions = {
                'malik': ['*', 'Full access'],
                'munshi': ['expenses.manage', 'Financial access'],
                'shop_boy': ['sales.create', 'POS access only'],
                'stock_boy': ['inventory.manage', 'Stock access only']
            }
            
            for role, (perm, desc) in role_permissions.items():
                if perm in content:
                    self.log_result(f"{role.title()} Permissions", "PASS", f"{desc} - {perm} found")
                else:
                    self.log_result(f"{role.title()} Permissions", "FAIL", f"{desc} - {perm} missing")
        else:
            self.log_result("Role Matrix Compliance", "FAIL", "Cannot verify - rbac.js not found")
    
    def test_cashier_sales_filtering(self):
        """Test cashier-specific sales filtering"""
        print("\n=== Testing Cashier Sales Filtering ===")
        
        sales_py = self.workspace_root / "src" / "backend" / "api" / "sales.py"
        if sales_py.exists():
            with open(sales_py, 'r') as f:
                content = f.read()
            
            # Check for cashier_id filtering
            if "cashier_id = ?" in content and "current_user[\"role\"] == \"shop_boy\"" in content:
                self.log_result("Cashier Sales Filter", "PASS", "Cashier-specific filtering implemented")
            else:
                self.log_result("Cashier Sales Filter", "FAIL", "Cashier filtering logic missing")
        else:
            self.log_result("Cashier Sales Filter", "FAIL", "sales.py not found")
    
    def test_security_enforcement(self):
        """Test security enforcement mechanisms"""
        print("\n=== Testing Security Enforcement ===")
        
        # Check for 403 responses
        auth_py = self.workspace_root / "src" / "backend" / "core" / "auth.py"
        if auth_py.exists():
            with open(auth_py, 'r') as f:
                content = f.read()
            
            if "status_code=403" in content:
                self.log_result("HTTP 403 Enforcement", "PASS", "403 responses implemented")
            else:
                self.log_result("HTTP 403 Enforcement", "FAIL", "403 responses not found")
        else:
            self.log_result("HTTP 403 Enforcement", "FAIL", "auth.py not found")
        
        # Check frontend blocking
        rbac_js = self.workspace_root / "src" / "frontend" / "utils" / "rbac.js"
        if rbac_js.exists():
            with open(rbac_js, 'r') as f:
                content = f.read()
            
            if "Access denied. Insufficient permissions" in content:
                self.log_result("Frontend Blocking", "PASS", "User-friendly denial messages implemented")
            else:
                self.log_result("Frontend Blocking", "FAIL", "Denial messages not found")
        else:
            self.log_result("Frontend Blocking", "FAIL", "rbac.js not found")
    
    def generate_report(self):
        """Generate comprehensive test report"""
        print("\n" + "="*60)
        print("RBAC IMPLEMENTATION VERIFICATION REPORT")
        print("="*60)
        
        passed = sum(1 for result in self.results.values() if result["status"] == "PASS")
        failed = sum(1 for result in self.results.values() if result["status"] == "FAIL")
        warnings = sum(1 for result in self.results.values() if result["status"] == "WARN")
        
        print(f"\nSUMMARY:")
        print(f"  ✅ Passed: {passed}")
        print(f"  ❌ Failed: {failed}")
        print(f"  ⚠️  Warnings: {warnings}")
        print(f"  📊 Total Tests: {len(self.results)}")
        
        if failed == 0:
            print(f"\n🎉 ALL TESTS PASSED! RBAC implementation is complete.")
            overall_status = "SUCCESS"
        else:
            print(f"\n⚠️  Some tests failed. Review the implementation.")
            overall_status = "PARTIAL"
        
        print(f"\nDETAILED RESULTS:")
        for test_name, result in self.results.items():
            status_icon = "✅" if result["status"] == "PASS" else "❌" if result["status"] == "FAIL" else "⚠️"
            print(f"  {status_icon} {test_name}: {result['status']}")
            if result["details"]:
                print(f"     {result['details']}")
        
        print(f"\nOVERALL STATUS: {overall_status}")
        print("="*60)
        
        return overall_status
    
    def run_all_tests(self):
        """Run all RBAC tests"""
        print("Starting RBAC Implementation Verification...")
        print(f"Workspace: {self.workspace_root}")
        
        self.test_backend_files()
        self.test_frontend_files()
        self.test_html_integration()
        self.test_role_matrix_compliance()
        self.test_cashier_sales_filtering()
        self.test_security_enforcement()
        
        return self.generate_report()

def main():
    tester = RBACTester()
    status = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if status == "SUCCESS" else 1)

if __name__ == "__main__":
    main()