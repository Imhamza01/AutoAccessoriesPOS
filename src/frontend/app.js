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
        this.showLoading('Initializing application...');

        try {
            await this.checkAuthentication();
            await this.initializeApp();
            this.hideLoading();

            if (this.currentUser) {
                this.showNotification(`Welcome back, ${this.currentUser.full_name}!`, 'success', 3000);
            }

        } catch (error) {
            console.error('Initialization error:', error);
            this.hideLoading();
            this.showError('Failed to initialize application: ' + error.message);
        }
    }

    async checkAuthentication() {
        this.updateLoadingMessage('Checking authentication...');

        const accessToken = localStorage.getItem('access_token');
        const userData = localStorage.getItem('user_data');

        if (!accessToken || !userData) {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const previewFlag = urlParams.get('preview') === '1';

                if (previewFlag) {
                    console.warn('No auth tokens found — running in explicit preview mode; continuing without authentication.');
                    return;
                }
            } catch (e) {
                console.warn('Error checking preview mode, redirecting to login', e);
            }

            window.location.href = '/login.html';
            return;
        }

        try {
            await this.api.get('/auth/me');
            this.currentUser = JSON.parse(userData);
            console.log('[App] User authenticated:', this.currentUser.username, 'Role:', this.currentUser.role);

        } catch (error) {
            console.warn('Authentication failed:', error);

            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    await this.refreshToken(refreshToken);
                } catch (refreshError) {
                    this.clearAuthData();
                    window.location.href = '/login.html';
                    return;
                }
            } else {
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

            // Normalize response (APIClient may wrap response under `.data`)
            const accessToken = (response && response.data && response.data.access_token) || response.access_token;
            if (!accessToken) throw new Error('Failed to refresh access token');

            // Update tokens and API client
            localStorage.setItem('access_token', accessToken);
            this.api.setToken(accessToken);

            // Get user data (APIClient wraps /auth/me under .data)
            const userResponse = await this.api.get('/auth/me');
            const userData = (userResponse && userResponse.data) || userResponse;
            this.currentUser = userData;
            localStorage.setItem('user_data', JSON.stringify(userData));
            console.log('[App] Token refreshed, user data updated:', userData.username);
            
            if (window.refreshSidebarRBAC) {
                console.log('[App] Triggering sidebar RBAC refresh after token refresh');
                setTimeout(window.refreshSidebarRBAC, 100);
            }

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

        const initTimeout = setTimeout(() => {
            console.error('[App] Initialization timeout - forcing loading screen to hide');
            this.hideLoading();
            this.showError('Application initialization timed out. Please refresh the page.');
        }, 15000);

        try {
            console.log('[App] Initializing app...');
            
            console.log('[App] Step 1: Loading app structure (header, sidebar)...');
            await this.loadAppStructure();
            console.log('[App] ✓ App structure loaded');

            console.log('[App] Step 2: Initializing clock...');
            this.initClock();

            console.log('[App] Step 3: Setting up event listeners...');
            this.initEventListeners();

            console.log('[App] Step 4: Setting up keyboard shortcuts...');
            this.initKeyboardShortcuts();

            console.log('[App] Step 5: Loading initial screen...');
            const urlParams = new URLSearchParams(window.location.search);
            const screenParam = urlParams.get('screen');
            const targetScreen = screenParam && this.isValidScreen(screenParam) ? screenParam : 'dashboard';
            
            await this.loadScreen(targetScreen);
            console.log('[App] ✓ Screen loaded successfully');

            if (this.currentUser && this.currentUser.password_expired) {
                console.warn('User password expired - notifying user instead of showing modal.');
                this.showNotification('Your password has expired. Please change it from Settings.', 'warning', 10000);
                
                if (document.querySelectorAll('.modal-overlay[style*="flex"]').length > 0) {
                    document.querySelectorAll('.modal-overlay').forEach(modal => {
                        modal.style.display = 'none';
                    });
                    console.warn('Closed existing modals to prevent stacking');
                }
            }
            
            clearTimeout(initTimeout);
            console.log('[App] ✓ Application initialization complete!');
        } catch (error) {
            clearTimeout(initTimeout);
            console.error('[App] Initialization error:', error);
            this.showError('Failed to initialize application: ' + error.message);
        }
    }

    async loadAppStructure() {
        try {
            console.log('[App] ===== LOADING APP STRUCTURE =====');
            
            // Load header component
            console.log('[App] Step 1A: Fetching header HTML...');
            const headerHtml = await this.loadTemplate('components/header/header.html');
            console.log('[App] Step 1B: Got header HTML, finding element...');
            
            const headerEl = document.getElementById('app-header');
            if (!headerEl) {
                throw new Error('CRITICAL: Header element #app-header not found in DOM!');
            }
            console.log('[App] Step 1C: Setting header innerHTML...');
            headerEl.innerHTML = headerHtml;
            console.log('[App] ✓ Header loaded and inserted into DOM');

            // Load header CSS
            console.log('[App] Loading header CSS...');
            this.loadComponentCSS('header');

            // Load header JavaScript
            console.log('[App] Loading header JS script...');
            await this.loadComponentScript('header');
            if (window.setupHeaderEvents) try { window.setupHeaderEvents(); } catch (e) { console.warn('setupHeaderEvents error', e); }
            if (window.updateHeaderTime) try { window.updateHeaderTime(); } catch (e) { console.warn('updateHeaderTime error', e); }
            if (window.updateUserDisplay) try { window.updateUserDisplay(); } catch (e) { console.warn('updateUserDisplay error', e); }

            // Load sidebar component
            console.log('[App] Step 2A: Fetching sidebar HTML...');
            const sidebarHtml = await this.loadTemplate('components/sidebar/sidebar.html');
            console.log('[App] Step 2B: Got sidebar HTML, finding element...');
            console.log('[App] Sidebar HTML length:', sidebarHtml.length);
            console.log('[App] Sidebar HTML preview:', sidebarHtml.substring(0, 200));
            
            const sidebarEl = document.getElementById('app-sidebar');
            if (!sidebarEl) {
                throw new Error('CRITICAL: Sidebar element #app-sidebar not found in DOM!');
            }
            console.log('[App] Step 2C: Setting sidebar innerHTML...');
            sidebarEl.innerHTML = sidebarHtml;
            console.log('[App] ✓ Sidebar loaded and inserted into DOM');
            
            // Debug: Check if credit-management button is in the DOM after insertion
            const creditBtnAfterInsert = document.querySelector('[data-screen="credit-management"]');
            if (creditBtnAfterInsert) {
                console.log('[App] ✓ Credit Management button found in DOM after insertion');
            } else {
                console.error('[App] ✗ Credit Management button NOT found in DOM after insertion');
                // Let's check what buttons are actually in the DOM
                const allButtons = document.querySelectorAll('.sidebar-btn[data-screen]');
                console.log('[App] All sidebar buttons in DOM:', Array.from(allButtons).map(btn => btn.getAttribute('data-screen')));
            }

            // Load sidebar CSS
            console.log('[App] Loading sidebar CSS...');
            this.loadComponentCSS('sidebar');

            // Load sidebar JavaScript
            console.log('[App] Loading sidebar JS script...');
            await this.loadComponentScript('sidebar');
            if (window.setupSidebarEvents) try { window.setupSidebarEvents(); } catch (e) { console.warn('setupSidebarEvents error', e); }
            if (window.updateSidebarStatus) try { window.updateSidebarStatus(); } catch (e) { console.warn('updateSidebarStatus error', e); }
            if (window.checkUserManagementPermission) try { window.checkUserManagementPermission(); } catch (e) { console.warn('checkUserManagementPermission error', e); }
            if (window.updateSidebarStatus) setInterval(() => { try { window.updateSidebarStatus(); } catch (e) {/*ignore*/ } }, 5000);

            if (window.refreshSidebarRBAC) {
                try { 
                    console.log('[App] Triggering initial RBAC filtering');
                    window.refreshSidebarRBAC(); 
                } catch (e) { 
                    console.warn('refreshSidebarRBAC error', e); 
                }
            } else {
                console.warn('[App] refreshSidebarRBAC not available yet');
            }

            // Load modals component - LOAD JS FIRST to ensure functions are available
            console.log('[App] Step 3: Loading modals JavaScript...');
            await this.loadComponentScript('modals');
            
            console.log('[App] Step 4: Loading modals HTML...');
            const modalsHtml = await this.loadTemplate('components/modals/modals.html');
            const modalContainer = document.getElementById('modal-container');
            if (modalContainer) {
                modalContainer.innerHTML = modalsHtml;
                console.log('[App] ✓ Modals loaded and inserted into DOM');

                // Runtime check: ensure modal JS functions are available. If script load failed
                // (onerror resolves silently), fetch and inject the JS as a fallback so
                // screens can safely call openModal/closeModal immediately.
                if (!window.openModal) {
                    try {
                        console.warn('[App] Modal functions not present; fetching modals.js as fallback');
                        const resp = await fetch(`components/modals/modals.js?v=${Date.now()}`);
                        if (resp.ok) {
                            const code = await resp.text();
                            const script = document.createElement('script');
                            script.text = code;
                            document.head.appendChild(script);
                            console.log('[App] ✓ Fallback modals.js injected');
                        } else {
                            console.warn('[App] Failed to fetch fallback modals.js:', resp.status);
                        }
                    } catch (e) {
                        console.error('[App] Error injecting fallback modals.js', e);
                    }
                }

            } else {
                console.warn('[App] Modal container not found, skipping modals');
            }

            // Update user info in header
            console.log('[App] Updating user info...');
            this.updateUserInfo();

            // Show main app
            console.log('[App] Step 3A: Finding main-app element...');
            const mainAppEl = document.getElementById('main-app');
            if (!mainAppEl) {
                throw new Error('CRITICAL: main-app element not found in DOM!');
            }
            console.log('[App] Step 3B: Setting main-app to display: flex...');
            mainAppEl.style.display = 'flex';
            console.log('[App] ===== ✓✓✓ APP STRUCTURE LOADED SUCCESSFULLY ✓✓✓ =====');

        } catch (error) {
            console.error('[App] ===== FATAL ERROR IN loadAppStructure =====');
            console.error('[App] Error message:', error.message);
            console.error('[App] Stack:', error.stack);
            
            // Make main app visible anyway and show error
            const mainAppEl = document.getElementById('main-app');
            if (mainAppEl) {
                mainAppEl.style.display = 'flex';
                const screenContainer = document.getElementById('screen-container');
                if (screenContainer) {
                    screenContainer.innerHTML = `
                        <div style="padding: 40px; text-align: center; color: #c00; font-family: Arial; font-size: 18px; line-height: 1.6;">
                            <h2>🚨 CRITICAL ERROR - APP STRUCTURE FAILED TO LOAD</h2>
                            <p><strong>${error.message}</strong></p>
                            <p style="color: #666; font-size: 14px; margin-top: 20px; background: #ffe; padding: 20px; border-radius: 4px; border-left: 4px solid #c00;">
                                <strong>Details:</strong><br>
                                ${error.stack ? error.stack.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'No stack trace'}
                            </p>
                            <p style="color: #666; font-size: 14px; margin-top: 20px;">
                                Open browser DevTools (F12) for more details.
                            </p>
                        </div>
                    `;
                }
            }
            
            throw error;
        }
    }

    loadComponentCSS(componentName) {
        const hrefBase = `components/${componentName}/${componentName}.css`;
        const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(l => l.href && l.href.indexOf(hrefBase) !== -1);
        if (existing) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${hrefBase}?v=${Date.now()}`;
        document.head.appendChild(link);
    }

    loadComponentScript(componentName) {
        return new Promise((resolve, reject) => {
            const srcBase = `components/${componentName}/${componentName}.js`;
            const existing = Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.indexOf(srcBase) !== -1);
            if (existing) {
                // Already loaded
                return resolve();
            }

            const script = document.createElement('script');
            script.src = `${srcBase}?v=${Date.now()}`;

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
            console.log(`[App] Fetching template: ${templatePath}`);
            const response = await fetch(templatePath + "?v=" + Date.now());
            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: Failed to load template: ${templatePath}`);
                error.status = response.status;
                throw error;
            }
            const html = await response.text();
            console.log(`[App] ✓ Template loaded: ${templatePath} (${html.length} bytes)`);
            return html;
        } catch (error) {
            console.error(`[App] Template loading error: ${templatePath}`, error);
            throw error; // Throw so caller knows it failed
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
            } catch (error) {
                console.error('Logout error:', error);
            } finally {
                this.clearAuthData();
                this.showNotification('Logged out successfully', 'success', 1000);
                setTimeout(() => {
                    window.location.replace('/login.html');
                }, 100);
            }
        }
    }

    async loadScreen(screenName) {
        if (this.currentScreen === screenName && this.screens[screenName]) {
            console.log(`[App] Screen ${screenName} already loaded, skipping...`);
            return; // Screen already loaded
        }

        console.log(`[App] ===== LOADING SCREEN: ${screenName} =====`);
        this.showLoading(`Loading ${this.getScreenDisplayName(screenName)}...`);
        this.currentScreen = screenName;

        try {
            // Check if screen-container exists
            const screenContainer = document.getElementById('screen-container');
            if (!screenContainer) {
                throw new Error('CRITICAL: screen-container element not found - app structure may not have loaded properly');
            }
            console.log(`[App] ✓ screen-container found`);

            // Hide all screens
            console.log(`[App] Hiding all existing screens...`);
            const allScreens = document.querySelectorAll('.screen');
            console.log(`[App] Found ${allScreens.length} existing screen elements`);
            allScreens.forEach(screen => {
                screen.classList.remove('active');
                screen.style.display = 'none';
            });

            // Check if screen exists
            let screenElement = document.getElementById(`${screenName}-screen`);
            console.log(`[App] Looking for screen element with id="${screenName}-screen": ${screenElement ? 'FOUND' : 'NOT FOUND'}`);

            if (!screenElement) {
                // Create screen container
                console.log(`[App] Creating new screen element for: ${screenName}`);
                screenElement = document.createElement('div');
                screenElement.id = `${screenName}-screen`;
                screenElement.className = 'screen';
                screenContainer.appendChild(screenElement);
                console.log(`[App] ✓ Screen element created with id="${screenElement.id}" and class="${screenElement.className}"`);
            }

            // Load screen content
            // RBAC Route Guard - Check permissions before loading
            if (window.rbac && !window.rbac.routeGuard(screenName)) {
                // Access denied - redirect to dashboard
                if (screenName !== 'dashboard') {
                    console.log(`[App] Redirecting to dashboard due to RBAC restriction`);
                    this.loadScreen('dashboard');
                    return;
                }
            }
            if (!this.screens[screenName]) {
                console.log(`[App] Screen ${screenName} not in cache, fetching from server...`);
                const response = await fetch(`screens/${screenName}/index.html`);
                console.log(`[App] Fetch response status: ${response.status}`);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: Failed to load screen HTML: screens/${screenName}/index.html`);
                }

                const html = await response.text();
                console.log(`[App] Screen HTML received (${html.length} bytes)`);
                screenElement.innerHTML = html;
                console.log(`[App] ✓ Screen HTML inserted into DOM`);

                // Load screen CSS if exists
                console.log(`[App] Loading screen CSS: screens/${screenName}/style.css`);
                this.loadScreenCSS(screenName);

                // Load screen JavaScript
                console.log(`[App] Loading screen script: screens/${screenName}/script.js`);
                await this.loadScreenScript(screenName, screenElement);
                console.log(`[App] ✓ Screen script loaded`);

            } else {
                // Refresh existing screen
                console.log(`[App] Screen ${screenName} already cached, refreshing...`);
                if (typeof this.screens[screenName].refresh === 'function') {
                    await this.screens[screenName].refresh();
                    console.log(`[App] ✓ Screen refreshed`);
                } else {
                    console.warn(`[App] Screen ${screenName} does not have a refresh method.`);
                }
            }

            // Make screen visible
            console.log(`[App] Making screen visible: setting display=block and adding .active class`);
            screenElement.style.display = 'block';
            screenElement.classList.add('active');
            console.log(`[App] Final screen state: display="${screenElement.style.display}", class="${screenElement.className}"`);
            console.log(`[App] ===== ✓✓✓ SCREEN LOADED: ${screenName} ✓✓✓ =====`);

            // Update browser title
            document.title = `${this.getScreenDisplayName(screenName)} - Auto Accessories POS`;

        } catch (error) {
            console.error(`[App] ===== FATAL ERROR LOADING SCREEN: ${screenName} =====`);
            console.error(`[App] Error:`, error.message);
            console.error(`[App] Stack:`, error.stack);
            this.showNotification(`Failed to load ${screenName} screen: ${error.message}`, 'error');

            // Fallback to dashboard
            if (screenName !== 'dashboard') {
                console.log(`[App] Attempting fallback to dashboard...`);
                this.loadScreen('dashboard');
            }
        } finally {
            this.hideLoading();
        }

        // Update URL/History
        if (window.history && window.history.pushState) {
            const newUrl = `?screen=${screenName}`;
            if (window.location.search !== newUrl) {
                window.history.pushState({ screen: screenName }, '', newUrl);
            }
        }
    }

    async loadScreenScript(screenName, screenElement) {
        return new Promise((resolve, reject) => {
            const srcBase = `screens/${screenName}/script.js`;
            const existing = Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.indexOf(srcBase) !== -1);

            const finalizeInit = () => {
                try {
                    const className = this.getScreenClassName(screenName);

                    if (window[className]) {
                        try {
                                const instance = new window[className](this);
                                this.screens[screenName] = instance;
                                // Also register under a camelCase short name so older inline
                                // handlers (e.g. window.app.screens.creditManagement) continue
                                // to work. Example: 'credit-management' -> 'creditManagement'
                                try {
                                    const short = className.replace(/Screen$/, '');
                                    const shortCamel = short.charAt(0).toLowerCase() + short.slice(1);
                                    this.screens[shortCamel] = instance;
                                    // also expose on global window.app.screens for inline onclicks
                                    try { if (window.app && window.app.screens) window.app.screens[shortCamel] = instance; } catch(e){}
                                } catch (regErr) {
                                    console.warn('Failed to register short screen name:', regErr);
                                }

                                if (typeof instance.init === 'function') {
                                    instance.init();
                                }
                        } catch (e) {
                            console.warn(`Screen ${screenName} initialization error:`, e);
                        }
                        return resolve();
                    }

                    if (window[`init${className}`]) {
                        console.warn(`Screen ${screenName} is using legacy function-based init.`);
                        try { window[`init${className}`](); } catch (e) { console.warn(e); }
                        this.screens[screenName] = { refresh: window[`init${className}`] };
                        return resolve();
                    }

                    if (window.POS && window.POS.screens && window.POS.screens[screenName]) {
                        try {
                            const ScreenClass = window.POS.screens[screenName];
                            this.screens[screenName] = new ScreenClass(this);
                            if (typeof this.screens[screenName].init === 'function') this.screens[screenName].init();
                        } catch (e) { console.warn(e); }
                        return resolve();
                    }

                    // Nothing to initialize but resolve to avoid blocking
                    return resolve();
                } catch (error) {
                    console.error('Error in screen script finalize:', error);
                    return resolve();
                }
            };

            if (existing) {
                // If script already present, don't inject again — just init
                finalizeInit();
                return;
            }

            const script = document.createElement('script');
            script.src = `${srcBase}?v=${Date.now()}`;
            script.async = false;

            script.onload = () => {
                // Give the loaded script a tick to register globals
                setTimeout(finalizeInit, 0);
            };

            script.onerror = () => {
                console.error(`Failed to load script for screen: ${screenName}`);
                return resolve();
            };

            document.head.appendChild(script);
        });
    }

    loadScreenCSS(screenName) {
        const hrefBase = `screens/${screenName}/style.css`;
        const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(l => l.href && l.href.indexOf(hrefBase) !== -1);
        if (existingLink) return; // already loaded

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${hrefBase}?v=${Date.now()}`;
        link.onerror = () => { /* CSS file might not exist, that's okay */ };
        document.head.appendChild(link);
    }

    getScreenClassName(screenName) {
        // Special cases for screens with different naming conventions
        const specialCases = {
            'pos': 'PosScreen',
            'credit-management': 'CreditManagementScreen'
        };
        
        if (specialCases[screenName]) {
            return specialCases[screenName];
        }
        // Default: convert kebab-case to PascalCase and append 'Screen'
        return screenName
            .split('-')
            .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
            .join('') + 'Screen';
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
            'settings': 'Settings',
            'credit-management': 'Credit Management'
        };
        return names[screenName] || screenName;
    }

    isValidScreen(screenName) {
        const validScreens = ['dashboard', 'pos', 'products', 'customers', 'inventory', 'sales', 'reports', 'expenses', 'users', 'settings'];
        return validScreens.includes(screenName);
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
        
        // Create elements safely to prevent XSS
        const iconSpan = document.createElement('span');
        iconSpan.className = 'notification-icon';
        iconSpan.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';
        
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message; // Safe text content
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => window.POS.removeNotification(id);
        
        notification.appendChild(iconSpan);
        notification.appendChild(messageSpan);
        notification.appendChild(closeBtn);

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
        // Modal removed. Guide user to Settings to change password.
        this.showNotification('To change your password, open Settings → Account.', 'info', 8000);
    }

    hideChangePasswordModal() {
        // No-op: modal removed
    }

    async handlePasswordChange() {
        // Legacy handler removed. Advise user to use Settings.
        this.showNotification('Change password is handled from Settings.', 'info', 6000);
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

    async quickAction(action) {
        console.log('App Quick Action:', action);
        switch (action) {
            case 'new-sale':
                await this.loadScreen('pos');
                break;
            case 'add-product':
                await this.loadScreen('products');
                if (this.screens.products && typeof this.screens.products.showAddProductModal === 'function') {
                    this.screens.products.showAddProductModal();
                } else if (this.screens.products && typeof this.screens.products.showAddModal === 'function') {
                    // Try alternative name
                    this.screens.products.showAddModal();
                } else {
                    console.warn(`Screen 'products' does not have showAddProductModal or showAddModal method.`);
                    this.showNotification('Add Product modal not available', 'warning');
                }
                break;
            case 'add-customer':
                await this.loadScreen('customers');
                if (this.screens.customers && typeof this.screens.customers.showAddModal === 'function') {
                    this.screens.customers.showAddModal();
                } else {
                    console.warn(`Screen 'customers' does not have showAddModal method.`);
                    this.showNotification('Add Customer modal not available', 'warning');
                }
                break;
            case 'add-expense':
                await this.loadScreen('expenses');
                if (this.screens.expenses && typeof this.screens.expenses.showAddExpenseModal === 'function') {
                    this.screens.expenses.showAddExpenseModal();
                } else if (this.screens.expenses && typeof this.screens.expenses.showAddModal === 'function') {
                    this.screens.expenses.showAddModal();
                } else {
                    console.warn(`Screen 'expenses' does not have showAddExpenseModal method.`);
                }
                break;
            case 'daily-report':
            case 'quick-report':
                this.showNotification('Generating Daily Report...', 'info');
                await this.loadScreen('reports');
                break;
            case 'view-sales':
                await this.loadScreen('sales');
                break;
            case 'stock-check':
                await this.loadScreen('inventory');
                break;
            case 'backup':
                this.showNotification('Creating Backup...', 'info');
                try {
                    await this.api.post('/settings/backup/create');
                    this.showNotification('Backup created successfully', 'success');
                } catch (e) {
                    this.showNotification('Backup failed', 'error');
                }
                break;
            default:
                console.warn('Unknown quick action:', action);
        }
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

// Note: change-password modal removed; legacy global handlers were removed

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

 

// ==================== INITIALIZATION ====================

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    if (window.app) return;

    console.log('Initializing Auto Accessories POS...');
    window.app = new AutoAccessoriesPOS();
    window.POS = window.app;

    window.onpopstate = (event) => {
        if (event.state && event.state.screen) {
            window.app.loadScreen(event.state.screen);
        } else {
            window.app.loadScreen('dashboard');
        }
    };
});

