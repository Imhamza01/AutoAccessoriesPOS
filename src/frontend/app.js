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
        // INSTANT init - show loading briefly
        this.showLoading('Loading...');

        try {
            // Run auth check and app init in parallel, but don't block
            await Promise.race([
                this.checkAuthentication(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 3000))
            ]).catch(err => {
                console.warn('[App] Auth check issue:', err.message);
                // Don't block - continue anyway
            });

            // Initialize app without waiting
            this.initializeApp().catch(err => {
                console.error('[App] Init error:', err);
            });

            // Hide loading quickly
            setTimeout(() => {
                this.hideLoading();
            }, 100);

        } catch (error) {
            console.error('[App] Initialization error:', error);
            this.hideLoading();
        }
    }

    async checkAuthentication() {
        const startTime = Date.now();
        const accessToken = localStorage.getItem('access_token');
        const userData = localStorage.getItem('user_data');

        // INSTANT check - no API call yet
        if (!accessToken || !userData) {
            console.log('[Auth] No tokens found, redirecting to login');
            window.location.replace('/login.html');
            return;
        }

        // Load user from localStorage immediately (don't wait for API)
        try {
            this.currentUser = JSON.parse(userData);
            console.log(`[Auth] User loaded from cache in ${Date.now() - startTime}ms:`, this.currentUser.username);
        } catch (e) {
            console.error('[Auth] Failed to parse user data:', e);
            this.clearAuthData();
            window.location.replace('/login.html');
            return;
        }

        // Validate token in background (non-blocking)
        this.validateTokenInBackground().catch(err => {
            console.warn('[Auth] Background validation failed:', err.message);
            // User is already logged in from cache, don't disrupt
        });
    }

    async validateTokenInBackground() {
        try {
            await this.api.get('/auth/me');
            console.log('[Auth] Token validated successfully');
        } catch (error) {
            console.warn('[Auth] Token invalid, trying refresh...');
            
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    await this.refreshToken(refreshToken);
                } catch (refreshError) {
                    console.error('[Auth] Refresh failed, clearing auth');
                    this.clearAuthData();
                    window.location.replace('/login.html');
                }
            } else {
                console.error('[Auth] No refresh token, clearing auth');
                this.clearAuthData();
                window.location.replace('/login.html');
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
        // INSTANT initialization - no blocking
        try {
            // Load structure first (needed for UI)
            await this.loadAppStructure();

            // Initialize non-blocking features
            this.initClock();
            this.initEventListeners();
            this.initKeyboardShortcuts();

            // Load screen asynchronously (don't block)
            const urlParams = new URLSearchParams(window.location.search);
            const screenParam = urlParams.get('screen');
            const targetScreen = screenParam && this.isValidScreen(screenParam) ? screenParam : 'dashboard';

            // Load screen without blocking
            this.loadScreen(targetScreen).catch(err => {
                console.error('[App] Screen load error:', err);
            });

            // Check password expiration (non-blocking)
            if (this.currentUser && this.currentUser.password_expired) {
                this.showNotification('Your password has expired. Please change it from Settings.', 'warning', 10000);
            }

            console.log('[App] ✓ Application initialized');
        } catch (error) {
            console.error('[App] Initialization error:', error);
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

            // Load print dialog component
            console.log('[App] Step 5: Loading print dialog...');
            // Load CSS directly for nested path
            const printDialogCSS = document.createElement('link');
            printDialogCSS.rel = 'stylesheet';
            printDialogCSS.href = `components/modals/print-dialog.css?v=${Date.now()}`;
            document.head.appendChild(printDialogCSS);
            await this.loadPrintDialog();

            // Update user info in header
            console.log('[App] Updating user info...');
            this.updateUserInfo();

            // Update shop info
            console.log('[App] Updating shop info...');
            this.updateShopInfo();

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
        const existing = document.querySelector(`link[data-css="${componentName}"]`);
        if (existing) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `${hrefBase}?v=${Date.now()}`;
        link.setAttribute('data-css', componentName);
        document.head.appendChild(link);
    }

    loadComponentScript(componentName) {
        return new Promise((resolve, reject) => {
            const srcBase = `components/${componentName}/${componentName}.js`;
            const existing = document.querySelector(`script[data-component="${componentName}"]`);
            if (existing) {
                return resolve();
            }

            const script = document.createElement('script');
            script.src = `${srcBase}?v=${Date.now()}`;
            script.setAttribute('data-component', componentName);

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

    async loadPrintDialog() {
        try {
            console.log('[App] Loading print dialog HTML...');
            const printDialogHtml = await this.loadTemplate('components/modals/print-dialog.html');
            const modalContainer = document.getElementById('modal-container');
            if (modalContainer) {
                // Append to existing modals
                modalContainer.innerHTML += printDialogHtml;
                console.log('[App] ✓ Print dialog loaded and inserted into DOM');
            }

            // Load print dialog JavaScript
            console.log('[App] Loading print dialog JS...');
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = `components/modals/print-dialog.js?v=${Date.now()}`;
                script.onload = () => {
                    console.log('[App] ✓ Print dialog JS loaded');
                    resolve();
                };
                script.onerror = () => {
                    console.warn('[App] Failed to load print dialog JS');
                    resolve();
                };
                document.head.appendChild(script);
            });
        } catch (error) {
            console.error('[App] Print dialog loading error:', error);
        }
    }

    async updateUserInfo() {
        if (this.currentUser) {
            // Update header profile
            const userNameEl = document.getElementById('logged-user');
            const userRoleEl = document.getElementById('user-role');
            const userInitialsEl = document.getElementById('user-initials');

            if (userNameEl) userNameEl.textContent = this.currentUser.full_name;
            if (userRoleEl) userRoleEl.textContent = this.currentUser.role_name || this.currentUser.role;
            if (userInitialsEl) {
                const initials = this.currentUser.full_name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
                userInitialsEl.textContent = initials;
            }

            // Update dropdown
            const dropdownName = document.getElementById('dropdown-user-name');
            const dropdownRole = document.getElementById('dropdown-user-role');
            if (dropdownName) dropdownName.textContent = this.currentUser.full_name;
            if (dropdownRole) dropdownRole.textContent = this.currentUser.role_name || this.currentUser.role;
        }
    }

    async updateShopInfo() {
        try {
            const response = await this.api.get('/settings/shop');
            const settings = (response && response.settings) ? response.settings : response;

            if (settings) {
                // Update Shop Name in Header
                const shopNameEl = document.getElementById('shop-name');
                if (shopNameEl) shopNameEl.textContent = settings.shop_name || 'Auto Accessories POS';

                // Update Logo in Header
                const logoEl = document.getElementById('header-logo');
                let fullLogoPath = settings.logo_path;

                console.log('[App] Shop Name:', settings.shop_name);
                console.log('[App] Raw logo path:', settings.logo_path);

                if (settings.logo_path && settings.logo_path.startsWith('/') && this.api && this.api.baseURL) {
                    // Remove trailing slash from baseURL if present to avoid double slash
                    const baseUrl = this.api.baseURL.endsWith('/') ? this.api.baseURL.slice(0, -1) : this.api.baseURL;
                    fullLogoPath = `${baseUrl}${settings.logo_path}`;
                    console.log('[App] Resolved full logo path:', fullLogoPath);
                }

                if (logoEl) {
                    if (fullLogoPath) {
                        logoEl.src = fullLogoPath;
                        logoEl.style.display = 'inline-block';
                        console.log('[App] Set header logo src');
                    } else {
                        logoEl.style.display = 'none';
                        console.log('[App] Hiding header logo (no path)');
                    }
                }

                // Update global settings module for POS receipt
                if (window.shopSettings && window.shopSettings.saveSettings) {
                    // Get GST rate from API response or localStorage or default
                    const gstRate = settings.gst_rate !== undefined ? settings.gst_rate : 
                                   (window.shopSettings.getSetting('gstRate') || 0.17);
                    
                    const mappedSettings = {
                        shopName: settings.shop_name,
                        shopAddress: settings.shop_address,
                        shopPhone: settings.shop_phone,
                        shopEmail: settings.shop_email,
                        taxNumber: settings.shop_tax_id, // shop_tax_id from API -> taxNumber in ShopSettings
                        receiptMessage: settings.receipt_footer, // receipt_footer from API -> receiptMessage in ShopSettings
                        currency: settings.currency,
                        logo_path: fullLogoPath, // Use the full path we calculated
                        gstRate: gstRate
                    };
                    window.shopSettings.saveSettings(mappedSettings);
                    console.log('[App] Shop settings updated globally, GST Rate:', gstRate);
                } else {
                    // Fallback: Manually update localStorage so POS can pick it up
                    try {
                        let currentSettings = {};
                        try {
                            const saved = localStorage.getItem('shop_settings');
                            if (saved) currentSettings = JSON.parse(saved);
                        } catch (e) { /* ignore */ }

                        // Get GST rate from API response or localStorage or default
                        const gstRate = settings.gst_rate !== undefined ? settings.gst_rate :
                                       currentSettings.gstRate || 0.17;

                        const newSettings = {
                            ...currentSettings,
                            shopName: settings.shop_name,
                            shopAddress: settings.shop_address,
                            shopPhone: settings.shop_phone,
                            shopEmail: settings.shop_email,
                            taxNumber: settings.shop_tax_id,
                            receiptMessage: settings.receipt_footer,
                            currency: settings.currency,
                            logo_path: fullLogoPath,
                            gstRate: gstRate
                        };
                        localStorage.setItem('shop_settings', JSON.stringify(newSettings));
                        console.log('[App] Shop settings updated via localStorage fallback, GST Rate:', gstRate);
                    } catch (e) {
                        console.warn('Failed to save shop settings to localStorage', e);
                    }
                }
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
            // INSTANT logout - no delays
            this.clearAuthData();
            
            // Fire and forget (don't wait for response)
            this.api.post('/auth/logout').catch(() => {});
            
            // Redirect immediately
            window.location.replace('/login.html');
        }
    }

    async loadScreen(screenName) {
        console.log(`[App] ===== LOADING SCREEN: ${screenName} =====`);
        this.showLoading(`Loading ${this.getScreenDisplayName(screenName)}...`);
        
        // If already on this screen, just refresh instead of skipping
        if (this.currentScreen === screenName && this.screens[screenName]) {
            console.log(`[App] Screen ${screenName} already active, refreshing...`);
            this.currentScreen = screenName;
            if (typeof this.screens[screenName].refresh === 'function') {
                await this.screens[screenName].refresh();
            }
            this.hideLoading();
            return;
        }
        
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

            // Sync sidebar active state
            if (window.setSidebarActiveScreen) {
                window.setSidebarActiveScreen(screenName);
            }

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
            const existing = document.querySelector(`script[data-screen="${screenName}"]`);

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
                                try { if (window.app && window.app.screens) window.app.screens[shortCamel] = instance; } catch (e) { }
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
            script.setAttribute('data-screen', screenName);

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
        const existingLink = document.querySelector(`link[data-screen-css="${screenName}"]`);
        if (existingLink) return; 

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `screens/${screenName}/style.css?v=${Date.now()}`;
        link.setAttribute('data-screen-css', screenName);
        link.onerror = () => { 
            console.log(`[App] CSS not found for screen: ${screenName} (optional)`);
        };
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
        const validScreens = ['dashboard', 'pos', 'products', 'customers', 'inventory', 'sales', 'reports', 'expenses', 'users', 'settings', 'credit-management'];
        return validScreens.includes(screenName);
    }

    refreshCurrentScreen() {
        if (this.screens[this.currentScreen]) {
            this.screens[this.currentScreen].refresh();
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
        if (!container) {
            console.warn('[App] Notification container not found');
            return;
        }
        
        const id = 'notification-' + Date.now();

        const notification = document.createElement('div');
        notification.id = id;
        notification.className = `notification-item ${type}`;

        // Create elements safely to prevent XSS
        const iconSpan = document.createElement('span');
        iconSpan.className = 'notification-icon';
        iconSpan.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ';

        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-text';
        messageSpan.textContent = message; // Safe text content

        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => {
            this.removeNotification(id);
        };

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
            notification.classList.add('removing');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }

        this.notifications = this.notifications.filter(notifId => notifId !== id);
    }

    showToast(message, type = 'info', duration = 4000) {
        this.showNotification(message, type, duration);
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
    }

    showTodayReports() {
        this.loadScreen('reports');
    }

    openCashRegister() {
        // Cash register functionality coming soon
    }

    showDailySummary() {
        // Daily summary coming soon
    }

    showExpenseModal() {
        this.loadScreen('expenses');
    }

    showBackupModal() {
        // Backup modal coming soon
    }

    reorderProduct(productCode) {
        // Purchase order functionality coming soon
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


