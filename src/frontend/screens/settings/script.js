class SettingsScreen {
    constructor(app) {
        this.app = app;
        this.app.screens.settings = this; // Explicitly register for callbacks

        // Load shop settings module
        this.loadShopSettingsModule();
    }

    // Load shop settings module
    loadShopSettingsModule() {
        // Check if shop settings module is already loaded
        if (window.shopSettings) {
            console.log('Shop settings module already loaded');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'screens/pos/shop_settings.js';
            script.onload = () => {
                console.log('Shop settings module loaded in settings screen');
                resolve();
            };
            script.onerror = () => {
                console.error('Failed to load shop settings module in settings screen');
                reject(new Error('Failed to load shop settings module'));
            };
            document.head.appendChild(script);
        });
    }

    init() {
        try {
            // Hide users tab if user doesn't have permission
            if (!this.app.currentUser?.can_manage_users) {
                const usersTabBtn = document.querySelector('.tab-btn[data-tab="users"]');
                if (usersTabBtn) {
                    usersTabBtn.style.display = 'none';
                }
            }

            // Hide backup tab if user doesn't have backup/restore permissions
            if (!this.app.currentUser?.can_backup_restore) {
                const backupTabBtn = document.querySelector('.tab-btn[data-tab="backup"]');
                if (backupTabBtn) {
                    backupTabBtn.style.display = 'none';
                }
            }

            this.showTab('shop');
        } catch (e) {
            console.error('Failed to initialize settings screen:', e);
            // Fallback to show shop tab even if initialization fails
            try {
                this.showTab('shop');
            } catch (fallbackError) {
                console.error('Critical error in settings initialization:', fallbackError);
                if (this.app && this.app.showNotification) {
                    this.app.showNotification('Failed to initialize settings screen', 'error');
                }
            }
        }
    }

    refresh() {
        this.showTab('shop');
    }

    showTab(tabName) {
        try {
            // Update active tab UI
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
            if (activeBtn) activeBtn.classList.add('active');

            const contentEl = document.getElementById('settings-content');
            if (!contentEl) {
                throw new Error('Settings content container not found');
            }

            switch (tabName) {
                case 'shop':
                    this.loadShopSettings();
                    break;
                case 'account':
                    this.loadAccountSettings();
                    break;
                case 'users':
                    this.loadUsersSettings();
                    break;
                case 'printer':
                    this.loadPrinterSettings();
                    break;
                case 'backup':
                    this.loadBackupSettings();
                    break;
                default:
                    console.warn(`Unknown tab: ${tabName}`);
                    this.loadShopSettings();
            }
        } catch (e) {
            console.error('Failed to show tab:', e);
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Failed to load settings tab', 'error');
            }
        }
    }

    async loadShopSettings() {
        try {
            const response = await this.app.api.get('/settings/shop');

            // Parse response with better structure
            const shopSettings = this.parseSettingsResponse(response);

            const contentEl = document.getElementById('settings-content');
            if (!contentEl) {
                throw new Error('Settings content container not found');
            }
            contentEl.innerHTML = '';

            const form = document.createElement('form');
            form.id = 'shop-settings-form';

            // Create form elements more efficiently
            const formElements = this.createShopFormElements(shopSettings);
            formElements.forEach(element => form.appendChild(element));

            contentEl.appendChild(form);
        } catch (e) {
            console.error('Failed to load shop settings:', e);
            // Log the error for debugging
            console.error('Error details:', e);
            const contentEl = document.getElementById('settings-content');
            if (contentEl) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Failed to load shop settings: ${e.message || e}`;
                contentEl.innerHTML = '';
                contentEl.appendChild(errorDiv);
            }
        }
    }

    // Helper method to parse API responses consistently
    parseSettingsResponse(response) {
        if (response && response.settings) {
            return response.settings;
        } else if (response && response.data) {
            return response.data;
        }
        return response || {};
    }

    // Helper method to get user ID from different data formats
    getUserId(user) {
        if (user.id) {
            return user.id;
        }
        if (Array.isArray(user)) {
            return user[0] || 0;
        }
        return 0;
    }

    async selectLogo() {
        try {
            if (window.pywebview && window.pywebview.api) {
                const path = await window.pywebview.api.select_file('Image Files (*.png;*.jpg;*.jpeg)');
                if (path) {
                    // Upload logo
                    this.app.showLoading('Uploading logo...');
                    const response = await this.app.api.post('/settings/upload-logo', { file_path: path });
                    this.app.hideLoading();

                    if (response.success) {
                        document.getElementById('logo-path').value = response.logo_path;
                        this.app.showNotification('Logo uploaded successfully', 'success');

                        // Update header immediately if possible
                        if (window.app && window.app.updateShopInfo) {
                            window.app.updateShopInfo();
                        }
                    } else {
                        throw new Error(response.message || 'Upload failed');
                    }
                }
            } else {
                // Browser Fallback
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.style.display = 'none';

                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    try {
                        this.app.showLoading('Uploading logo...');

                        // Use FormData for multipart upload
                        const formData = new FormData();
                        formData.append('file', file);

                        // We need to use fetch directly or ensure api client supports FormData
                        // Assuming APIClient handles FormData if passed, or we manually set heeaders
                        // If APIClient sets Content-Type to application/json automatically, we might need to override.
                        // Let's assume we need to use raw fetch or APIClient modification.
                        // Ideally checking APIClient implementation would be good, but let's try standard fetch with auth token.

                        const token = localStorage.getItem('access_token');
                        const response = await fetch('/settings/upload-logo-file', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                                // Content-Type header is set automatically by browser with boundary for FormData
                            },
                            body: formData
                        });

                        const result = await response.json();

                        if (response.ok && result.success) {
                            document.getElementById('logo-path').value = result.logo_path;
                            this.app.showNotification('Logo uploaded successfully', 'success');
                            if (window.app && window.app.updateShopInfo) {
                                window.app.updateShopInfo();
                            }
                        } else {
                            throw new Error(result.message || result.detail || 'Upload failed');
                        }
                    } catch (err) {
                        console.error('Upload error:', err);
                        this.app.showNotification('Failed to upload logo: ' + err.message, 'error');
                    } finally {
                        this.app.hideLoading();
                        input.remove();
                    }
                };

                document.body.appendChild(input);
                input.click();
            }
        } catch (e) {
            this.app.hideLoading();
            console.error('Failed to select logo:', e);
            this.app.showNotification('Failed to select logo file: ' + (e.message || e), 'error');
        }
    }

    async loadUsersSettings() {
        try {
            const res = await this.app.api.get('/settings/users');

            let users = [];
            if (Array.isArray(res)) {
                users = res;
            } else if (res && res.users) {
                users = res.users;
            } else if (res && res.data) {
                users = res.data;
            }

            const contentEl = document.getElementById('settings-content');
            contentEl.innerHTML = '';

            // Add User button
            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-primary';
            addBtn.textContent = 'Add User';
            addBtn.onclick = () => this.addUser();
            contentEl.appendChild(addBtn);

            // Create table
            const table = document.createElement('table');
            table.className = 'data-table';
            table.style.marginTop = '20px';

            // Table header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Username', 'Full Name', 'Email', 'Role', 'Active', 'Created', 'Actions'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Table body
            const tbody = document.createElement('tbody');
            users.forEach(u => {
                const row = document.createElement('tr');

                // Username
                const usernameCell = document.createElement('td');
                usernameCell.setAttribute('data-label', 'Username');
                usernameCell.textContent = u.username || (Array.isArray(u) ? u[1] : u[0]) || 'N/A';
                row.appendChild(usernameCell);

                // Full Name
                const fullNameCell = document.createElement('td');
                fullNameCell.setAttribute('data-label', 'Full Name');
                fullNameCell.textContent = u.full_name || (Array.isArray(u) ? u[2] : u[1]) || 'N/A';
                row.appendChild(fullNameCell);

                // Email
                const emailCell = document.createElement('td');
                emailCell.setAttribute('data-label', 'Email');
                emailCell.textContent = u.email || (Array.isArray(u) ? u[3] : u[2]) || 'N/A';
                row.appendChild(emailCell);

                // Role
                const roleCell = document.createElement('td');
                roleCell.setAttribute('data-label', 'Role');
                roleCell.textContent = u.role || (Array.isArray(u) ? u[4] : u[3]) || 'N/A';
                row.appendChild(roleCell);

                // Active
                const activeCell = document.createElement('td');
                activeCell.setAttribute('data-label', 'Active');
                activeCell.textContent = (u.is_active !== undefined ? u.is_active : (Array.isArray(u) ? u[5] : u[4])) ? 'Yes' : 'No';
                row.appendChild(activeCell);

                // Created
                const createdCell = document.createElement('td');
                createdCell.setAttribute('data-label', 'Created');
                createdCell.textContent = (u.created_at || (Array.isArray(u) ? u[6] : u[5]) || '').substring(0, 10);
                row.appendChild(createdCell);

                // Actions
                const actionsCell = document.createElement('td');
                actionsCell.setAttribute('data-label', 'Actions');

                const editBtn = document.createElement('button');
                editBtn.className = 'btn-small';
                editBtn.textContent = 'Edit';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-small btn-danger';
                deleteBtn.textContent = 'Deactivate';

                // Get user ID with cleaner logic
                const userId = this.getUserId(u);

                // Use bound functions to prevent memory leaks
                const editHandler = this.editUser.bind(this, userId);
                const deleteHandler = this.deleteUser.bind(this, userId);

                editBtn.onclick = editHandler;
                deleteBtn.onclick = deleteHandler;

                actionsCell.appendChild(editBtn);
                actionsCell.appendChild(deleteBtn);
                row.appendChild(actionsCell);

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            contentEl.appendChild(table);
        } catch (e) {
            console.error('Failed to load users settings:', e);
            const contentEl = document.getElementById('settings-content');
            if (contentEl) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Failed to load users settings: ${e.message || e}`;
                contentEl.innerHTML = '';
                contentEl.appendChild(errorDiv);
            }
        }
    }

    // Helper method to create shop form elements
    createShopFormElements(shopSettings) {
        const sections = [];

        // Shop Information Section
        const shopInfoSection = document.createElement('div');
        shopInfoSection.className = 'form-section';
        const shopInfoTitle = document.createElement('h3');
        shopInfoTitle.textContent = 'Shop Information';
        shopInfoSection.appendChild(shopInfoTitle);

        const formGrid = document.createElement('div');
        formGrid.className = 'form-grid';

        const fields = [
            { label: 'Shop Name', id: 'shop-name-input', type: 'text', value: shopSettings.shop_name },
            { label: 'Phone', id: 'shop-phone', type: 'text', value: shopSettings.shop_phone },
            { label: 'Email', id: 'shop-email', type: 'email', value: shopSettings.shop_email },
            { label: 'City', id: 'shop-city', type: 'text', value: shopSettings.shop_city }
        ];

        fields.forEach(field => {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = field.label;
            const input = document.createElement('input');
            input.type = field.type;
            input.value = field.value || '';
            input.id = field.id;
            input.className = 'input-field';
            group.appendChild(label);
            group.appendChild(input);
            formGrid.appendChild(group);
        });

        shopInfoSection.appendChild(formGrid);

        // Address field
        const addressGroup = document.createElement('div');
        addressGroup.className = 'form-group';
        const addressLabel = document.createElement('label');
        addressLabel.textContent = 'Address';
        const addressTextarea = document.createElement('textarea');
        addressTextarea.id = 'shop-address';
        addressTextarea.className = 'input-field';
        addressTextarea.rows = 3;
        addressTextarea.value = shopSettings.shop_address || '';
        addressGroup.appendChild(addressLabel);
        addressGroup.appendChild(addressTextarea);
        shopInfoSection.appendChild(addressGroup);

        sections.push(shopInfoSection);

        // Tax & Legal Section
        const taxSection = document.createElement('div');
        taxSection.className = 'form-section';
        const taxTitle = document.createElement('h3');
        taxTitle.textContent = 'Tax & Legal';
        taxSection.appendChild(taxTitle);

        const taxGrid = document.createElement('div');
        taxGrid.className = 'form-grid';

        const taxFields = [
            { label: 'Owner Name', id: 'owner-name', value: shopSettings.owner_name },
            { label: 'NTN Number', id: 'ntn-number', value: shopSettings.shop_tax_id },
            { label: 'GST Number', id: 'gst-number', value: shopSettings.gst_number },
            { label: 'Currency Symbol', id: 'currency-symbol', value: shopSettings.currency || '₹' }
        ];

        taxFields.forEach(field => {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = field.label;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = field.value || '';
            input.id = field.id;
            input.className = 'input-field';
            group.appendChild(label);
            group.appendChild(input);
            taxGrid.appendChild(group);
        });

        taxSection.appendChild(taxGrid);
        sections.push(taxSection);

        // Branding Section
        const brandingSection = document.createElement('div');
        brandingSection.className = 'form-section';
        const brandingTitle = document.createElement('h3');
        brandingTitle.textContent = 'Branding';
        brandingSection.appendChild(brandingTitle);

        // Logo Path
        const logoGroup = document.createElement('div');
        logoGroup.className = 'form-group';
        const logoLabel = document.createElement('label');
        logoLabel.textContent = 'Logo Path';
        const logoDiv = document.createElement('div');
        logoDiv.style.display = 'flex';
        logoDiv.style.gap = '10px';
        const logoInput = document.createElement('input');
        logoInput.type = 'text';
        logoInput.value = shopSettings.logo_path || '';
        logoInput.id = 'logo-path';
        logoInput.className = 'input-field';
        logoInput.style.flex = '1';
        const browseBtn = document.createElement('button');
        browseBtn.type = 'button';
        browseBtn.className = 'btn btn-secondary';
        browseBtn.textContent = 'Browse';
        browseBtn.onclick = () => this.selectLogo();
        logoDiv.appendChild(logoInput);
        logoDiv.appendChild(browseBtn);
        logoGroup.appendChild(logoLabel);
        logoGroup.appendChild(logoDiv);
        brandingSection.appendChild(logoGroup);

        // Receipt Footer
        const footerGroup = document.createElement('div');
        footerGroup.className = 'form-group';
        const footerLabel = document.createElement('label');
        footerLabel.textContent = 'Receipt Footer';
        const footerTextarea = document.createElement('textarea');
        footerTextarea.id = 'receipt-footer';
        footerTextarea.className = 'input-field';
        footerTextarea.rows = 3;
        footerTextarea.value = shopSettings.receipt_footer || '';
        footerGroup.appendChild(footerLabel);
        footerGroup.appendChild(footerTextarea);
        brandingSection.appendChild(footerGroup);

        sections.push(brandingSection);

        // Action Buttons
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.onclick = () => this.saveShop();
        const saveSpan = document.createElement('span');
        saveSpan.textContent = 'Save Changes';
        saveBtn.appendChild(saveSpan);
        actionButtons.appendChild(saveBtn);

        sections.push(actionButtons);

        return sections;
    }

    async loadPrinterSettings() {
        try {
            const res = await this.app.api.get('/settings/printer');

            let printers = [];
            if (Array.isArray(res)) {
                printers = res;
            } else if (res && res.printers) {
                printers = res.printers;
            } else if (res && res.data) {
                printers = res.data;
            }

            const contentEl = document.getElementById('settings-content');
            contentEl.innerHTML = '';

            // Add Printer button
            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-primary';
            addBtn.textContent = 'Add Printer';
            addBtn.onclick = () => this.addPrinter();
            contentEl.appendChild(addBtn);

            // Create table
            const table = document.createElement('table');
            table.className = 'data-table';
            table.style.marginTop = '20px';

            // Table header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Name', 'Type', 'Port', 'Default', 'Actions'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Table body
            const tbody = document.createElement('tbody');
            printers.forEach(p => {
                const row = document.createElement('tr');

                // Name
                const nameCell = document.createElement('td');
                nameCell.setAttribute('data-label', 'Name');
                nameCell.textContent = p.printer_name || (Array.isArray(p) ? p[1] : p.name) || 'N/A';
                row.appendChild(nameCell);

                // Type
                const typeCell = document.createElement('td');
                typeCell.setAttribute('data-label', 'Type');
                typeCell.textContent = p.printer_type || (Array.isArray(p) ? p[2] : p.type) || 'N/A';
                row.appendChild(typeCell);

                // Port
                const portCell = document.createElement('td');
                portCell.setAttribute('data-label', 'Port');
                portCell.textContent = p.connection_string || (Array.isArray(p) ? p[3] : p.connection_string) || 'N/A';
                row.appendChild(portCell);

                // Default
                const defaultCell = document.createElement('td');
                defaultCell.setAttribute('data-label', 'Default');
                defaultCell.textContent = (p.is_default !== undefined ? p.is_default : (Array.isArray(p) ? p[5] : p.default)) ? 'Yes' : 'No';
                row.appendChild(defaultCell);

                // Actions
                const actionsCell = document.createElement('td');
                actionsCell.setAttribute('data-label', 'Actions');

                const editBtn = document.createElement('button');
                editBtn.className = 'btn-small';
                editBtn.textContent = 'Edit';

                // Get printer ID with cleaner logic
                const printerId = p.id || (Array.isArray(p) ? p[0] : 0) || 0;
                editBtn.onclick = () => this.editPrinter(printerId);

                actionsCell.appendChild(editBtn);
                row.appendChild(actionsCell);

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            contentEl.appendChild(table);
        } catch (e) {
            console.error('Failed to load printer settings:', e);
            const contentEl = document.getElementById('settings-content');
            if (contentEl) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Failed to load printer settings: ${e.message || 'Unknown error'}`;
                contentEl.innerHTML = '';
                contentEl.appendChild(errorDiv);
            }
        }
    }

    async loadBackupSettings() {
        try {
            const res = await this.app.api.get('/settings/backup');

            let backups = [];
            if (Array.isArray(res)) {
                backups = res;
            } else if (res && res.backups) {
                backups = res.backups;
            } else if (res && res.data) {
                backups = res.data;
            }

            const contentEl = document.getElementById('settings-content');
            contentEl.innerHTML = '';

            // Actions Container
            const actionsContainer = document.createElement('div');
            actionsContainer.style.display = 'flex';
            actionsContainer.style.gap = '10px';
            actionsContainer.style.marginBottom = '20px';

            // Create Backup button
            const createBtn = document.createElement('button');
            createBtn.className = 'btn btn-primary';
            createBtn.textContent = 'Create Backup Now';
            createBtn.onclick = () => this.createBackup();
            actionsContainer.appendChild(createBtn);

            // Restore from File button
            const restoreFileBtn = document.createElement('button');
            restoreFileBtn.className = 'btn btn-secondary';
            restoreFileBtn.textContent = 'Restore from File';
            restoreFileBtn.onclick = () => this.restoreFromFile();
            actionsContainer.appendChild(restoreFileBtn);

            // Factory Reset button
            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn btn-danger';
            resetBtn.textContent = 'Factory Reset';
            resetBtn.onclick = () => this.factoryReset();
            actionsContainer.appendChild(resetBtn);

            contentEl.appendChild(actionsContainer);

            // Recent Backups title
            const title = document.createElement('h3');
            title.textContent = 'Recent Backups';
            contentEl.appendChild(title);

            // Create table
            const table = document.createElement('table');
            table.className = 'data-table';

            // Table header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Date', 'Size', 'Actions'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Table body
            const tbody = document.createElement('tbody');
            if (backups.length === 0) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 3;
                cell.textContent = 'No backups found';
                cell.style.textAlign = 'center';
                row.appendChild(cell);
                tbody.appendChild(row);
            } else {
                backups.forEach(b => {
                    const row = document.createElement('tr');

                    // Date
                    const dateCell = document.createElement('td');
                    dateCell.textContent = (b.created_at || (Array.isArray(b) ? b[3] : b.date) || '').replace('T', ' ').substring(0, 19);
                    row.appendChild(dateCell);

                    // Size
                    const sizeCell = document.createElement('td');
                    const sizeKB = (b.file_size || (Array.isArray(b) ? b[2] : b.size) || 0) / 1024;
                    sizeCell.textContent = sizeKB.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' KB';
                    row.appendChild(sizeCell);

                    // Actions
                    const actionsCell = document.createElement('td');
                    const restoreBtn = document.createElement('button');
                    restoreBtn.className = 'btn-small';
                    restoreBtn.textContent = 'Restore';

                    const backupId = b.id || (Array.isArray(b) ? b[0] : b.id) || 0;
                    restoreBtn.onclick = () => this.restoreBackup(backupId);

                    actionsCell.appendChild(restoreBtn);
                    row.appendChild(actionsCell);

                    tbody.appendChild(row);
                });
            }

            table.appendChild(tbody);
            contentEl.appendChild(table);
        } catch (e) {
            console.error('Failed to load backup settings:', e);
            const contentEl = document.getElementById('settings-content');
            if (contentEl) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Failed to load backup settings: ${e.message || e}`;
                contentEl.innerHTML = '';
                contentEl.appendChild(errorDiv);
            }
        }
    }

    async createBackup() {
        try {
            this.app.showLoading('Creating backup...');
            const response = await this.app.api.post('/settings/backup/create');
            if (response.success) {
                this.app.showNotification('Backup created successfully', 'success');
                this.loadBackupSettings(); // Refresh list
            } else {
                this.app.showNotification('Backup failed: ' + response.message, 'error');
            }
        } catch (e) {
            this.app.showNotification('Failed to create backup: ' + e.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    async restoreBackup(backupId) {
        if (!confirm('Are you sure you want to restore this backup? Current data will be replaced.')) return;

        try {
            this.app.showLoading('Restoring backup...');
            const response = await this.app.api.post(`/settings/backup/${backupId}/restore`);
            if (response.success) {
                alert('Restore successful. Application will restart.');
                if (window.pywebview) {
                    // Reload to apply changes if needed, or simply let user know
                    window.location.reload();
                }
            } else {
                throw new Error(response.message || 'Restore failed');
            }
        } catch (e) {
            this.app.showNotification('Restore failed: ' + e.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    async restoreFromFile() {
        if (window.pywebview && window.pywebview.api) {
            const path = await window.pywebview.api.select_file('Database Files (*.db;*.sqlite)');
            if (path) {
                if (!confirm('Are you sure you want to restore from: ' + path + '? Current data will be replaced.')) return;

                try {
                    this.app.showLoading('Restoring backup...');
                    const response = await this.app.api.post('/settings/backup/restore-from-file', { file_path: path });
                    if (response.success) {
                        alert('Restore successful. Application will restart.');
                        window.location.reload();
                    } else {
                        throw new Error(response.message || 'Restore failed');
                    }
                } catch (e) {
                    this.app.showNotification('Restore failed: ' + e.message, 'error');
                } finally {
                    this.app.hideLoading();
                }
            }
        } else {
            // Browser Fallback
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.db,.sqlite';
            input.style.display = 'none';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!confirm('Are you sure you want to restore from: ' + file.name + '? Current data will be replaced.')) return;

                try {
                    this.app.showLoading('Restoring backup...');
                    const formData = new FormData();
                    formData.append('file', file);

                    const token = localStorage.getItem('access_token');
                    const response = await fetch('/settings/backup/restore-upload', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        alert('Restore successful. Application will restart.');
                        window.location.reload();
                    } else {
                        throw new Error(result.message || result.detail || 'Restore failed');
                    }
                } catch (err) {
                    console.error('Restore error:', err);
                    this.app.showNotification('Restore failed: ' + err.message, 'error');
                } finally {
                    this.app.hideLoading();
                    input.remove();
                }
            };

            document.body.appendChild(input);
            input.click();
        }
    }

    async factoryReset() {
        const confirmCode = prompt('WARNING: This will delete ALL data (products, sales, customers). \n\nType "RESET" to confirm:');
        if (confirmCode !== 'RESET') return;

        try {
            this.app.showLoading('Resetting to factory defaults...');
            const response = await this.app.api.post('/settings/backup/factory-reset', { confirm: 'RESET' });
            if (response.success) {
                alert('Factory reset successful. Application will restart.');
                window.location.reload();
            } else {
                throw new Error(response.message || 'Reset failed');
            }
        } catch (e) {
            this.app.showNotification('Reset failed: ' + e.message, 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    async loadAccountSettings() {
        try {
            // Load current user information
            const user = this.app.currentUser;

            if (!user) {
                throw new Error('User information not available');
            }

            const contentEl = document.getElementById('settings-content');
            if (!contentEl) {
                throw new Error('Settings content container not found');
            }

            contentEl.innerHTML = '';

            // Create Account Settings header
            const header = document.createElement('h2');
            header.textContent = 'Account Settings';
            contentEl.appendChild(header);

            // Personal Information Section
            const personalSection = document.createElement('div');
            personalSection.className = 'form-section';

            const personalTitle = document.createElement('h3');
            personalTitle.textContent = 'Personal Information';
            personalSection.appendChild(personalTitle);

            const personalGrid = document.createElement('div');
            personalGrid.className = 'form-grid';

            // Full Name field
            const fullNameGroup = document.createElement('div');
            fullNameGroup.className = 'form-group';
            const fullNameLabel = document.createElement('label');
            fullNameLabel.textContent = 'Full Name';
            const fullNameInput = document.createElement('input');
            fullNameInput.type = 'text';
            fullNameInput.id = 'account-full-name';
            fullNameInput.className = 'input-field';
            fullNameInput.value = user.full_name || '';
            fullNameInput.readOnly = true;
            fullNameGroup.appendChild(fullNameLabel);
            fullNameGroup.appendChild(fullNameInput);
            personalGrid.appendChild(fullNameGroup);

            // Username field
            const usernameGroup = document.createElement('div');
            usernameGroup.className = 'form-group';
            const usernameLabel = document.createElement('label');
            usernameLabel.textContent = 'Username';
            const usernameInput = document.createElement('input');
            usernameInput.type = 'text';
            usernameInput.id = 'account-username';
            usernameInput.className = 'input-field';
            usernameInput.value = user.username || '';
            usernameInput.readOnly = true;
            usernameGroup.appendChild(usernameLabel);
            usernameGroup.appendChild(usernameInput);
            personalGrid.appendChild(usernameGroup);

            // Role field
            const roleGroup = document.createElement('div');
            roleGroup.className = 'form-group';
            const roleLabel = document.createElement('label');
            roleLabel.textContent = 'Role';
            const roleInput = document.createElement('input');
            roleInput.type = 'text';
            roleInput.id = 'account-role';
            roleInput.className = 'input-field';
            roleInput.value = user.role_name || user.role || '';
            roleInput.readOnly = true;
            roleGroup.appendChild(roleLabel);
            roleGroup.appendChild(roleInput);
            personalGrid.appendChild(roleGroup);

            personalSection.appendChild(personalGrid);
            contentEl.appendChild(personalSection);

            // Change Password Section
            const passwordSection = document.createElement('div');
            passwordSection.className = 'form-section';

            const passwordTitle = document.createElement('h3');
            passwordTitle.textContent = 'Change Password';
            passwordSection.appendChild(passwordTitle);

            const passwordGrid = document.createElement('div');
            passwordGrid.className = 'form-grid';

            // Current Password field
            const currentPasswordGroup = document.createElement('div');
            currentPasswordGroup.className = 'form-group';
            const currentPasswordLabel = document.createElement('label');
            currentPasswordLabel.textContent = 'Current Password';
            const currentPasswordInput = document.createElement('input');
            currentPasswordInput.type = 'password';
            currentPasswordInput.id = 'current-password';
            currentPasswordInput.className = 'input-field';
            currentPasswordInput.placeholder = 'Enter current password';
            currentPasswordGroup.appendChild(currentPasswordLabel);
            currentPasswordGroup.appendChild(currentPasswordInput);
            passwordGrid.appendChild(currentPasswordGroup);

            // New Password field
            const newPasswordGroup = document.createElement('div');
            newPasswordGroup.className = 'form-group';
            const newPasswordLabel = document.createElement('label');
            newPasswordLabel.textContent = 'New Password';
            const newPasswordInput = document.createElement('input');
            newPasswordInput.type = 'password';
            newPasswordInput.id = 'new-password';
            newPasswordInput.className = 'input-field';
            newPasswordInput.placeholder = 'Enter new password';
            newPasswordGroup.appendChild(newPasswordLabel);
            newPasswordGroup.appendChild(newPasswordInput);
            passwordGrid.appendChild(newPasswordGroup);

            // Confirm Password field
            const confirmPasswordGroup = document.createElement('div');
            confirmPasswordGroup.className = 'form-group';
            const confirmPasswordLabel = document.createElement('label');
            confirmPasswordLabel.textContent = 'Confirm New Password';
            const confirmPasswordInput = document.createElement('input');
            confirmPasswordInput.type = 'password';
            confirmPasswordInput.id = 'confirm-password';
            confirmPasswordInput.className = 'input-field';
            confirmPasswordInput.placeholder = 'Confirm new password';
            confirmPasswordGroup.appendChild(confirmPasswordLabel);
            confirmPasswordGroup.appendChild(confirmPasswordInput);
            passwordGrid.appendChild(confirmPasswordGroup);

            passwordSection.appendChild(passwordGrid);

            // Action buttons
            const actionButtons = document.createElement('div');
            actionButtons.className = 'action-buttons';
            const changePasswordBtn = document.createElement('button');
            changePasswordBtn.type = 'button';
            changePasswordBtn.className = 'btn btn-primary';
            changePasswordBtn.textContent = 'Change Password';
            changePasswordBtn.onclick = () => this.changePassword();
            actionButtons.appendChild(changePasswordBtn);
            passwordSection.appendChild(actionButtons);

            contentEl.appendChild(passwordSection);
        } catch (e) {
            console.error('Failed to load account settings:', e);
            const contentEl = document.getElementById('settings-content');
            if (contentEl) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Failed to load account settings: ${e.message || 'Unknown error'}`;
                contentEl.innerHTML = '';
                contentEl.appendChild(errorDiv);
            }
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Failed to load account settings', 'error');
            }
        }
    }

    async changePassword() {
        try {
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // Validation
            if (!currentPassword || !newPassword || !confirmPassword) {
                this.app.showNotification('Please fill in all password fields', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                this.app.showNotification('New passwords do not match', 'error');
                return;
            }

            if (newPassword.length < 6) {
                this.app.showNotification('New password must be at least 6 characters', 'error');
                return;
            }

            // Call the API to change password
            const response = await this.app.api.post('/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            });

            if (response.success) {
                this.app.showNotification('Password changed successfully', 'success');

                // Clear password fields
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } else {
                this.app.showNotification(response.message || 'Failed to change password', 'error');
            }
        } catch (e) {
            console.error('Failed to change password:', e);
            this.app.showNotification('Failed to change password: ' + (e.message || e), 'error');
        }
    }

    async saveShop() {
        try {
            const formData = {
                shop_name: document.getElementById('shop-name-input').value,
                shop_phone: document.getElementById('shop-phone').value,
                shop_email: document.getElementById('shop-email').value,
                shop_address: document.getElementById('shop-address').value,
                shop_city: document.getElementById('shop-city').value,
                owner_name: document.getElementById('owner-name').value,
                ntn_number: document.getElementById('ntn-number').value,
                gst_number: document.getElementById('gst-number').value,
                currency_symbol: document.getElementById('currency-symbol').value,
                receipt_footer: document.getElementById('receipt-footer').value,
                logo_path: document.getElementById('logo-path').value
            };

            console.log('Saving shop settings:', formData); // Debug log

            const response = await this.app.api.put('/settings/shop', formData);
            console.log('Save response:', response); // Debug log

            // Also update localStorage to keep systems synchronized
            if (window.shopSettings) {
                const localStorageSettings = {
                    shopName: formData.shop_name,
                    shopPhone: formData.shop_phone,
                    shopEmail: formData.shop_email,
                    shopAddress: formData.shop_address,
                    taxNumber: formData.ntn_number,
                    receiptMessage: formData.receipt_footer,
                    currency: formData.currency_symbol,
                    // Preserve GST rate from current settings or default to 0.17
                    gstRate: (window.shopSettings && window.shopSettings.getSetting('gstRate')) || 0.17
                };
                window.shopSettings.saveSettings(localStorageSettings);
            }

            this.app.showNotification('Shop settings saved successfully and synchronized!', 'success');
        } catch (e) {
            console.error('Failed to save shop settings:', e);
            console.error('Error details:', e);
            this.app.showNotification('Failed to save shop settings: ' + (e.message || e), 'error');
        }
    }

    async addUser() {
        // Show add user modal/form
        document.getElementById('settings-content').innerHTML = `
            <h2>Add New User</h2>
            <form id="add-user-form">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="new-username" class="input-field" required>
                </div>
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" id="new-full-name" class="input-field" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="new-email" class="input-field">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="new-password" class="input-field" required>
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <select id="new-role" class="input-field">
                        <option value="shop_boy">Shop Boy (Cashier)</option>
                        <option value="stock_boy">Stock Boy</option>
                        <option value="munshi">Munshi (Manager)</option>
                        <option value="malik">Malik (Owner)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Active</label>
                    <input type="checkbox" id="new-is-active" class="input-checkbox" checked>
                </div>
                <button type="button" class="btn btn-primary" onclick="window.app.screens.settings.saveNewUser()">Save User</button>
                <button type="button" class="btn btn-secondary" onclick="window.app.screens.settings.loadUsersSettings()">Cancel</button>
            </form>
        `;
    }

    async editUser(id) {
        try {
            const res = await this.app.api.get('/settings/users');
            let users = [];
            if (res && res.users) {
                users = res.users;
            } else if (Array.isArray(res)) {
                users = res;
            } else if (res && res.data) {
                users = res.data;
            }

            const user = users.find(u => u.id == id);
            if (!user) {
                this.app.showNotification('User not found', 'error');
                return;
            }

            const contentEl = document.getElementById('settings-content');
            if (!contentEl) {
                throw new Error('Settings content container not found');
            }
            contentEl.innerHTML = '';

            // Create Edit User header
            const header = document.createElement('h2');
            header.textContent = 'Edit User';
            contentEl.appendChild(header);

            // Create form
            const form = document.createElement('form');
            form.id = 'edit-user-form';

            // Hidden user ID field
            const hiddenId = document.createElement('input');
            hiddenId.type = 'hidden';
            hiddenId.id = 'edit-user-id';
            hiddenId.value = user.id;
            form.appendChild(hiddenId);

            // Username field
            const usernameGroup = document.createElement('div');
            usernameGroup.className = 'form-group';
            const usernameLabel = document.createElement('label');
            usernameLabel.textContent = 'Username';
            const usernameInput = document.createElement('input');
            usernameInput.type = 'text';
            usernameInput.id = 'edit-username';
            usernameInput.className = 'input-field';
            usernameInput.value = user.username || '';
            usernameInput.required = true;
            usernameGroup.appendChild(usernameLabel);
            usernameGroup.appendChild(usernameInput);
            form.appendChild(usernameGroup);

            // Full Name field
            const fullNameGroup = document.createElement('div');
            fullNameGroup.className = 'form-group';
            const fullNameLabel = document.createElement('label');
            fullNameLabel.textContent = 'Full Name';
            const fullNameInput = document.createElement('input');
            fullNameInput.type = 'text';
            fullNameInput.id = 'edit-full-name';
            fullNameInput.className = 'input-field';
            fullNameInput.value = user.full_name || '';
            fullNameInput.required = true;
            fullNameGroup.appendChild(fullNameLabel);
            fullNameGroup.appendChild(fullNameInput);
            form.appendChild(fullNameGroup);

            // Email field
            const emailGroup = document.createElement('div');
            emailGroup.className = 'form-group';
            const emailLabel = document.createElement('label');
            emailLabel.textContent = 'Email';
            const emailInput = document.createElement('input');
            emailInput.type = 'email';
            emailInput.id = 'edit-email';
            emailInput.className = 'input-field';
            emailInput.value = user.email || '';
            emailGroup.appendChild(emailLabel);
            emailGroup.appendChild(emailInput);
            form.appendChild(emailGroup);

            // Password field
            const passwordGroup = document.createElement('div');
            passwordGroup.className = 'form-group';
            const passwordLabel = document.createElement('label');
            passwordLabel.textContent = 'New Password';
            const passwordInput = document.createElement('input');
            passwordInput.type = 'password';
            passwordInput.id = 'edit-password';
            passwordInput.className = 'input-field';
            passwordInput.placeholder = 'Leave blank to keep current password';
            passwordGroup.appendChild(passwordLabel);
            passwordGroup.appendChild(passwordInput);
            form.appendChild(passwordGroup);

            // Role field
            const roleGroup = document.createElement('div');
            roleGroup.className = 'form-group';
            const roleLabel = document.createElement('label');
            roleLabel.textContent = 'Role';
            const roleSelect = document.createElement('select');
            roleSelect.id = 'edit-role';
            roleSelect.className = 'input-field';

            const roles = [
                { value: 'shop_boy', text: 'Shop Boy (Cashier)' },
                { value: 'stock_boy', text: 'Stock Boy' },
                { value: 'munshi', text: 'Munshi (Manager)' },
                { value: 'malik', text: 'Malik (Owner)' }
            ];

            roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role.value;
                option.textContent = role.text;
                if (user.role === role.value) {
                    option.selected = true;
                }
                roleSelect.appendChild(option);
            });

            roleGroup.appendChild(roleLabel);
            roleGroup.appendChild(roleSelect);
            form.appendChild(roleGroup);

            // Active field
            const activeGroup = document.createElement('div');
            activeGroup.className = 'form-group';
            const activeLabel = document.createElement('label');
            activeLabel.textContent = 'Active';
            const activeInput = document.createElement('input');
            activeInput.type = 'checkbox';
            activeInput.id = 'edit-is-active';
            activeInput.className = 'input-checkbox';
            activeInput.checked = user.is_active;
            activeGroup.appendChild(activeLabel);
            activeGroup.appendChild(activeInput);
            form.appendChild(activeGroup);

            // Action buttons
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn btn-primary';
            saveBtn.textContent = 'Save Changes';
            saveBtn.onclick = () => this.saveEditedUser();
            form.appendChild(saveBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => this.loadUsersSettings();
            form.appendChild(cancelBtn);

            contentEl.appendChild(form);
        } catch (e) {
            console.error('Failed to load user for editing:', e);
            const contentEl = document.getElementById('settings-content');
            if (contentEl) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.textContent = `Failed to load user: ${e.message || 'Unknown error'}`;
                contentEl.innerHTML = '';
                contentEl.appendChild(errorDiv);
            }
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Failed to load user', 'error');
            }
        }
    }

    async saveNewUser() {
        try {
            console.log('Attempting to create new user');
            const usernameEl = document.getElementById('new-username');
            const fullNameEl = document.getElementById('new-full-name');
            const emailEl = document.getElementById('new-email');
            const passwordEl = document.getElementById('new-password');
            const roleEl = document.getElementById('new-role');
            const activeEl = document.getElementById('new-is-active');

            if (!usernameEl || !fullNameEl || !passwordEl || !roleEl || !activeEl) {
                throw new Error('Required form elements not found');
            }

            const userData = {
                username: usernameEl.value,
                full_name: fullNameEl.value,
                email: emailEl ? emailEl.value : '',
                password: passwordEl.value,
                role: roleEl.value,
                is_active: activeEl.checked
            };

            console.log('Creating user with role:', userData.role);
            const response = await this.app.api.post('/settings/users', userData);

            if (response && response.success === false) {
                throw new Error(response.message || 'Server returned error');
            }

            console.log('User created successfully:', userData.username);
            this.app.showNotification('User created successfully', 'success');
            this.loadUsersSettings(); // Refresh the user list
        } catch (e) {
            console.error('Failed to create user:', e);
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Failed to create user: ' + (e.message || 'Unknown error'), 'error');
            }
        }
    }

    async saveEditedUser() {
        try {
            const userIdEl = document.getElementById('edit-user-id');
            const fullNameEl = document.getElementById('edit-full-name');
            const emailEl = document.getElementById('edit-email');
            const roleEl = document.getElementById('edit-role');
            const activeEl = document.getElementById('edit-is-active');
            const passwordEl = document.getElementById('edit-password');

            if (!userIdEl || !fullNameEl || !roleEl || !activeEl) {
                throw new Error('Required form elements not found');
            }

            const userData = {
                full_name: fullNameEl.value,
                email: emailEl ? emailEl.value : '',
                role: roleEl.value,
                is_active: activeEl.checked
            };

            // Add password if it was entered
            if (passwordEl && passwordEl.value) {
                userData.password = passwordEl.value;
            }

            const response = await this.app.api.put(`/settings/users/${userIdEl.value}`, userData);

            if (response && response.success === false) {
                throw new Error(response.message || 'Server returned error');
            }

            this.app.showNotification('User updated successfully', 'success');
            this.loadUsersSettings(); // Refresh the user list
        } catch (e) {
            console.error('Failed to update user:', e);
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Failed to update user: ' + (e.message || 'Unknown error'), 'error');
            }
        }
    }

    async deleteUser(id) {
        if (!confirm('Are you sure you want to delete this user?')) return;

        try {
            await this.app.api.delete(`/users/${id}`);
            this.app.showNotification('User deleted successfully', 'success');
            this.loadUsersSettings(); // Refresh the user list
        } catch (e) {
            console.error('Failed to delete user:', e);
            this.app.showNotification('Failed to delete user: ' + (e.message || e), 'error');
        }
    }

    async addPrinter() {
        // Show add printer form
        document.getElementById('settings-content').innerHTML = `
            <h2>Add New Printer</h2>
            <form id="add-printer-form">
                <div class="form-group">
                    <label>Printer Name</label>
                    <input type="text" id="new-printer-name" class="input-field" required>
                </div>
                <div class="form-group">
                    <label>Printer Type</label>
                    <select id="new-printer-type" class="input-field">
                        <option value="thermal">Thermal</option>
                        <option value="laser">Laser</option>
                        <option value="dot_matrix">Dot Matrix</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Connection String</label>
                    <input type="text" id="new-connection-string" class="input-field" placeholder="e.g., COM1, LPT1, IP address">
                </div>
                <div class="form-group">
                    <label>Paper Width (mm)</label>
                    <input type="number" id="new-paper-width" class="input-field" value="80">
                </div>
                <div class="form-group">
                    <label>Is Default</label>
                    <input type="checkbox" id="new-is-default" class="input-checkbox">
                </div>
                <div class="form-group">
                    <label>Is Active</label>
                    <input type="checkbox" id="new-is-active" class="input-checkbox" checked>
                </div>
                <button type="button" class="btn btn-primary" onclick="window.app.screens.settings.saveNewPrinter()">Save Printer</button>
                <button type="button" class="btn btn-secondary" onclick="window.app.screens.settings.loadPrinterSettings()">Cancel</button>
            </form>
        `;
    }

    async editPrinter(id) {
        // For now, just show a notification since editing printer details requires more complex implementation
        this.app.showNotification('Edit printer functionality needs implementation', 'info');
    }

    async saveNewPrinter() {
        try {
            const printerData = {
                printer_name: document.getElementById('new-printer-name').value,
                printer_type: document.getElementById('new-printer-type').value,
                connection_string: document.getElementById('new-connection-string').value,
                paper_width: parseInt(document.getElementById('new-paper-width').value) || 80,
                is_default: document.getElementById('new-is-default').checked,
                is_active: document.getElementById('new-is-active').checked
            };

            await this.app.api.post('/settings/printer', printerData);

            this.app.showNotification('Printer added successfully', 'success');
            this.loadPrinterSettings(); // Refresh the printer list
        } catch (e) {
            console.error('Failed to add printer:', e);
            this.app.showNotification('Failed to add printer: ' + (e.message || e), 'error');
        }
    }

    async createBackup() {
        try {
            this.app.showLoading('Creating backup...');
            await this.app.api.post('/settings/backup/create');
            this.app.showNotification('Backup created successfully', 'success');
            this.loadBackupSettings(); // Refresh the backup list
        } catch (e) {
            console.error('Failed to create backup:', e);
            this.app.showNotification('Failed to create backup: ' + (e.message || e), 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    async restoreBackup(id) {
        if (!confirm('Are you sure you want to restore this backup? This will overwrite current data.')) return;

        try {
            this.app.showLoading('Restoring backup...');
            const response = await this.app.api.post(`/settings/backup/${id}/restore`);

            if (response.success) {
                alert(response.message);
                window.location.reload();
            } else {
                throw new Error(response.message || 'Restore failed');
            }
        } catch (e) {
            console.error('Failed to restore backup:', e);
            this.app.showNotification('Failed to restore backup: ' + (e.message || e), 'error');
        } finally {
            this.app.hideLoading();
        }
    }

    async factoryReset() {
        const confirmCode = prompt("WARNING: This will delete ALL data (Sales, Customers, Inventory).\n\nType 'RESET' to confirm:");
        if (confirmCode !== 'RESET') {
            if (confirmCode !== null) this.app.showNotification("Reset cancelled. Code did not match.", 'info');
            return;
        }

        try {
            this.app.showLoading('Performing Factory Reset...');
            const response = await this.app.api.post('/settings/backup/factory-reset', { confirm: 'RESET' });

            if (response.success) {
                alert(response.message);
                window.location.reload();
            } else {
                throw new Error(response.message || 'Factory reset failed');
            }
        } catch (e) {
            console.error('Factory reset failed:', e);
            this.app.showNotification('Factory reset failed: ' + (e.message || e), 'error');
        } finally {
            this.app.hideLoading();
        }
    }
}

window.SettingsScreen = SettingsScreen;
// HACK: Store instance globally for inline onclick handlers from previous implementation
// Ideally, we should add event listeners dynamically instead of using onclick HTML attributes.
window.app = window.app || {};
window.app.screens = window.app.screens || {};
