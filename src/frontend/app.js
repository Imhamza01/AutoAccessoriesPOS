// src/frontend/app.js
/**
 * MAIN APPLICATION CONTROLLER
 * Auto Accessories POS System
 */

class AutoAccessoriesPOS {
    constructor() {
        this.currentUser = null;
        this.currentScreen = 'dashboard';
        this.screens = {};
        this.api = new APIClient();
        this.isLoading = false;
        this.notifications = [];
        this.modals = [];
        
        this.init();
    }

    async init() {
        // Show loading screen
        this.showLoading('Initializing application...');
        
        try {
            // Check authentication
            await this.checkAuthentication();
            
            // Initialize application
            await this.initializeApp();
            
            // Hide loading screen
            this.hideLoading();
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize application');
        }
    }

    async checkAuthentication() {
        this.updateLoadingMessage('Checking authentication...');
        
        const accessToken = localStorage.getItem('access_token');
        const userData = localStorage.getItem('user_data');
        
        if (!accessToken || !userData) {
            // Not logged in, redirect to login
            window.location.href = '/login.html';
            return;
        }
        
        try {
            // Verify token is still valid
            await this.api.get('/auth/me');
            this.currentUser = JSON.parse(userData);
            
        } catch (error) {
            // Token invalid or expired
            console.warn('Authentication failed:', error);
            
            // Try to refresh token
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    await this.refreshToken(refreshToken);
                } catch (refreshError) {
                    // Refresh failed, redirect to login
                    this.clearAuthData();
                    window.location.href = '/login.html';
                    return;
                }
            } else {
                // No refresh token, redirect to login
                this.clearAuthData();
                window.location.href = '/login.html';
                return;
            }
        }
    }

    async refreshToken(refreshToken) {
        try {
            const response = await this.api.post('/auth/refresh', {
                refresh_token: refreshToken
            });
            
            // Update tokens
            localStorage.setItem('access_token', response.access_token);
            
            // Get user data
            const userResponse = await this.api.get('/auth/me');
            this.currentUser = userResponse;
            localStorage.setItem('user_data', JSON.stringify(userResponse));
            
        } catch (error) {
            throw error;
        }
    }

    clearAuthData() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('session_token');
        this.currentUser = null;
    }

    async initializeApp() {
        this.updateLoadingMessage('Loading application...');
        
        // Load main app structure
        await this.loadAppStructure();
        
        // Initialize clock
        this.initClock();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Load default screen
        await this.loadScreen('dashboard');
        
        // Check if password needs to be changed
        if (this.currentUser && this.currentUser.password_expired) {
            this.showChangePasswordModal();
        }
    }

    async loadAppStructure() {
        // Load header
        const headerHtml = await this.loadTemplate('components/header.html');
        document.getElementById('app-header').innerHTML = headerHtml;
        
        // Load sidebar
        const sidebarHtml = await this.loadTemplate('components/sidebar.html');
        document.getElementById('app-sidebar').innerHTML = sidebarHtml;
        
        // Update user info in header
        this.updateUserInfo();
        
        // Show main app
        document.getElementById('main-app').style.display = 'flex';
    }

    async loadTemplate(templatePath) {
        try {
            const response = await fetch(templatePath);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templatePath}`);
            }
            return await response.text();
        } catch (error) {
            console.error('Template loading error:', error);
            return `<div class="error">Failed to load template: ${templatePath}</div>`;
        }
    }

    updateUserInfo() {
        if (!this.currentUser) return;
        
        // Update username in header
        const userElement = document.getElementById('logged-user');
        if (userElement) {
            userElement.textContent = this.currentUser.full_name;
        }
        
        // Update user role
        const roleElement = document.getElementById('user-role');
        if (roleElement) {
            roleElement.textContent = this.currentUser.role_name || this.currentUser.role;
        }
        
        // Update shop name
        this.updateShopInfo();
    }

    async updateShopInfo() {
        try {
            // This would come from settings API
            const shopName = 'Auto Accessories Shop';
            const shopElement = document.getElementById('shop-name');
            if (shopElement) {
                shopElement.textContent = shopName;
            }
        } catch (error) {
            console.error('Failed to load shop info:', error);
        }
    }

    initClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();
        
        // Format time
        const timeStr = now.toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        // Update clock display
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            timeElement.textContent = timeStr;
        }
        
        // Update date in header
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            dateElement.textContent = dateStr;
        }
    }

    initEventListeners() {
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }
        
        // Sidebar buttons
        document.addEventListener('click', (e) => {
            const sidebarBtn = e.target.closest('.sidebar-btn');
            if (sidebarBtn) {
                const screen = sidebarBtn.dataset.screen;
                if (screen) {
                    this.loadScreen(screen);
                    
                    // Update active state
                    document.querySelectorAll('.sidebar-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    sidebarBtn.classList.add('active');
                }
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Logout with Ctrl+Shift+L
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                this.handleLogout();
            }
            
            // Escape to close modals
            if (e.key === 'Escape') {
                this.closeCurrentModal();
            }
        });
    }

    async handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            try {
                await this.api.post('/auth/logout');
                this.clearAuthData();
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Logout error:', error);
                // Still redirect even if logout fails
                this.clearAuthData();
                window.location.href = '/login.html';
            }
        }
    }

    async loadScreen(screenName) {
        if (this.currentScreen === screenName && this.screens[screenName]) {
            return; // Screen already loaded
        }
        
        this.showLoading(`Loading ${screenName}...`);
        this.currentScreen = screenName;
        
        try {
            // Hide all screens
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
                screen.style.display = 'none';
            });
            
            // Check if screen exists
            let screenElement = document.getElementById(`${screenName}-screen`);
            
            if (!screenElement) {
                // Create screen container
                screenElement = document.createElement('div');
                screenElement.id = `${screenName}-screen`;
                screenElement.className = 'screen';
                document.getElementById('screen-container').appendChild(screenElement);
            }
            
            // Load screen content
            if (!this.screens[screenName]) {
                const response = await fetch(`screens/${screenName}/index.html`);
                if (!response.ok) {
                    throw new Error(`Failed to load screen: ${screenName}`);
                }
                
                const html = await response.text();
                screenElement.innerHTML = html;
                
                // Load screen JavaScript
                const script = document.createElement('script');
                script.src = `screens/${screenName}/script.js`;
                script.onload = () => {
                    if (window[this.getScreenClassName(screenName)]) {
                        this.screens[screenName] = new window[this.getScreenClassName(screenName)](this);
                        this.screens[screenName].init();
                    }
                };
                document.head.appendChild(script);
            } else {
                // Refresh existing screen
                this.screens[screenName].refresh();
            }
            
            screenElement.style.display = 'block';
            screenElement.classList.add('active');
            
        } catch (error) {
            console.error(`Failed to load screen ${screenName}:`, error);
            this.showNotification(`Failed to load ${screenName} screen`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    getScreenClassName(screenName) {
        return screenName.charAt(0).toUpperCase() + screenName.slice(1) + 'Screen';
    }

    showLoading(message = 'Loading...') {
        this.isLoading = true;
        
        const loadingScreen = document.getElementById('loading-screen');
        const loadingText = loadingScreen.querySelector('.loading-text');
        const loadingMessage = loadingScreen.querySelector('#loadingMessage');
        
        if (loadingText) loadingText.textContent = message;
        if (loadingMessage) loadingMessage.textContent = message;
        
        loadingScreen.style.display = 'flex';
    }

    hideLoading() {
        this.isLoading = false;
        document.getElementById('loading-screen').style.display = 'none';
    }

    updateLoadingMessage(message) {
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notification-container');
        const id = 'notification-' + Date.now();
        
        const notification = document.createElement('div');
        notification.id = id;
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-icon">
                ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span>${message}</span>
        `;
        
        container.appendChild(notification);
        this.notifications.push(id);
        
        // Auto-remove after duration
        setTimeout(() => {
            this.removeNotification(id);
        }, duration);
        
        // Click to dismiss
        notification.addEventListener('click', () => this.removeNotification(id));
    }

    removeNotification(id) {
        const notification = document.getElementById(id);
        if (notification) {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
        
        this.notifications = this.notifications.filter(notifId => notifId !== id);
    }

    showChangePasswordModal() {
        document.getElementById('change-password-modal').style.display = 'flex';
    }

    hideChangePasswordModal() {
        document.getElementById('change-password-modal').style.display = 'none';
    }

    async handlePasswordChange() {
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const errorElement = document.getElementById('password-error');
        
        // Validate
        if (!currentPassword || !newPassword || !confirmPassword) {
            errorElement.textContent = 'All fields are required';
            errorElement.style.display = 'block';
            return;
        }
        
        if (newPassword.length < 6) {
            errorElement.textContent = 'New password must be at least 6 characters';
            errorElement.style.display = 'block';
            return;
        }
        
        if (newPassword !== confirmPassword) {
            errorElement.textContent = 'Passwords do not match';
            errorElement.style.display = 'block';
            return;
        }
        
        try {
            await this.api.post('/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });
            
            this.hideChangePasswordModal();
            this.showNotification('Password changed successfully', 'success');
            
            // Update user data
            const userResponse = await this.api.get('/auth/me');
            this.currentUser = userResponse;
            localStorage.setItem('user_data', JSON.stringify(userResponse));
            
        } catch (error) {
            errorElement.textContent = error.message || 'Failed to change password';
            errorElement.style.display = 'block';
        }
    }

    showError(message) {
        this.showNotification(message, 'error', 10000);
    }

    // Utility methods
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            minimumFractionDigits: 2
        }).format(amount);
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PK', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.POS = new AutoAccessoriesPOS();
});

// Global functions for modals
function hideChangePasswordModal() {
    if (window.POS) {
        window.POS.hideChangePasswordModal();
    }
}

function handlePasswordChange() {
    if (window.POS) {
        window.POS.handlePasswordChange();
    }
}