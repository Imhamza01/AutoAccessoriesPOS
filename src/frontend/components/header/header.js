// Header Component JavaScript

document.addEventListener('DOMContentLoaded', function() {
    setupHeaderEvents();
    updateHeaderTime();
    setInterval(updateHeaderTime, 1000);
    updateUserDisplay();
});

function setupHeaderEvents() {
    // Menu Toggle
    const menuToggleBtn = document.getElementById('menu-toggle');
    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', function() {
            const sidebar = document.getElementById('app-sidebar');
            if (sidebar) {
                sidebar.classList.toggle('mobile-open');
            }
        });
    }

    // Notifications Button
    const notificationsBtn = document.getElementById('notifications-btn');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    if (notificationsBtn && notificationsDropdown) {
        notificationsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            notificationsDropdown.style.display = 
                notificationsDropdown.style.display === 'none' ? 'block' : 'none';
        });
    }

    // User Menu Button
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            userDropdown.style.display = 
                userDropdown.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Quick Actions Button
    const quickActionsBtn = document.getElementById('quick-actions-btn');
    const quickActionsDropdown = document.getElementById('quick-actions-dropdown');
    if (quickActionsBtn && quickActionsDropdown) {
        quickActionsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            quickActionsDropdown.style.display = 
                quickActionsDropdown.style.display === 'none' ? 'block' : 'none';
        });
    }

    // Close dropdowns on document click
    document.addEventListener('click', function() {
        if (notificationsDropdown) notificationsDropdown.style.display = 'none';
        if (userDropdown) userDropdown.style.display = 'none';
        if (quickActionsDropdown) quickActionsDropdown.style.display = 'none';
    });
}

function updateHeaderTime() {
    const now = new Date();
    
    // Update date
    const dateEl = document.getElementById('header-date');
    if (dateEl) {
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        dateEl.textContent = `${day}/${month}/${year}`;
    }

    // Update time
    const timeEl = document.getElementById('header-time');
    if (timeEl) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        timeEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
}

function updateUserDisplay() {
    if (window.app && window.app.currentUser) {
        const user = window.app.currentUser;
        
        // Update username
        const userElement = document.getElementById('logged-user');
        if (userElement) {
            userElement.textContent = user.full_name || 'User';
        }

        // Update user role
        const roleElement = document.getElementById('user-role');
        if (roleElement) {
            roleElement.textContent = user.role_name || user.role || 'User';
        }

        // Update dropdown
        const dropdownName = document.getElementById('dropdown-user-name');
        const dropdownRole = document.getElementById('dropdown-user-role');
        if (dropdownName) dropdownName.textContent = user.full_name || 'User';
        if (dropdownRole) dropdownRole.textContent = user.role_name || user.role || 'User Role';

        // Update initials
        const userInitialsEl = document.getElementById('user-initials');
        if (userInitialsEl) {
            const name = user.full_name || 'Guest';
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            userInitialsEl.textContent = initials;
        }
    }
}

// Quick action handlers
function handleQuickPOS() {
    if (window.app && window.app.loadScreen) {
        window.app.loadScreen('pos');
    }
}

function handleQuickAddCustomer() {
    if (window.app && window.app.showAddCustomerModal) {
        window.app.showAddCustomerModal();
    } else {
        showNotification('info', 'Add Customer', 'This feature is being prepared');
    }
}

function handleQuickAddProduct() {
    if (window.app && window.app.showAddProductModal) {
        window.app.showAddProductModal();
    } else {
        showNotification('info', 'Add Product', 'This feature is being prepared');
    }
}

function handleQuickBackup() {
    if (window.app && window.app.makeBackup) {
        window.app.makeBackup();
    } else {
        showNotification('info', 'Backup', 'Creating backup...');
    }
}

function handleSettingsClick() {
    if (window.app && window.app.loadScreen) {
        window.app.loadScreen('settings');
    }
}

function handleChangePassword() {
    if (window.app && window.app.showChangePasswordModal) {
        window.app.showChangePasswordModal();
    }
}

function handleViewAllNotifications() {
    showNotification('info', 'Notifications', 'View all notifications feature coming soon');
}

function handleLogout() {
    if (window.app && window.app.logout) {
        window.app.logout();
    }
}
