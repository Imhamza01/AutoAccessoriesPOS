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
        this.keyboardShortcuts = new Map();
        
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
            
            // Show welcome notification
            if (this.currentUser) {
                this.showNotification(`Welcome back, ${this.currentUser.full_name}!`, 'success', 3000);
            }
            
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
        
        // Initialize keyboard shortcuts
        this.initKeyboardShortcuts();
        
        // Load default screen
        await this.loadScreen('dashboard');
        
        // Check if password needs to be changed
        if (this.currentUser && this.currentUser.password_expired) {
            this.showChangePasswordModal();
        }
    }

    async loadAppStructure() {
        try {
            // Load header component
            const headerHtml = await this.loadTemplate('components/header/header.html');
            document.getElementById('app-header').innerHTML = headerHtml;
            
            // Load header CSS
            this.loadComponentCSS('header');
            
            // Load header JavaScript
            await this.loadComponentScript('header');
            // Legacy header scripts register handlers on DOMContentLoaded which already fired.
            // Call known init functions if they exist so header becomes interactive.
            if (window.setupHeaderEvents) try { window.setupHeaderEvents(); } catch(e){console.warn('setupHeaderEvents error', e);} 
            if (window.updateHeaderTime) try { window.updateHeaderTime(); } catch(e){console.warn('updateHeaderTime error', e);} 
            if (window.updateUserDisplay) try { window.updateUserDisplay(); } catch(e){console.warn('updateUserDisplay error', e);} 
            
            // Load sidebar component
            const sidebarHtml = await this.loadTemplate('components/sidebar/sidebar.html');
            document.getElementById('app-sidebar').innerHTML = sidebarHtml;
            
            // Load sidebar CSS
            this.loadComponentCSS('sidebar');
            
            // Load sidebar JavaScript
            await this.loadComponentScript('sidebar');
            // Initialize sidebar legacy handlers
            if (window.setupSidebarEvents) try { window.setupSidebarEvents(); } catch(e){console.warn('setupSidebarEvents error', e);} 
            if (window.updateSidebarStatus) try { window.updateSidebarStatus(); } catch(e){console.warn('updateSidebarStatus error', e);} 
            if (window.checkUserManagementPermission) try { window.checkUserManagementPermission(); } catch(e){console.warn('checkUserManagementPermission error', e);} 
            // Keep sidebar status updated periodically
            if (window.updateSidebarStatus) setInterval(() => { try { window.updateSidebarStatus(); } catch(e){/*ignore*/} }, 5000);
            
            // Update user info in header
            this.updateUserInfo();
            
            // Show main app
            document.getElementById('main-app').style.display = 'flex';
            
        } catch (error) {
            console.error('Failed to load app structure:', error);
            this.showError('Failed to load application interface');
        }
    }

    loadComponentCSS(componentName) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `components/${componentName}/${componentName}.css?v=${Date.now()}`;
        document.head.appendChild(link);
    }

    loadComponentScript(componentName) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `components/${componentName}/${componentName}.js?v=${Date.now()}`;
            
            script.onload = () => resolve();
            script.onerror = () => {
                console.warn(`Failed to load component script: ${componentName}`);
                resolve(); // Don't fail on missing JS
            };
            
            document.head.appendChild(script);
        });
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
            // For now, use default
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
        // Also update header time if header component uses different IDs
        const headerTimeEl = document.getElementById('header-time');
        if (headerTimeEl) headerTimeEl.textContent = timeStr;
        
        // Update date in header
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            dateElement.textContent = dateStr;
        }
        // Also update header date if header component uses different IDs
        const headerDateEl = document.getElementById('header-date');
        if (headerDateEl) headerDateEl.textContent = dateStr;
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
        
        // Window resize handling
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));
        
        // Before unload - warn about unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges()) {
                e.preventDefault();
                e.returnValue = '';
                return 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }
            
            // Logout with Ctrl+Shift+L
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();
                this.handleLogout();
            }
            
            // Escape to close modals
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeCurrentModal();
            }
            
            // F1 - Help
            if (e.key === 'F1') {
                e.preventDefault();
                this.showHelp();
            }
            
            // F2 - Quick Sale
            if (e.key === 'F2') {
                e.preventDefault();
                this.openQuickSale();
            }
            
            // F3 - Search Products
            if (e.key === 'F3') {
                e.preventDefault();
                this.quickProductSearch();
            }
            
            // F5 - Refresh current screen
            if (e.key === 'F5') {
                e.preventDefault();
                this.refreshCurrentScreen();
            }
            
            // Ctrl+S - Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.handleSave();
            }
            
            // Ctrl+P - Print
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.handlePrint();
            }
        });
    }

    async handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            try {
                await this.api.post('/auth/logout');
                this.clearAuthData();
                this.showNotification('Logged out successfully', 'success', 2000);
                
                // Redirect after short delay
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 500);
                
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
        
        this.showLoading(`Loading ${this.getScreenDisplayName(screenName)}...`);
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
                
                // Load screen CSS if exists
                this.loadScreenCSS(screenName);
                
                // Load screen JavaScript
                await this.loadScreenScript(screenName, screenElement);
                
            } else {
                // Refresh existing screen
                this.screens[screenName].refresh();
            }
            
            screenElement.style.display = 'block';
            screenElement.classList.add('active');
            
            // Update browser title
            document.title = `${this.getScreenDisplayName(screenName)} - Auto Accessories POS`;
            
        } catch (error) {
            console.error(`Failed to load screen ${screenName}:`, error);
            this.showNotification(`Failed to load ${screenName} screen`, 'error');
            
            // Fallback to dashboard
            if (screenName !== 'dashboard') {
                this.loadScreen('dashboard');
            }
        } finally {
            this.hideLoading();
        }
    }

    async loadScreenScript(screenName, screenElement) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `screens/${screenName}/script.js?v=${Date.now()}`;
            
            script.onload = () => {
                try {
                    const className = this.getScreenClassName(screenName);
                    
                    // Check for function-based initialization (new style - e.g., dashboard)
                    if (window[`init${className}`]) {
                        window[`init${className}`]();
                        resolve();
                    }
                    // Check for class-based initialization (old style)
                    else if (window[className]) {
                        this.screens[screenName] = new window[className](this);
                        this.screens[screenName].init();
                        resolve();
                    } else {
                        console.warn(`No init function or class found for ${screenName}, continuing anyway...`);
                        resolve(); // Don't fail, just warn
                    }
                } catch (error) {
                    console.error('Error in screen script:', error);
                    resolve(); // Don't fail, just warn
                }
            };
            
            script.onerror = () => {
                console.error(`Failed to load script for screen: ${screenName}`);
                resolve(); // Don't fail on script load error
            };
            
            document.head.appendChild(script);
        });
    }

    loadScreenCSS(screenName) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `screens/${screenName}/style.css?v=${Date.now()}`;
        link.onerror = () => {
            // CSS file might not exist, that's okay
        };
        document.head.appendChild(link);
    }

    getScreenClassName(screenName) {
        return screenName.charAt(0).toUpperCase() + screenName.slice(1) + 'Screen';
    }

    getScreenDisplayName(screenName) {
        const names = {
            'dashboard': 'Dashboard',
            'pos': 'POS Terminal',
            'products': 'Products',
            'customers': 'Customers',
            'inventory': 'Inventory',
            'sales': 'Sales',
            'reports': 'Reports',
            'expenses': 'Expenses',
            'users': 'Users',
            'settings': 'Settings'
        };
        return names[screenName] || screenName;
    }

    refreshCurrentScreen() {
        if (this.screens[this.currentScreen]) {
            this.screens[this.currentScreen].refresh();
            this.showNotification(`${this.getScreenDisplayName(this.currentScreen)} refreshed`, 'success');
        }
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
            <button class="notification-close" onclick="window.POS.removeNotification('${id}')">&times;</button>
        `;
        
        container.appendChild(notification);
        this.notifications.push(id);
        
        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(id);
            }, duration);
        }
        
        return id;
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

    // ==================== DASHBOARD QUICK ACTIONS ====================

    openQuickSale() {
        this.loadScreen('pos');
        this.showNotification('Opening POS Terminal...', 'info');
    }

    showTodayReports() {
        this.showNotification('Opening today\'s reports...', 'info');
        this.loadScreen('reports');
    }

    openCashRegister() {
        this.showNotification('Cash register functionality coming soon', 'info');
        // Would open cash register modal
    }

    showDailySummary() {
        this.showNotification('Showing daily summary...', 'info');
        // Would open daily summary modal
    }

    showExpenseModal() {
        this.showNotification('Opening expense form...', 'info');
        this.loadScreen('expenses');
    }

    showBackupModal() {
        this.showNotification('Opening backup dialog...', 'info');
        // Would open backup modal
    }

    reorderProduct(productCode) {
        this.showNotification(`Creating purchase order for ${productCode}`, 'info');
        // Would navigate to purchase order screen
    }

    // ==================== UTILITY METHODS ====================

    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '₹0.00';
        return new Intl.NumberFormat('en-PK', {
            style: 'currency',
            currency: 'PKR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PK', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-PK', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
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

    // ==================== HELPER METHODS ====================

    handleResize() {
        // Handle responsive layout changes
        const isMobile = window.innerWidth <= 768;
        document.body.classList.toggle('mobile-view', isMobile);
        
        // Notify current screen about resize
        if (this.screens[this.currentScreen] && this.screens[this.currentScreen].handleResize) {
            this.screens[this.currentScreen].handleResize(isMobile);
        }
    }

    hasUnsavedChanges() {
        // Check if any screen has unsaved changes
        if (this.screens[this.currentScreen] && this.screens[this.currentScreen].hasUnsavedChanges) {
            return this.screens[this.currentScreen].hasUnsavedChanges();
        }
        return false;
    }

    showHelp() {
        this.showNotification('Help documentation coming soon', 'info');
    }

    quickProductSearch() {
        this.showNotification('Quick product search coming soon', 'info');
    }

    handleSave() {
        if (this.screens[this.currentScreen] && this.screens[this.currentScreen].save) {
            this.screens[this.currentScreen].save();
        } else {
            this.showNotification('No save action available for this screen', 'info');
        }
    }

    handlePrint() {
        if (this.screens[this.currentScreen] && this.screens[this.currentScreen].print) {
            this.screens[this.currentScreen].print();
        } else {
            this.showNotification('No print action available for this screen', 'info');
        }
    }

    closeCurrentModal() {
        // Close the top-most modal
        if (this.modals.length > 0) {
            const modalId = this.modals.pop();
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
            }
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            this.modals.push(modalId);
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            this.modals = this.modals.filter(id => id !== modalId);
        }
    }

    // ==================== API HELPER METHODS ====================

    async fetchWithRetry(endpoint, options = {}, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await this.api.request('GET', endpoint, options);
            } catch (error) {
                if (i === retries - 1) throw error;
                await this.sleep(1000 * (i + 1)); // Exponential backoff
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== SESSION MANAGEMENT ====================

    updateLastActivity() {
        // Update last activity timestamp
        localStorage.setItem('last_activity', Date.now());
    }

    checkSessionTimeout() {
        const lastActivity = localStorage.getItem('last_activity');
        if (lastActivity) {
            const idleTime = Date.now() - parseInt(lastActivity);
            const timeoutMinutes = 30; // 30 minutes timeout
            if (idleTime > timeoutMinutes * 60 * 1000) {
                this.showNotification('Session timeout due to inactivity', 'warning');
                this.handleLogout();
            }
        }
    }

    // ==================== DATA VALIDATION ====================

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    validatePhone(phone) {
        const re = /^[\+]?[1-9][\d]{0,15}$/;
        return re.test(phone.replace(/[\s\-\(\)]/g, ''));
    }

    validateCNIC(cnic) {
        const re = /^[0-9]{5}-[0-9]{7}-[0-9]{1}$/;
        return re.test(cnic);
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.POS = new AutoAccessoriesPOS();
    // Legacy component scripts expect `window.app` and some helper aliases.
    // Provide a lightweight compatibility layer so older components keep working.
    window.app = window.POS;
    // Common aliases used by components
    if (!window.app.logout && window.app.handleLogout) window.app.logout = window.app.handleLogout.bind(window.app);
    if (!window.app.loadScreen && window.app.loadScreen) window.app.loadScreen = window.app.loadScreen.bind(window.app);
    if (!window.app.showChangePasswordModal && window.app.showChangePasswordModal) window.app.showChangePasswordModal = window.app.showChangePasswordModal.bind(window.app);
});

// Global functions for HTML onclick handlers
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

// Global helper functions
function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined) return '0.00';
    return parseFloat(num).toFixed(decimals);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showConfirm(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// Legacy global notification shim: components sometimes call `showNotification(type, title, message)`
function showNotification(a, b, c) {
    // If POS is available, map to its API: showNotification(message, type, duration)
    if (window.POS && typeof window.POS.showNotification === 'function') {
        if (arguments.length === 1) {
            window.POS.showNotification(a);
        } else if (arguments.length === 2) {
            // (message, type)
            window.POS.showNotification(a, b);
        } else {
            // (type, title, message) => combine title and message
            const type = a || 'info';
            const title = b || '';
            const msg = c || '';
            window.POS.showNotification(title ? `${title}: ${msg}` : msg, type);
        }
    } else {
        // Fallback to alert
        alert(b || a || 'Notification');
    }
}