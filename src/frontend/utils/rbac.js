/**
 * RBAC Utility for Frontend Permission Management
 * Fixed: Added observer pattern to handle async user loading
 */

class RBACManager {
    constructor() {
        this._roleChangeCallbacks = [];
        this._currentRole = null;

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
                    'dashboard.view', 'pos.access',
                    'products.view', 'products.manage',
                    'customers.view', 'customers.manage',
                    'sales.view', 'sales.manage',
                    'inventory.view', 'inventory.manage',
                    'reports.view',
                    'expenses.view', 'expenses.manage',
                    'credit-management.view'
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
                    'customers.view', 'customers.manage',
                    'sales.create', 'sales.view',
                    'reports.view',
                    'credit-management.view'
                ],
                screens: ['dashboard', 'pos', 'customers', 'sales', 'reports', 'credit-management'],
                canManageUsers: false,
                canViewReports: true,
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
                    'inventory.view', 'inventory.manage',
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
     * Get current user role — checks multiple sources
     */
    getCurrentUserRole() {
        // Source 1: window.app.currentUser (set after login)
        if (window.app && window.app.currentUser && window.app.currentUser.role) {
            return window.app.currentUser.role;
        }
        // Source 2: localStorage (available immediately after page refresh)
        try {
            const userData = localStorage.getItem('user_data');
            if (userData) {
                const parsed = JSON.parse(userData);
                if (parsed && parsed.role) {
                    return parsed.role;
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Register a callback to be called when role becomes available
     */
    onRoleReady(callback) {
        const role = this.getCurrentUserRole();
        if (role) {
            // Role already available — call immediately
            callback(role);
        } else {
            // Store callback for later
            this._roleChangeCallbacks.push(callback);
        }
    }

    /**
     * Notify all waiting callbacks that role is now available
     * Call this after user data is set in app.js
     */
    notifyRoleReady() {
        const role = this.getCurrentUserRole();
        if (role && this._roleChangeCallbacks.length > 0) {
            console.log('[RBAC] Notifying', this._roleChangeCallbacks.length, 'callbacks, role:', role);
            const callbacks = [...this._roleChangeCallbacks];
            this._roleChangeCallbacks = [];
            callbacks.forEach(cb => {
                try { cb(role); } catch (e) { console.error('[RBAC] Callback error:', e); }
            });
        }
    }

    hasPermission(permission) {
        const role = this.getCurrentUserRole();
        if (!role) return false;
        const roleConfig = this.rolePermissions[role];
        if (!roleConfig) return false;
        if (role === 'malik') return true;
        if (roleConfig.permissions.includes('*')) return true;
        if (roleConfig.permissions.includes(permission)) return true;
        // Wildcard check: products.manage satisfies products.view
        const [resource, action] = permission.split('.');
        if (action === 'view' && roleConfig.permissions.includes(`${resource}.manage`)) return true;
        for (const perm of roleConfig.permissions) {
            if (perm.endsWith('.*')) {
                const prefix = perm.slice(0, -2);
                if (permission.startsWith(prefix)) return true;
            }
        }
        return false;
    }

    canAccessScreen(screenName) {
        const role = this.getCurrentUserRole();
        if (!role) return false;
        const roleConfig = this.rolePermissions[role];
        if (!roleConfig) return false;
        return roleConfig.screens.includes(screenName);
    }

    getAllowedScreens() {
        const role = this.getCurrentUserRole();
        if (!role) return [];
        const roleConfig = this.rolePermissions[role];
        return roleConfig ? [...roleConfig.screens] : [];
    }

    canManageUsers() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageUsers; }
    canViewReports() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canViewReports; }
    canManageStock() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageStock; }
    canManageProducts() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageProducts; }
    canManageCustomers() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageCustomers; }
    canManageSales() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageSales; }
    canManageExpenses() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageExpenses; }
    canManageSettings() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canManageSettings; }
    canBackupRestore() { return !!this.rolePermissions[this.getCurrentUserRole()]?.canBackupRestore; }

    routeGuard(screenName) {
        if (!this.canAccessScreen(screenName)) {
            console.warn(`[RBAC] Access denied to screen: ${screenName}`);
            if (window.app) window.app.showNotification('Access denied. Insufficient permissions.', 'error');
            return false;
        }
        return true;
    }

    getRoleDisplayName() {
        const role = this.getCurrentUserRole();
        if (!role) return 'Unknown';
        return this.rolePermissions[role]?.name || role;
    }
}

// Global RBAC instance — available immediately
window.rbac = new RBACManager();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RBACManager;
}