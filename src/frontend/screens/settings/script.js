class SettingsScreen {
    constructor(app) {
        this.app = app;
        this.app.screens.settings = this; // Explicitly register for callbacks
    }

    init() {
        // Hide users tab if user doesn't have permission
        if (!this.app.currentUser.can_manage_users) {
            const usersTabBtn = document.querySelector('.tab-btn[data-tab="users"]');
            if (usersTabBtn) {
                usersTabBtn.style.display = 'none';
            }
        }
        
        // Hide backup tab if user doesn't have backup/restore permissions
        if (!this.app.currentUser.can_backup_restore) {
            const backupTabBtn = document.querySelector('.tab-btn[data-tab="backup"]');
            if (backupTabBtn) {
                backupTabBtn.style.display = 'none';
            }
        }
        
        this.showTab('shop');
    }

    refresh() {
        this.showTab('shop');
    }

    showTab(tab) {
        // Update active tab UI
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        const content = document.getElementById('settings-content');

        switch (tab) {
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
        }
    }

    async loadShopSettings() {
        try {
            const res = await this.app.api.get('/settings/shop');
            
            let s = {};
            if (res && res.settings) {
                s = res.settings;
            } else if (res && res.data) {
                s = res.data;
            } else {
                s = res || {};
            }

            document.getElementById('settings-content').innerHTML = `
                <form id="shop-settings-form">
                    <div class="form-section">
                        <h3>Shop Information</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Shop Name</label>
                                <input type="text" value="${s.shop_name || ''}" id="shop-name" class="input-field">
                            </div>
                            <div class="form-group">
                                <label>Phone</label>
                                <input type="text" value="${s.shop_phone || ''}" id="shop-phone" class="input-field">
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" value="${s.shop_email || ''}" id="shop-email" class="input-field">
                            </div>
                            <div class="form-group">
                                <label>City</label>
                                <input type="text" value="${s.shop_city || ''}" id="shop-city" class="input-field">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <textarea id="shop-address" class="input-field" rows="3">${s.shop_address || ''}</textarea>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Tax & Legal</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Owner Name</label>
                                <input type="text" value="${s.owner_name || ''}" id="owner-name" class="input-field">
                            </div>
                            <div class="form-group">
                                <label>NTN Number</label>
                                <input type="text" value="${s.shop_tax_id || ''}" id="ntn-number" class="input-field">
                            </div>
                            <div class="form-group">
                                <label>GST Number</label>
                                <input type="text" value="${s.gst_number || ''}" id="gst-number" class="input-field">
                            </div>
                            <div class="form-group">
                                <label>Currency Symbol</label>
                                <input type="text" value="${s.currency || '₹'}" id="currency-symbol" class="input-field">
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <h3>Branding</h3>
                        <div class="form-group">
                            <label>Logo Path</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" value="${s.logo_path || ''}" id="logo-path" class="input-field" style="flex: 1;">
                                <button type="button" class="btn btn-secondary" onclick="window.app.screens.settings.selectLogo()">Browse</button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Receipt Footer</label>
                            <textarea id="receipt-footer" class="input-field" rows="3">${s.receipt_footer || ''}</textarea>
                        </div>
                    </div>

                    <div class="action-buttons">
                        <button type="button" class="btn btn-primary" onclick="window.app.screens.settings.saveShop()">
                            <span>Save Changes</span>
                        </button>
                    </div>
                </form>
            `;
        } catch (e) {
            console.error('Failed to load shop settings:', e);
            document.getElementById('settings-content').innerHTML = `<div class="error-message">Failed to load shop settings: ${e.message || e}</div>`;
        }
    }

    async selectLogo() {
        try {
            if (window.pywebview && window.pywebview.api) {
                const path = await window.pywebview.api.select_file('Image Files (*.png;*.jpg;*.jpeg)');
                if (path) {
                    document.getElementById('logo-path').value = path;
                }
            } else {
                alert('File picker is only available in desktop mode.');
            }
        } catch (e) {
            console.error('Failed to select logo:', e);
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

            document.getElementById('settings-content').innerHTML = `
                <button class="btn btn-primary" onclick="window.app.screens.settings.addUser()">Add User</button>
                <table class="data-table" style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th>Username</th>
                            <th>Full Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Active</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(u => `
                            <tr>
                                <td data-label="Username">${u.username || (Array.isArray(u) ? u[1] : u[0]) || 'N/A'}</td>
                                <td data-label="Full Name">${u.full_name || (Array.isArray(u) ? u[2] : u[1]) || 'N/A'}</td>
                                <td data-label="Email">${u.email || (Array.isArray(u) ? u[3] : u[2]) || 'N/A'}</td>
                                <td data-label="Role">${u.role || (Array.isArray(u) ? u[4] : u[3]) || 'N/A'}</td>
                                <td data-label="Active">${(u.is_active !== undefined ? u.is_active : (Array.isArray(u) ? u[5] : u[4])) ? 'Yes' : 'No'}</td>
                                <td data-label="Created">${(u.created_at || (Array.isArray(u) ? u[6] : u[5]) || '').substring(0, 10)}</td>
                                <td data-label="Actions">
                                    <button class="btn-small" onclick="window.app.screens.settings.editUser(${u.id || (Array.isArray(u) ? u[0] : u.id) || 0})">Edit</button>
                                    <button class="btn-small btn-danger" onclick="window.app.screens.settings.deleteUser(${u.id || (Array.isArray(u) ? u[0] : u.id) || 0})">Deactivate</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('Failed to load users settings:', e);
            document.getElementById('settings-content').innerHTML = `<div class="error-message">Failed to load users settings: ${e.message || e}</div>`;
        }
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

            document.getElementById('settings-content').innerHTML = `
                <button class="btn btn-primary" onclick="window.app.screens.settings.addPrinter()">Add Printer</button>
                <table class="data-table" style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Type</th>
                            <th>Port</th>
                            <th>Default</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${printers.map(p => `
                            <tr>
                                <td data-label="Name">${p.printer_name || (Array.isArray(p) ? p[1] : p.name) || 'N/A'}</td>
                                <td data-label="Type">${p.printer_type || (Array.isArray(p) ? p[2] : p.type) || 'N/A'}</td>
                                <td data-label="Port">${p.connection_string || (Array.isArray(p) ? p[3] : p.connection_string) || 'N/A'}</td>
                                <td data-label="Default">${(p.is_default !== undefined ? p.is_default : (Array.isArray(p) ? p[5] : p.default)) ? 'Yes' : 'No'}</td>
                                <td data-label="Actions"><button class="btn-small" onclick="window.app.screens.settings.editPrinter(${p.id || (Array.isArray(p) ? p[0] : p.id) || 0})">Edit</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('Failed to load printer settings:', e);
            document.getElementById('settings-content').innerHTML = `<div class="error-message">Failed to load printer settings: ${e.message || e}</div>`;
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

            document.getElementById('settings-content').innerHTML = `
                <button class="btn btn-primary" onclick="window.app.screens.settings.createBackup()">Create Backup Now</button>
                <h3 style="margin-top: 20px;">Recent Backups</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Size</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${backups.map(b => `
                            <tr>
                                <td>${(b.created_at || (Array.isArray(b) ? b[3] : b.date) || '').substring(0, 10)}</td>
                                <td>${((b.file_size || (Array.isArray(b) ? b[2] : b.size) || 0)).toLocaleString()} KB</td>
                                <td><button class="btn-small" onclick="window.app.screens.settings.restoreBackup(${b.id || (Array.isArray(b) ? b[0] : b.id) || 0})">Restore</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('Failed to load backup settings:', e);
            document.getElementById('settings-content').innerHTML = `<div class="error-message">Failed to load backup settings: ${e.message || e}</div>`;
        }
    }
    
    async loadAccountSettings() {
        try {
            // Load current user information
            const user = this.app.currentUser;
            
            document.getElementById('settings-content').innerHTML = `
                <h2>Account Settings</h2>
                <div class="form-section">
                    <h3>Personal Information</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" id="account-full-name" class="input-field" value="${user.full_name || ''}" readonly>
                        </div>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="account-username" class="input-field" value="${user.username || ''}" readonly>
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <input type="text" id="account-role" class="input-field" value="${user.role_name || user.role || ''}" readonly>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h3>Change Password</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Current Password</label>
                            <input type="password" id="current-password" class="input-field" placeholder="Enter current password">
                        </div>
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="new-password" class="input-field" placeholder="Enter new password">
                        </div>
                        <div class="form-group">
                            <label>Confirm New Password</label>
                            <input type="password" id="confirm-password" class="input-field" placeholder="Confirm new password">
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button type="button" class="btn btn-primary" onclick="window.app.screens.settings.changePassword()">Change Password</button>
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('Failed to load account settings:', e);
            document.getElementById('settings-content').innerHTML = `<div class="error-message">Failed to load account settings: ${e.message || e}</div>`;
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
                shop_name: document.getElementById('shop-name').value,
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
            
            await this.app.api.put('/settings/shop', formData);
            
            this.app.showNotification('Shop settings saved successfully', 'success');
        } catch (e) {
            console.error('Failed to save shop settings:', e);
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
            }
            
            const user = users.find(u => u.id == id);
            if (!user) {
                this.app.showNotification('User not found', 'error');
                return;
            }
            
            // Show edit user form
            document.getElementById('settings-content').innerHTML = `
                <h2>Edit User</h2>
                <form id="edit-user-form">
                    <input type="hidden" id="edit-user-id" value="${user.id}">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" id="edit-username" class="input-field" value="${user.username}" required>
                    </div>
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" id="edit-full-name" class="input-field" value="${user.full_name}" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="edit-email" class="input-field" value="${user.email}">
                    </div>
                    <div class="form-group">
                        <label>New Password</label>
                        <input type="password" id="edit-password" class="input-field" placeholder="Leave blank to keep current password">
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <select id="edit-role" class="input-field">
                            <option value="shop_boy" ${user.role === 'shop_boy' ? 'selected' : ''}>Shop Boy (Cashier)</option>
                            <option value="stock_boy" ${user.role === 'stock_boy' ? 'selected' : ''}>Stock Boy</option>
                            <option value="munshi" ${user.role === 'munshi' ? 'selected' : ''}>Munshi (Manager)</option>
                            <option value="malik" ${user.role === 'malik' ? 'selected' : ''}>Malik (Owner)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Active</label>
                        <input type="checkbox" id="edit-is-active" class="input-checkbox" ${user.is_active ? 'checked' : ''}>
                    </div>
                    <button type="button" class="btn btn-primary" onclick="window.app.screens.settings.saveEditedUser()">Save Changes</button>
                    <button type="button" class="btn btn-secondary" onclick="window.app.screens.settings.loadUsersSettings()">Cancel</button>
                </form>
            `;
        } catch (e) {
            console.error('Failed to load user for editing:', e);
            this.app.showNotification('Failed to load user: ' + (e.message || e), 'error');
        }
    }
    
    async saveNewUser() {
        try {
            const userData = {
                username: document.getElementById('new-username').value,
                full_name: document.getElementById('new-full-name').value,
                email: document.getElementById('new-email').value,
                password: document.getElementById('new-password').value,
                role: document.getElementById('new-role').value,
                is_active: document.getElementById('new-is-active').checked
            };
            
            await this.app.api.post('/settings/users', userData);
            
            this.app.showNotification('User created successfully', 'success');
            this.loadUsersSettings(); // Refresh the user list
        } catch (e) {
            console.error('Failed to create user:', e);
            this.app.showNotification('Failed to create user: ' + (e.message || e), 'error');
        }
    }
    
    async saveEditedUser() {
        try {
            const userId = document.getElementById('edit-user-id').value;
            const userData = {
                full_name: document.getElementById('edit-full-name').value,
                email: document.getElementById('edit-email').value,
                role: document.getElementById('edit-role').value,
                is_active: document.getElementById('edit-is-active').checked
            };
            
            // Add password if it was entered
            const newPassword = document.getElementById('edit-password').value;
            if (newPassword) {
                userData.password = newPassword;
            }
            
            await this.app.api.put(`/settings/users/${userId}`, userData);
            
            this.app.showNotification('User updated successfully', 'success');
            this.loadUsersSettings(); // Refresh the user list
        } catch (e) {
            console.error('Failed to update user:', e);
            this.app.showNotification('Failed to update user: ' + (e.message || e), 'error');
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
        
        this.app.showNotification('Restore backup functionality needs implementation', 'info');
    }
}

window.SettingsScreen = SettingsScreen;
// HACK: Store instance globally for inline onclick handlers from previous implementation
// Ideally, we should add event listeners dynamically instead of using onclick HTML attributes.
window.app = window.app || {};
window.app.screens = window.app.screens || {};
