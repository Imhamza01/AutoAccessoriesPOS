// Sidebar Component JavaScript

// Make RBAC filtering available globally for manual triggering
window.refreshSidebarRBAC = function() {
    console.log('[Sidebar] Manual RBAC refresh triggered');
    renderSidebarByRole();
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Sidebar] DOM Content Loaded');
    setupSidebarEvents();
    updateSidebarStatus();
    setInterval(updateSidebarStatus, 5000);
    
    // Initialize RBAC-based sidebar rendering
    renderSidebarByRole();
    
    // Show/hide Users menu based on permissions
    checkUserManagementPermission();
    
    // Debug: Check if credit-management button exists
    const creditBtn = document.querySelector('[data-screen="credit-management"]');
    if (creditBtn) {
        console.log('[Sidebar] Credit Management button found in DOM');
    } else {
        console.error('[Sidebar] Credit Management button NOT found in DOM');
        console.log('[Sidebar] Available buttons:', Array.from(document.querySelectorAll('.sidebar-btn[data-screen]')).map(btn => btn.getAttribute('data-screen')));
    }
});

function renderSidebarByRole(maxRetries = 10, retryCount = 0) {
    // Wait for RBAC to be available
    if (!window.rbac) {
        if (retryCount < maxRetries) {
            console.log(`[Sidebar] RBAC not ready, retrying in 100ms... (attempt ${retryCount + 1}/${maxRetries})`);
            setTimeout(() => renderSidebarByRole(maxRetries, retryCount + 1), 100);
        } else {
            console.error('[Sidebar] RBAC failed to initialize after maximum retries');
        }
        return;
    }
    
    // Wait for user to be authenticated
    if (!window.app || !window.app.currentUser) {
        if (retryCount < maxRetries) {
            console.log(`[Sidebar] User not authenticated yet, retrying in 100ms... (attempt ${retryCount + 1}/${maxRetries})`);
            setTimeout(() => renderSidebarByRole(maxRetries, retryCount + 1), 100);
        } else {
            console.error('[Sidebar] User authentication failed after maximum retries');
        }
        return;
    }
    
    // Wait for sidebar buttons to be in DOM
    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-screen]');
    if (sidebarBtns.length === 0) {
        if (retryCount < maxRetries) {
            console.log(`[Sidebar] Sidebar buttons not found, retrying in 100ms... (attempt ${retryCount + 1}/${maxRetries})`);
            setTimeout(() => renderSidebarByRole(maxRetries, retryCount + 1), 100);
        } else {
            console.error('[Sidebar] Sidebar buttons not found after maximum retries');
        }
        return;
    }
    
    const allowedScreens = window.rbac.getAllowedScreens();
    console.log(`[Sidebar] User role: ${window.rbac.getCurrentUserRole()}, Allowed screens:`, allowedScreens);
    console.log(`[Sidebar] Found ${sidebarBtns.length} sidebar buttons`);
    
    // Process all sidebar buttons
    sidebarBtns.forEach(btn => {
        const screenName = btn.getAttribute('data-screen');
        
        // Hide buttons for screens user doesn't have access to
        if (!allowedScreens.includes(screenName)) {
            btn.style.display = 'none';
            console.log(`[Sidebar] Hiding button for screen: ${screenName}`);
        } else {
            btn.style.display = 'flex';
            console.log(`[Sidebar] Showing button for screen: ${screenName}`);
        }
    });
    
    // Special handling for users menu
    const usersBtn = document.querySelector('[data-screen="users"]');
    if (usersBtn) {
        if (window.rbac.canManageUsers()) {
            usersBtn.style.display = 'flex';
            console.log('[Sidebar] Showing Users menu button');
        } else {
            usersBtn.style.display = 'none';
            console.log('[Sidebar] Hiding Users menu button');
        }
    }
    
    // Special handling for settings menu
    const settingsBtn = document.querySelector('[data-screen="settings"]');
    if (settingsBtn) {
        if (window.rbac.canManageSettings()) {
            settingsBtn.style.display = 'flex';
            console.log('[Sidebar] Showing Settings menu button');
        } else {
            settingsBtn.style.display = 'none';
            console.log('[Sidebar] Hiding Settings menu button');
        }
    }
    
    console.log('[Sidebar] RBAC filtering completed');
}

function setupSidebarEvents() {
    // Menu button click handler with RBAC check
    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-screen]');
    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', function() {
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
        closeBtn.addEventListener('click', function() {
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

// NEW: Function to initialize RBAC filtering after user login
window.initSidebarRBAC = function() {
    console.log('[Sidebar] Initializing RBAC filtering after user login');
    renderSidebarByRole();
};
