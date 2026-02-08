// Sidebar Component JavaScript

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Sidebar] DOM Content Loaded');
    setupSidebarEvents();
    updateSidebarStatus();
    setInterval(updateSidebarStatus, 5000);
    
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

function setupSidebarEvents() {
    // Menu button click handler
    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-screen]');
    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
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
