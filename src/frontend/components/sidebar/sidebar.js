// Sidebar Component JavaScript

// Expose globally for manual refresh
window.refreshSidebarRBAC = function () {
    console.log('[Sidebar] Manual RBAC refresh triggered');
    renderSidebarByRole();
};

window.initSidebarRBAC = function () {
    console.log('[Sidebar] RBAC init triggered after login');
    // Notify the RBAC manager that role is now ready
    if (window.rbac) {
        window.rbac.notifyRoleReady();
    }
    renderSidebarByRole();
};

document.addEventListener('DOMContentLoaded', function () {
    console.log('[Sidebar] DOM Content Loaded');
    setupSidebarEvents();
    updateSidebarStatus();
    setInterval(updateSidebarStatus, 5000);

    // Do NOT call renderSidebarByRole() here — it's too early.
    // The app.js will call window.refreshSidebarRBAC() after user loads.
    // BUT: as a fallback, register with RBAC's onRoleReady
    if (window.rbac) {
        window.rbac.onRoleReady(() => {
            console.log('[Sidebar] Role ready via onRoleReady, rendering sidebar');
            renderSidebarByRole();
        });
    }
});

function renderSidebarByRole() {
    if (!window.rbac) {
        console.error('[Sidebar] RBAC not available');
        return;
    }

    const role = window.rbac.getCurrentUserRole();
    if (!role) {
        console.warn('[Sidebar] No role available yet for RBAC filtering');
        return;
    }

    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-screen]');
    if (sidebarBtns.length === 0) {
        console.warn('[Sidebar] No sidebar buttons found in DOM');
        return;
    }

    const allowedScreens = window.rbac.getAllowedScreens();
    console.log(`[Sidebar] Role: ${role}, Allowed screens:`, allowedScreens);

    sidebarBtns.forEach(btn => {
        const screenName = btn.getAttribute('data-screen');
        if (allowedScreens.includes(screenName)) {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    });

    // Users button — only for malik
    const usersBtn = document.querySelector('[data-screen="users"]');
    if (usersBtn) {
        usersBtn.style.display = window.rbac.canManageUsers() ? 'flex' : 'none';
    }

    // Settings button — only for malik
    const settingsBtn = document.querySelector('[data-screen="settings"]');
    if (settingsBtn) {
        settingsBtn.style.display = window.rbac.canManageSettings() ? 'flex' : 'none';
    }

    console.log('[Sidebar] RBAC filtering completed for role:', role);
}

function setupSidebarEvents() {
    // Menu button click handler with RBAC check
    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-screen]');
    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const screen = this.getAttribute('data-screen');

            // Double-check RBAC permission on click
            if (window.rbac && !window.rbac.canAccessScreen(screen)) {
                console.warn(`[Sidebar] RBAC denied access to screen: ${screen}`);
                window.app.showNotification('Access denied. Insufficient permissions.', 'error');
                return;
            }

            if (window.app && window.app.loadScreen) {
                window.app.loadScreen(screen);
            }

            // Update active state
            sidebarBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Close mobile sidebar
            const sidebar = document.getElementById('app-sidebar');
            if (sidebar && window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
            }
        });
    });

    // Sidebar close button for mobile
    const closeBtn = document.querySelector('.sidebar-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function () {
            const sidebar = document.getElementById('app-sidebar');
            if (sidebar) {
                sidebar.classList.remove('mobile-open');
            }
        });
    }
}

function updateSidebarStatus() {
    // Update shop status
    const shopStatusEl = document.getElementById('sidebar-shop-status');
    if (shopStatusEl) {
        const hour = new Date().getHours();
        const isOpen = hour >= 9 && hour < 17;
        shopStatusEl.textContent = isOpen ? '🟢 Open' : '🔴 Closed';
    }

    // Update connection status
    const connectionEl = document.getElementById('sidebar-connection-status');
    if (connectionEl) {
        if (navigator.onLine) {
            connectionEl.textContent = '🟢 Online';
        } else {
            connectionEl.textContent = '🔴 Offline';
        }
    }
}

function checkUserManagementPermission() {
    if (window.app && window.app.currentUser) {
        const usersBtn = document.getElementById('users-menu-btn');
        if (usersBtn) {
            // Show users menu only for users with user management permissions
            if (window.app.currentUser.can_manage_users) {
                usersBtn.style.display = 'flex';
            } else {
                usersBtn.style.display = 'none';
            }
        }
    }
}

// Set active menu item based on current screen
function setSidebarActiveScreen(screenName) {
    const buttons = document.querySelectorAll('.sidebar-btn[data-screen]');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-screen') === screenName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}



// Expose setSidebarActiveScreen globally
window.setSidebarActiveScreen = setSidebarActiveScreen;
