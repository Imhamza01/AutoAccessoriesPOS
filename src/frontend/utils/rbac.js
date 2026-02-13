/**
 * RBAC Utility for Frontend Permission Management
 */

class RBACManager {
    constructor() {
        this.rolePermissions = {
            'malik': {
                name: 'Malik (Owner)',
                permissions: ['*'],
                screens: ['dashboard', 'pos', 'products', 'customers', 'inventory', 'sales', 'reports', 'credit-management', 'expenses', 'users', 'settings'],
                canManageUsers: true,
                canViewReports: true,
                canManageStock: true,
                canManageProducts: true,
                canManageCustomers: true,
                canManageSales: true,
                canManageExpenses: true,
                canManageSettings: true,
                canBackupRestore: true
            },
            'munshi': {
                name: 'Munshi (Manager)',
                permissions: [
                    'dashboard.view',
                    'pos.access',
                    'products.manage',
                    'customers.manage',
                    'sales.manage',
                    'inventory.manage',
                    'reports.view',
                    'expenses.view',
                    'expenses.manage'
                ],
                screens: ['dashboard', 'pos', 'products', 'customers', 'inventory', 'sales', 'reports', 'credit-management', 'expenses'],
                canManageUsers: false,
                canViewReports: true,
                canManageStock: true,
                canManageProducts: true,
                canManageCustomers: true,
                canManageSales: true,
                canManageExpenses: true,
                canManageSettings: false,
                canBackupRestore: false
            },
            'shop_boy': {
                name: 'Shop Boy (Cashier)',
                permissions: [
                    'dashboard.view',
                    'pos.access',
                    'products.view',
                    'customers.manage',
                    'sales.create',
                    'sales.view'
                ],
                screens: ['dashboard', 'pos', 'customers', 'sales'],
                canManageUsers: false,
                canViewReports: false,
                canManageStock: false,
                canManageProducts: false,
                canManageCustomers: true,
                canManageSales: true,
                canManageExpenses: false,
                canManageSettings: false,
                canBackupRestore: false
            },
            'stock_boy': {
                name: 'Stock Boy',
                permissions: [
                    'dashboard.view',
                    'products.view',
                    'inventory.manage',
                    'stock.view'
                ],
                screens: ['dashboard', 'products', 'inventory'],
                canManageUsers: false,
                canViewReports: false,
                canManageStock: true,
                canManageProducts: false,
                canManageCustomers: false,
                canManageSales: false,
                canManageExpenses: false,
                canManageSettings: false,
                canBackupRestore: false
            }
        };
    }

    /**
     * Get current user role
     */
    getCurrentUserRole() {
        if (window.app && window.app.currentUser) {
            return window.app.currentUser.role;
        }
        return null;
    }

    /**
     * Check if user has specific permission
     */
    hasPermission(permission) {
        const role = this.getCurrentUserRole();
        if (!role) return false;
        
        const roleConfig = this.rolePermissions[role];
        if (!roleConfig) return false;
        
        // Owner has all permissions
        if (role === 'malik') return true;
        
        // Check exact permission or wildcard
        if (roleConfig.permissions.includes(permission) || roleConfig.permissions.includes('*')) {
            return true;
        }
        
        // Check for wildcard permissions
        for (const perm of roleConfig.permissions) {
            if (perm.endsWith('.*')) {
                const prefix = perm.slice(0, -2);
                if (permission.startsWith(prefix)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if user can access specific screen
     */
    canAccessScreen(screenName) {
        const role = this.getCurrentUserRole();
        if (!role) return false;
        
        const roleConfig = this.rolePermissions[role];
        if (!roleConfig) return false;
        
        return roleConfig.screens.includes(screenName);
    }

    /**
     * Get allowed screens for current user
     */
    getAllowedScreens() {
        const role = this.getCurrentUserRole();
        if (!role) return [];
        
        const roleConfig = this.rolePermissions[role];
        return roleConfig ? roleConfig.screens : [];
    }

    /**
     * Check specific capabilities
     */
    canManageUsers() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageUsers;
    }

    canViewReports() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canViewReports;
    }

    canManageStock() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageStock;
    }

    canManageProducts() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageProducts;
    }

    canManageCustomers() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageCustomers;
    }

    canManageSales() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageSales;
    }

    canManageExpenses() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageExpenses;
    }

    canManageSettings() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canManageSettings;
    }

    canBackupRestore() {
        const role = this.getCurrentUserRole();
        return role && this.rolePermissions[role]?.canBackupRestore;
    }

    /**
     * Route guard function
     */
    routeGuard(screenName) {
        if (!this.canAccessScreen(screenName)) {
            console.warn(`[RBAC] Access denied to screen: ${screenName}`);
            window.app.showNotification('Access denied. Insufficient permissions.', 'error');
            return false;
        }
        return true;
    }

    /**
     * Get role display name
     */
    getRoleDisplayName() {
        const role = this.getCurrentUserRole();
        if (!role) return 'Unknown';
        
        const roleConfig = this.rolePermissions[role];
        return roleConfig ? roleConfig.name : role;
    }
}

// Global RBAC instance
window.rbac = new RBACManager();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RBACManager;
}